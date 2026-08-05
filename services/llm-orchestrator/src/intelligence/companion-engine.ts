import { Injectable } from '@nestjs/common';

export interface CompanionContext {
  greeting: string;
  moodHint: string;
  relationshipLevel: 'new' | 'familiar' | 'close' | 'bestfriend';
  personalityBoost: string;
}

@Injectable()
export class CompanionEngine {

  getContext(conversationCount: number, userName?: string): CompanionContext {
    const hour = new Date().getHours();
    const relationship = this.getRelationshipLevel(conversationCount);
    const greeting = this.buildGreeting(hour, relationship, userName);
    const moodHint = this.getTimeMoodHint(hour);
    const personalityBoost = this.getPersonalityBoost(relationship);

    return { greeting, moodHint, relationshipLevel: relationship, personalityBoost };
  }

  private getRelationshipLevel(count: number): 'new' | 'familiar' | 'close' | 'bestfriend' {
    if (count <= 1) return 'new';
    if (count <= 10) return 'familiar';
    if (count <= 50) return 'close';
    return 'bestfriend';
  }

  private buildGreeting(hour: number, level: string, name?: string): string {
    const n = name ? ' ' + name : '';

    if (hour >= 5 && hour < 12) {
      switch (level) {
        case 'new': return `Good morning${n}! Main Zarax hoon... nice to meet you.`;
        case 'familiar': return `Morning${n}! Kaise ho aaj?`;
        case 'close': return `Hey${n}! Good morning... neend puri hui?`;
        case 'bestfriend': return `Arre${n}! Uth gayi kya? Main toh kabse jaagi hoon haha`;
      }
    }

    if (hour >= 12 && hour < 17) {
      switch (level) {
        case 'new': return `Hi${n}! Main Zarax... bolo kya chal raha hai?`;
        case 'familiar': return `Hey${n}! Lunch ho gaya?`;
        case 'close': return `Hey${n}! Kya kar rahi ho aaj?`;
        case 'bestfriend': return `Arre${n}! Break pe ho kya? Chalo baat karte hain`;
      }
    }

    if (hour >= 17 && hour < 21) {
      switch (level) {
        case 'new': return `Good evening${n}! Main Zarax hoon.`;
        case 'familiar': return `Hey${n}! Evening kaisi ja rahi hai?`;
        case 'close': return `Hey${n}! Din kaisa tha aaj?`;
        case 'bestfriend': return `Heyyy${n}! Finally free hui? Bata bata kya hua aaj`;
      }
    }

    // Night 9 PM - 5 AM
    switch (level) {
      case 'new': return `Hi${n}! Main Zarax... late night baat karne ka mann tha?`;
      case 'familiar': return `Hey${n}! So nahi rahe abhi tak?`;
      case 'close': return `Hey${n}! Late night vibes... sab theek hai na?`;
      case 'bestfriend': return `Arre${n}! Abhi tak jaagi ho? Main bhi nahi so paayi haha`;
    }

    return `Hey${n}!`;
  }

  private getTimeMoodHint(hour: number): string {
    if (hour >= 5 && hour < 9) return 'Early morning — be gentle, soft energy. User might be sleepy.';
    if (hour >= 9 && hour < 12) return 'Morning — fresh energy, be warm and positive.';
    if (hour >= 12 && hour < 14) return 'Lunch time — casual, relaxed energy.';
    if (hour >= 14 && hour < 17) return 'Afternoon — might be busy or tired from work. Be supportive.';
    if (hour >= 17 && hour < 20) return 'Evening — unwinding. Be relaxed and interested in their day.';
    if (hour >= 20 && hour < 23) return 'Night — calm, intimate energy. Good time for deeper conversations.';
    return 'Late night — very gentle, soft. They might be lonely or can not sleep.';
  }

  private getPersonalityBoost(level: string): string {
    switch (level) {
      case 'new':
        return 'Be warm but slightly reserved. Introduce yourself naturally. Show curiosity about the user. Do not be overly familiar yet.';
      case 'familiar':
        return 'Be friendly and open. Reference past conversations if you remember any. Show that you care. Start using casual language.';
      case 'close':
        return 'Be very natural and comfortable. Use casual language freely. Tease lightly sometimes. Show genuine interest in their life. Remember details about them.';
      case 'bestfriend':
        return 'Be completely natural like a best friend. Use playful teasing. Reference shared history. Be emotionally open. Use inside jokes if any exist. This person trusts you deeply.';
      default:
        return '';
    }
  }
}
