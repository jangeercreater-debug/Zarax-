import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';

export interface UserHabits {
  totalConversations: number;
  preferredLanguage: string | null;
  commonTopics: string[];
  averageSessionLength: number;
  firstInteraction: string | null;
  lastInteraction: string | null;
}

@Injectable()
export class HabitsTracker {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async getHabits(tenantId: string, userId: string): Promise<UserHabits> {
    const [totalCalls, memories, firstCall, lastCall] = await Promise.all([
      this.prisma.call.count({
        where: { tenantId },
      }).catch(() => 0),
      this.prisma.userMemory.findMany({
        where: { tenantId, userId, category: 'preference' },
        take: 10,
        orderBy: { importance: 'desc' },
      }).catch(() => []),
      this.prisma.call.findFirst({
        where: { tenantId },
        orderBy: { startedAt: 'asc' },
        select: { startedAt: true },
      }).catch(() => null),
      this.prisma.call.findFirst({
        where: { tenantId },
        orderBy: { startedAt: 'desc' },
        select: { startedAt: true },
      }).catch(() => null),
    ]);

    const preferredLang = memories.find(
      (m) => m.key === 'language' || m.key === 'preferred_language',
    );

    const topics = memories
      .filter((m) => m.key !== 'language')
      .map((m) => String(m.key ?? m.category))
      .slice(0, 5);

    return {
      totalConversations: totalCalls,
      preferredLanguage: preferredLang ? String(preferredLang.value) : null,
      commonTopics: topics,
      averageSessionLength: 0,
      firstInteraction: firstCall?.startedAt?.toISOString() ?? null,
      lastInteraction: lastCall?.startedAt?.toISOString() ?? null,
    };
  }

  generateHabitsPrompt(habits: UserHabits): string {
    const parts: string[] = [];

    if (habits.totalConversations > 0) {
      parts.push(`[User history] You have had ${habits.totalConversations} conversations with this user.`);
    }

    if (habits.preferredLanguage) {
      parts.push(`[Language preference] User prefers: ${habits.preferredLanguage}. Use this language by default.`);
    }

    if (habits.commonTopics.length > 0) {
      parts.push(`[User interests] Topics they care about: ${habits.commonTopics.join(', ')}.`);
    }

    if (habits.firstInteraction) {
      const days = Math.floor((Date.now() - new Date(habits.firstInteraction).getTime()) / (1000 * 60 * 60 * 24));
      if (days > 0) {
        parts.push(`[Relationship duration] You have known this user for ${days} days.`);
      }
    }

    return parts.join('\n');
  }
}
