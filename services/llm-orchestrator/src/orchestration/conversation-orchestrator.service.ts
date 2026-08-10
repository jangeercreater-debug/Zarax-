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
import { IntentDetector } from '../intelligence/intent-detector';
import { DecisionEngine } from '../intelligence/decision-engine';
import { ConversationIntelligence } from '../intelligence/conversation-intelligence';
import { CompanionEngine } from '../intelligence/companion-engine';
import { HabitsTracker } from '../intelligence/habits-tracker';
import { ZARAX_SYSTEM_PROMPT } from './zarax-personality';
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

// Always available regardless of the agent's configured enabledTools — remembering
// what the caller tells her is core to Zarax's identity (Phase 5: Persistent Memory
// Engine), not an opt-in integration like a CRM or calendar tool.
const ALWAYS_ON_TOOLS = ['remember_memory'];

/** True for the built-in Zarax companion agent — matched by name since that's the
 * only per-agent signal available (no dedicated "isZarax" flag on the Agent model).
 * Every other agent keeps using whatever systemPrompt is configured in the database,
 * unaffected. */
function isZaraxAgent(agentName: string): boolean {
  return agentName.trim().toLowerCase() === 'zarax';
}

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
    private readonly intentDetector: IntentDetector,
    private readonly decisionEngine: DecisionEngine,
    private readonly conversationIntelligence: ConversationIntelligence,
    private readonly companionEngine: CompanionEngine,
    private readonly habitsTracker: HabitsTracker,
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
    const isZarax = isZaraxAgent(agent.name);

    const provider = runtimeConfig.provider ?? AGENT_RUNTIME_CONFIG_DEFAULTS.provider;
    const model = runtimeConfig.model ?? AGENT_RUNTIME_CONFIG_DEFAULTS.model;
    const fallbackProviders = runtimeConfig.fallbackProviders ?? AGENT_RUNTIME_CONFIG_DEFAULTS.fallbackProviders;
    const maxIterations = runtimeConfig.maxToolIterations ?? AGENT_RUNTIME_CONFIG_DEFAULTS.maxToolIterations;

    let history = await this.conversationState.getHistory(tenantId, callId);
    const isFirstTurn = history.length === 0;

    if (isFirstTurn) {
      // Zarax's personality is hardcoded and always wins over whatever systemPrompt
      // happens to be saved on the agent row — she is not configurable per-tenant.
      // Any other agent keeps using its own configured systemPrompt unchanged.
      const basePrompt = isZarax ? ZARAX_SYSTEM_PROMPT : runtimeConfig.systemPrompt;
      if (basePrompt) {
        const styleHint = RESPONSE_STYLE_HINTS[runtimeConfig.responseStyle ?? 'balanced'];
        const systemPrompt = styleHint ? `${basePrompt}\n\n${styleHint}` : basePrompt;
        history = [{ role: 'system', content: systemPrompt }];
      }

      if (isZarax) {
        try {
          const habits = await this.habitsTracker.getHabits(tenantId, '');
          const companion = this.companionEngine.buildContext(habits.totalConversations);
          history = [...history, { role: 'system', content: this.companionEngine.generateContextPrompt(companion) }];
          const habitsPrompt = this.habitsTracker.generateHabitsPrompt(habits);
          if (habitsPrompt) history = [...history, { role: 'system', content: habitsPrompt }];
        } catch (error) {
          // Companion/habits context is enrichment, not critical to answering the call.
          this.logger.warn('Companion/habits context failed; continuing without it', {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    if (runtimeConfig.ragEnabled ?? AGENT_RUNTIME_CONFIG_DEFAULTS.ragEnabled) {
      history = await this.augmentWithRagContext(tenantId, history, userText);
    }

    // Persistent memory recall (Phase 5) — real semantic + ranked recall via
    // services/api's internal/memory endpoint, not a stub.
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

    // Intent detection + reasoning
    const intent = this.intentDetector.detect(userText);
    const decision = this.decisionEngine.decide(intent.intent);

    if (decision.reasoning.contextHint) {
      history = [...history, { role: 'system', content: `[Reasoning hint] ${decision.reasoning.contextHint}\n[Pacing] ${decision.reasoning.pacingHint}` }];
    }

    // Conversation intelligence: topic tracking, question memory, repetition prevention
    const contextHint = this.conversationIntelligence.processUserTurn(callId, userText);
    if (contextHint) {
      history = [...history, { role: 'system', content: contextHint }];
    }

    const antiRepetitionHint = this.conversationIntelligence.getAntiRepetitionHint(callId);
    if (antiRepetitionHint) {
      history = [...history, { role: 'system', content: antiRepetitionHint }];
    }

    const followUpHint = this.conversationIntelligence.getFollowUpHint(callId);
    if (followUpHint) {
      history = [...history, { role: 'system', content: followUpHint }];
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
      temperature: decision.reasoning.temperature ?? runtimeConfig.temperature,
      maxTokens: decision.reasoning.maxTokens ?? runtimeConfig.maxTokens,
      maxIterations,
      history,
      tools,
    });

    await this.conversationState.saveHistory(tenantId, callId, updatedHistory);

    // Track assistant response for repetition prevention
    this.conversationIntelligence.processAssistantTurn(callId, finalText);

    if (shouldEndCall) {
      this.conversationIntelligence.cleanup(callId);
    }

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
      this.logger.warn('RAG context lookup failed; continuing without it', {
        message: error instanceof Error ? error.message : String(error),
      });
      return history;
    }
  }

  private async resolveEnabledTools(runtimeConfig: AgentRuntimeConfig) {
    const configuredNames = runtimeConfig.enabledTools ?? [];
    const wantedNames = new Set([...configuredNames, ...ALWAYS_ON_TOOLS]);

    try {
      const catalog = await this.toolCatalog.getAvailableTools();
      const enabled = catalog.filter((tool) => wantedNames.has(tool.name));
      return enabled.length > 0 ? enabled : undefined;
    } catch (error) {
      // Falling back to no tools keeps the conversation working even if
      // tool-executor is briefly unreachable — losing remember_memory for one
      // turn is far better than failing the whole call.
      this.logger.warn('Tool catalog lookup failed; continuing without tools', {
        message: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
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
