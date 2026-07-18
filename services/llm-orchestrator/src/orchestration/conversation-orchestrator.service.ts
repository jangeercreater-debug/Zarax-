import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER_REGISTRY, type AiProviderRegistry, type ChatMessage } from '@zarax/ai-sdk';
import { AgentRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { MeteringService } from '@zarax/metering';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import type { TenantId } from '@zarax/shared-types';

import { ConversationStateService } from '../conversation-state/conversation-state.service';
import { RagClient } from '../rag-client/rag-client';
import { ToolCatalogClient } from '../tool-catalog/tool-catalog.client';
import { ToolCallBroker } from '../tool-broker/tool-call-broker';
import {
  AGENT_RUNTIME_CONFIG_DEFAULTS,
  resolveAgentRuntimeConfig,
  type AgentRuntimeConfig,
} from './agent-runtime-config';
import type { ConversationTurnResponseDto } from './dto/conversation-turn-response.dto';

const FALLBACK_RESPONSE_TEXT =
  "I'm having trouble completing that request right now — could you try again in a moment?";

/** How `responseStyle` actually takes effect — providers have no first-class
 * "response style" API parameter, so this is folded into the system prompt as a
 * plain-language instruction. Only applied on the first turn (where the system
 * prompt is seeded) — same as the system prompt itself. */
const RESPONSE_STYLE_HINTS: Record<NonNullable<AgentRuntimeConfig['responseStyle']>, string> = {
  concise: 'Keep your responses brief and to the point — a sentence or two where possible.',
  balanced: '',
  detailed: 'Feel free to give thorough, detailed responses that fully address the question.',
};

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
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
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

    const provider = runtimeConfig.provider ?? AGENT_RUNTIME_CONFIG_DEFAULTS.provider;
    const model = runtimeConfig.model ?? AGENT_RUNTIME_CONFIG_DEFAULTS.model;
    const fallbackProviders = runtimeConfig.fallbackProviders ?? AGENT_RUNTIME_CONFIG_DEFAULTS.fallbackProviders;
    const maxIterations = runtimeConfig.maxToolIterations ?? AGENT_RUNTIME_CONFIG_DEFAULTS.maxToolIterations;

    let history = await this.conversationState.getHistory(tenantId, callId);

    if (history.length === 0 && runtimeConfig.systemPrompt) {
      const styleHint = RESPONSE_STYLE_HINTS[runtimeConfig.responseStyle ?? 'balanced'];
      const systemPrompt = styleHint
        ? `${runtimeConfig.systemPrompt}\n\n${styleHint}`
        : runtimeConfig.systemPrompt;
      history = [{ role: 'system', content: systemPrompt }];
    }

    if (runtimeConfig.ragEnabled ?? AGENT_RUNTIME_CONFIG_DEFAULTS.ragEnabled) {
      history = await this.augmentWithRagContext(tenantId, history, userText);
    }

    history = [...history, { role: 'user', content: userText }];

    const tools = await this.resolveEnabledTools(runtimeConfig);

    const { finalText, shouldEndCall, endCallReason, updatedHistory } = await this.runCompletionLoop({
      tenantId,
      callId,
      agentId,
      provider,
      model,
      fallbackProviders: fallbackProviders,
      temperature: runtimeConfig.temperature,
      maxTokens: runtimeConfig.maxTokens,
      maxIterations,
      history,
      tools,
    });

    await this.conversationState.saveHistory(tenantId, callId, updatedHistory);

    return { response: finalText, shouldEndCall, endCallReason };
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
      // RAG is an enhancement, not a hard dependency — a failed lookup degrades to
      // "answer without extra context" rather than failing the whole turn.
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

      // Cost/usage tracking — see docs/production-standards.md item #4/#5. Recording
      // must never fail the conversation turn over a metering hiccup.
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
