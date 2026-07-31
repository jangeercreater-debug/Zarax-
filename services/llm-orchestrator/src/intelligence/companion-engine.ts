import { Injectable } from '@nestjs/common';

export interface CompanionContext {
  timeGreeting: string;
  timeOfDay: 'morning' | 'afternoon' | 'evening' | 'night';
  dayOfWeek: string;
  isFirstInteraction: boolean;
  isReturningUser: boolean;
  lastSeenText: string;
  relationshipHint: string;
}

@Injectable()
export class CompanionEngine {

  buildContext(conversationLength: number, userTimezoneOffset?: number): CompanionContext {
    const now = new Date();
    if (userTimezoneOffset) {
      now.setMinutes(now.getMinutes() + userTimezoneOffset);
    }

    const hour = now.getHours();
    const timeOfDay = this.getTimeOfDay(hour);
    const timeGreeting = this.getTimeGreeting(hour);
    const dayOfWeek = this.getDayName(now.getDay());
    const isFirstInteraction = conversationLength === 0;
    const isReturningUser = conversationLength > 0;

    return {
      timeGreeting,
      timeOfDay,
      dayOfWeek,
      isFirstInteraction,
      isReturningUser,
      lastSeenText: isReturningUser ? 'We have talked before.' : 'This is our first conversation.',
      relationshipHint: this.getRelationshipHint(conversationLength),
    };
  }

  generateContextPrompt(ctx: CompanionContext): string {
    const parts: string[] = [];

    parts.push(`[Current time context] It is ${ctx.timeOfDay} (${ctx.timeGreeting}). Today is ${ctx.dayOfWeek}.`);

    if (ctx.isFirstInteraction) {
      parts.push('[Relationship] This is the first time you are talking to this user. Be warm and welcoming. Ask their name naturally.');
    } else {
      parts.push(`[Relationship] ${ctx.lastSeenText} ${ctx.relationshipHint}`);
    }

    parts.push(this.getTimeBasedBehavior(ctx.timeOfDay));

    return parts.join('\n');
  }

  private getTimeOfDay(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
    if (hour >= 5 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 17) return 'afternoon';
    if (hour >= 17 && hour < 21) return 'evening';
    return 'night';
  }

  private getTimeGreeting(hour: number): string {
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    if (hour >= 17 && hour < 21) return 'Good evening';
    return 'Hey, still awake?';
  }

  private getDayName(day: number): string {
    return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day] ?? 'today';
  }

  private getRelationshipHint(turns: number): string {
    if (turns < 5) return 'You are still getting to know this user. Be curious and ask questions.';
    if (turns < 20) return 'You know this user a bit now. Be friendly and reference past topics naturally.';
    if (turns < 50) return 'You have a good relationship with this user. Be comfortable and natural.';
    return 'You and this user are close friends. Be very natural, warm, and personal.';
  }

  private getTimeBasedBehavior(timeOfDay: string): string {
    switch (timeOfDay) {
      case 'morning':
        return '[Time behavior] Be energetic and positive. Ask about their plans for the day.';
      case 'afternoon':
        return '[Time behavior] Be relaxed and friendly. Ask how their day is going.';
      case 'evening':
        return '[Time behavior] Be calm and warm. Ask about their day or plans for the evening.';
      case 'night':
        return '[Time behavior] Be gentle and calm. If its very late, gently suggest rest. Be caring.';
      default:
        return '';
    }
  }
}
