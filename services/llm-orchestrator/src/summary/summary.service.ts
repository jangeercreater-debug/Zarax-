import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER_REGISTRY, type AiProviderRegistry } from '@zarax/ai-sdk';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { ZARAX_LOGGER, type ZaraxLogger } from '@zarax/shared-logger';
import type { TenantId } from '@zarax/shared-types';

import { ConversationStateService } from '../conversation-state/conversation-state.service';

const SUMMARY_PROMPT = `Analyze this conversation and provide a JSON response with:
1. "summary": A 2-3 sentence summary of what was discussed
2. "keyPoints": An array of key facts, decisions, or action items mentioned
3. "mood": The overall mood of the user (happy, neutral, frustrated, curious, sad)

Respond ONLY with valid JSON, no markdown.`;

@Injectable()
export class SummaryService {
  constructor(
    private readonly conversationState: ConversationStateService,
    @Inject(AI_PROVIDER_REGISTRY) private readonly aiRegistry: AiProviderRegistry,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(ZARAX_LOGGER) private readonly logger: ZaraxLogger,
  ) {}

  async generateAndStore(tenantId: TenantId, callId: string, userId: string): Promise<void> {
    try {
      const history = await this.conversationState.getHistory(tenantId, callId);
      if (history.length < 2) return;

      const transcript = history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => `${m.role}: ${m.content}`)
        .join('\n');

      if (transcript.length < 20) return;

      const provider = this.aiRegistry.get('anthropic');
      const completion = await provider.complete({
        model: 'claude-sonnet-4-5-20241022',
        messages: [
          { role: 'system', content: SUMMARY_PROMPT },
          { role: 'user', content: transcript },
        ],
        temperature: 0.3,
        maxTokens: 300,
      });

      let parsed: { summary: string; keyPoints: string[]; mood: string };
      try {
        parsed = JSON.parse(completion.content) as { summary: string; keyPoints: string[]; mood: string };
      } catch {
        parsed = { summary: completion.content, keyPoints: [], mood: 'neutral' };
      }

      await this.prisma.conversationSummary.create({
        data: {
          userId,
          tenantId,
          callId,
          summary: parsed.summary,
          keyPoints: parsed.keyPoints,
          mood: parsed.mood,
        },
      });

      this.logger.log('SummaryService: conversation summary stored', { callId, mood: parsed.mood });
    } catch (error) {
      this.logger.error('SummaryService: failed to generate summary', {
        callId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
