import { Inject, Injectable } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';

export interface UserHabits {
  totalConversations: number;
  preferredLanguage: string | null;
  commonTopics: string[];
  averageSessionLength: number;
  firstInteraction: string | null;
  lastInteraction: string | null;
  recentMoods: string[];
  dominantMood: string;
}

@Injectable()
export class HabitsTracker {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  async getHabits(tenantId: string, userId: string): Promise<UserHabits> {
    const [totalCalls, memories, firstCall, lastCall, recentSummaries] = await Promise.all([
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
      this.prisma.conversationSummary.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { mood: true },
      }).catch(() => []),
    ]);

    const preferredLang = memories.find(
      (m) => m.key === 'language' || m.key === 'preferred_language',
    );

    const topics = memories
      .filter((m) => m.key !== 'language')
      .map((m) => String(m.key ?? m.category))
      .slice(0, 5);

    const recentMoods = recentSummaries
      .map((s) => s.mood)
      .filter((m): m is string => Boolean(m));

    const dominantMood = this.getDominantMood(recentMoods);

    return {
      totalConversations: totalCalls,
      preferredLanguage: preferredLang ? String(preferredLang.value) : null,
      commonTopics: topics,
      averageSessionLength: 0,
      firstInteraction: firstCall?.startedAt?.toISOString() ?? null,
      lastInteraction: lastCall?.startedAt?.toISOString() ?? null,
      recentMoods,
      dominantMood,
    };
  }

  private getDominantMood(moods: string[]): string {
    if (moods.length === 0) return 'neutral';
    const counts: Record<string, number> = {};
    for (const m of moods) {
      counts[m] = (counts[m] ?? 0) + 1;
    }
    let max = 0;
    let dominant = 'neutral';
    for (const [mood, count] of Object.entries(counts)) {
      if (count > max) { max = count; dominant = mood; }
    }
    return dominant;
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

    if (habits.recentMoods.length > 0) {
      parts.push(`[Recent moods] User's recent moods: ${habits.recentMoods.join(', ')}. Dominant mood: ${habits.dominantMood}.`);
      if (habits.dominantMood === 'sad' || habits.dominantMood === 'frustrated') {
        parts.push('[Mood guidance] User has been feeling down recently. Be extra caring and gentle.');
      } else if (habits.dominantMood === 'happy') {
        parts.push('[Mood guidance] User has been in good spirits. Match their positive energy.');
      }
    }

    return parts.join('\n');
  }
}
