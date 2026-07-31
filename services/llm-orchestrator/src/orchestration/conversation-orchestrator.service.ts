import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER_REGISTRY, type AiProviderRegistry, type ChatMessage } from '@zarax/ai-sdk';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { MeteringService } from '@zarax/metering';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import type { TenantId } from '@zarax/shared-types';

import { ConversationStateService } from '../conversation-state/conversation-state.service';
import { RagClient } from '../rag-client/rag-client';
import { MemoryClient } from '../memory-client/memory-client';
import { ToolCatalogClient } from '../tool-catalog/tool-catalog.client';
import { ToolCallBroker } from '../tool-broker/tool-call-broker';
import { ZARAX_SYSTEM_PROMPT, ZARAX_CONFIG } from './zarax-personality';
import {
  AGENT_RUNTIME_CONFIG_DEFAULTS,
  resolveAgentRuntimeConfig,
  type AgentRuntimeConfig,
} from './agent-runtime-config';
import type { ConversationTurnResponseDto } from './dto/conversation-turn-response.dto';

const FALLBACK_RESPONSE_TEXT =
  "I'm having trouble completing that request right now — could you try again in a moment?";

const RESPONSE_STYLE_HINTS: Record<NonNullable<AgentRuntimeConfig['responseStyle']>, string> = {
  concise: 'Keep your responses brief and to the point — a sentence or two where possible.',
  balanced: '',
  detailed: 'Feel free to give thorough, detailed responses that fully address the question.',
};

const REMEMBER_TRIGGERS = [
  'remember', 'yaad rakh', 'yaad rakho', 'yaad kar', 'save this',
  'note this', 'store this', 'save kar', 'note kar', 'likh le',
  'save karo', 'remember kar', 'memorize', 'dont forget', 'mat bhulna',
];

const MEMORY_EXTRACT_PROMPT = `Extract the memory from this user message. Respond ONLY with valid JSON:
{"category": "contact|note|preference|task|fact", "key": "short identifier or null", "value": "the information to remember", "importance": 1-5}

If no memory to extract, respond: {"skip": true}`;

@Injectable()
export class ConversationOrchestratorService {
  private readonly agentRepository: AgentRepository;
  private readonly meteringService: MeteringService;

  constructor(
    private readonly conversationState: ConversationStateService,
    @Inject(AI_PROVIDER_REGISTRY) private readonly aiRegistry: AiProviderRegistry,
    private readonly toolCatalog: ToolCatalogClient,
    private readonly toolBroker: ToolCallBroker,
    private readonly ragClient: RagClient,
    private readonly memoryClient: MemoryClient,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {
    this.agentRepository = new AgentRepository(prisma);
    this.meteringService = new MeteringService(prisma);
  }

  async handleTurn(
    tenantId: TenantId,
    callId: string,
    agentId: string,
    userText: string,
  ): Promise<ConversationTurnResponseDto> {
    const agent = await this.agentRepository.findByIdForTenantOrThrow(tenantId, agentId);
    const runtimeConfig = resolveAgentRuntimeConfig(agent.config);

    // Auto-detect Zarax agent and inject personality
    const isZarax = agent.name?.toLowerCase() === 'zarax';
    const effectiveSystemPrompt = isZarax
      ? ZARAX_SYSTEM_PROMPT
      : runtimeConfig.systemPrompt;
    const effectiveMaxTokens = isZarax
      ? ZARAX_CONFIG.maxTokens
      : runtimeConfig.maxTokens;
    const effectiveTemperature = isZarax
      ? ZARAX_CONFIG.temperature
      : runtimeConfig.temperature;

    const provider = runtimeConfig.provider ?? AGENT_RUNTIME_CONFIG_DEFAULTS.provider;
    const model = runtimeConfig.model ?? AGENT_RUNTIME_CONFIG_DEFAULTS.model;
    const fallbackProviders = runtimeConfig.fallbackProviders ?? AGENT_RUNTIME_CONFIG_DEFAULTS.fallbackProviders;
    const maxIterations = runtimeConfig.maxToolIterations ?? AGENT_RUNTIME_CONFIG_DEFAULTS.maxToolIterations;

    let history = await this.conversationState.getHistory(tenantId, callId);

    if (history.length === 0 && effectiveSystemPrompt) {
      const styleHint = isZarax ? '' : RESPONSE_STYLE_HINTS[runtimeConfig.responseStyle ?? 'balanced'];
      const systemPrompt = styleHint
        ? `${effectiveSystemPrompt}\n\n${styleHint}`
        : effectiveSystemPrompt;
      history = [{ role: 'system', content: systemPrompt }];
    }

    if (runtimeConfig.ragEnabled ?? AGENT_RUNTIME_CONFIG_DEFAULTS.ragEnabled) {
      history = await this.augmentWithRagContext(tenantId, history, userText);
    }

    // Memory retrieval - inject relevant memories into context
    try {
      const memories = await this.memoryClient.recall(tenantId, '', userText);
      if (memories.length > 0) {
        const memoryContext = memories
          .map((m) => `[${m.category}] ${m.key ? m.key + ': ' : ''}${JSON.stringify(m.value)}`)
          .join('\n');
        history = [...history, { role: 'system', content: `User memories:\n${memoryContext}` }];
      }
    } catch {
      // Memory is enhancement, not critical
    }

    // Auto-detect "remember this" and store memory
    void this.detectAndStoreMemory(tenantId, callId, userText).catch(() => undefined);

    history = [...history, { role: 'user', content: userText }];

    const tools = await this.resolveEnabledTools(runtimeConfig);

    const { finalText, shouldEndCall, endCallReason, updatedHistory } = await this.runCompletionLoop({
      tenantId,
      callId,
      agentId,
      provider,
      model,
      fallbackProviders: fallbackProviders,
      temperature: effectiveTemperature,
      maxTokens: effectiveMaxTokens,
      maxIterations,
      history,
      tools,
    });

    await this.conversationState.saveHistory(tenantId, callId, updatedHistory);

    return { response: finalText, shouldEndCall, endCallReason };
  }

  private async detectAndStoreMemory(tenantId: TenantId, callId: string, userText: string): Promise<void> {
    const lower = userText.toLowerCase();
    const shouldExtract = REMEMBER_TRIGGERS.some((t) => lower.includes(t));
    if (!shouldExtract) return;

    try {
      const provider = this.aiRegistry.get('anthropic');
      const extraction = await provider.complete({
        model: 'claude-sonnet-4-5-20241022',
        messages: [
          { role: 'system', content: MEMORY_EXTRACT_PROMPT },
          { role: 'user', content: userText },
        ],
        temperature: 0.1,
        maxTokens: 200,
      });

      const parsed = JSON.parse(extraction.content) as Record<string, unknown>;
      if (parsed.skip) return;

      await this.prisma.userMemory.create({
        data: {
          userId: '',
          tenantId,
          category: String(parsed.category ?? 'note'),
          key: parsed.key ? String(parsed.key) : null,
          value: parsed.value as never,
          source: 'voice',
          callId,
          importance: Number(parsed.importance ?? 1),
        },
      });

      this.logger.log('Memory auto-stored from voice', { callId, category: parsed.category });
    } catch (error) {
      this.logger.warn('Memory extraction failed', {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async augmentWithRagContext(
    tenantId: TenantId,
    history: ChatMessage[],
    userText: string,
  ): Promise<ChatMessage[]> {
    try {
      const results = await this.ragClient.search(tenantId, userText);
      if (results.length === 0) return history;

      const context = results.map((r) => `- ${r.text}`).join('\n');
      return [...history, { role: 'system', content: `Relevant context for this question:\n${context}` }];
    } catch (error) {
      this.logger.warn('RAG context lookup failed; continuing without it', {
        message: error instanceof Error ? error.message : String(error),
      });
      return history;
    }
  }

  private async resolveEnabledTools(runtimeConfig: AgentRuntimeConfig) {
    if (!runtimeConfig.enabledTools || runtimeConfig.enabledTools.length === 0) return undefined;

    const catalog = await this.toolCatalog.getAvailableTools();
    const enabled = catalog.filter((tool) => runtimeConfig.enabledTools?.includes(tool.name));
    return enabled.length > 0 ? enabled : undefined;
  }

  private async runCompletionLoop(params: {
    tenantId: TenantId;
    callId: string;
    agentId: string;
    provider: NonNullable<AgentRuntimeConfig['provider']>;
    model: string;
    fallbackProviders?: AgentRuntimeConfig['fallbackProviders'];
    temperature?: number;
    maxTokens?: number;
    maxIterations: number;
    history: ChatMessage[];
    tools: Awaited<ReturnType<ToolCatalogClient['getAvailableTools']>> | undefined;
  }): Promise<{
    finalText: string;
    shouldEndCall: boolean;
    endCallReason?: string;
    updatedHistory: ChatMessage[];
  }> {
    let history = params.history;
    let shouldEndCall = false;
    let endCallReason: string | undefined;
    let finalText = FALLBACK_RESPONSE_TEXT;

    for (let iteration = 0; iteration < params.maxIterations; iteration++) {
      const completion = params.fallbackProviders?.length
        ? await this.aiRegistry.completeWithFallback([params.provider, ...params.fallbackProviders], {
            model: params.model,
            messages: history,
            tools: params.tools,
            temperature: params.temperature,
            maxTokens: params.maxTokens,
          })
        : await this.aiRegistry.get(params.provider).complete({
            model: params.model,
            messages: history,
            tools: params.tools,
            temperature: params.temperature,
            maxTokens: params.maxTokens,
          });

      this.meteringService
        .recordLlmUsage({
          tenantId: params.tenantId,
          provider: params.provider,
          model: params.model,
          inputTokens: completion.usage.inputTokens,
          outputTokens: completion.usage.outputTokens,
          callId: params.callId,
        })
        .catch((error: unknown) => {
          this.logger.warn('Failed to record LLM usage/cost metering', {
            message: error instanceof Error ? error.message : String(error),
          });
        });

      if (completion.toolCalls.length === 0) {
        finalText = completion.content;
        history = [...history, { role: 'assistant', content: completion.content }];
        break;
      }

      history = [
        ...history,
        { role: 'assistant', content: completion.content, toolCalls: completion.toolCalls },
      ];

      for (const toolCall of completion.toolCalls) {
        const outcome = await this.toolBroker
          .requestToolExecution({
            tenantId: params.tenantId,
            callId: params.callId,
            agentId: params.agentId,
            toolName: toolCall.name,
            arguments: toolCall.arguments,
          })
          .catch((error: unknown) => ({
            status: 'failure' as const,
            errorMessage: error instanceof Error ? error.message : 'Tool call failed',
            result: undefined,
          }));

        if (toolCall.name === 'end_call' && outcome.status === 'success' && outcome.result?.shouldEndCall) {
          shouldEndCall = true;
          endCallReason = outcome.result.reason as string | undefined;
        }

        history = [
          ...history,
          {
            role: 'tool',
            toolCallId: toolCall.id,
            content: JSON.stringify(
              outcome.status === 'success' ? outcome.result : { error: outcome.errorMessage },
            ),
          },
        ];
      }
    }

    return { finalText, shouldEndCall, endCallReason, updatedHistory: history };
  }
}
