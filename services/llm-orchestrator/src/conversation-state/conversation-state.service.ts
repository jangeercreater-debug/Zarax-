import { Inject, Injectable } from '@nestjs/common';
import type { ChatMessage } from '@zarax/ai-sdk';
import { CacheService, REDIS_CACHE } from '@zarax/redis-client';
import type { TenantId } from '@zarax/shared-types';

const HISTORY_KEY_PREFIX = 'conversation:';
// A call is expected to last minutes, not hours — this is generous headroom, not an
// attempt to persist conversations long-term (that's services/api's Call/transcript
// storage, a future milestone, not this in-flight working memory).
const HISTORY_TTL_SECONDS = 60 * 60 * 2;

@Injectable()
export class ConversationStateService {
  constructor(@Inject(REDIS_CACHE) private readonly cache: CacheService) {}

  async getHistory(tenantId: TenantId, callId: string): Promise<ChatMessage[]> {
    const history = await this.cache.get<ChatMessage[]>(tenantId, HISTORY_KEY_PREFIX + callId);
    return history ?? [];
  }

  async saveHistory(tenantId: TenantId, callId: string, messages: ChatMessage[]): Promise<void> {
    await this.cache.set(tenantId, HISTORY_KEY_PREFIX + callId, messages, HISTORY_TTL_SECONDS);
  }

  async appendMessages(tenantId: TenantId, callId: string, newMessages: ChatMessage[]): Promise<ChatMessage[]> {
    const existing = await this.getHistory(tenantId, callId);
    const updated = [...existing, ...newMessages];
    await this.saveHistory(tenantId, callId, updated);
    return updated;
  }

  async clearHistory(tenantId: TenantId, callId: string): Promise<void> {
    await this.cache.delete(tenantId, HISTORY_KEY_PREFIX + callId);
  }
}
