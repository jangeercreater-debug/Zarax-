import { Injectable } from '@nestjs/common';
import type { UserIntent } from './intent-detector';

export interface ReasoningResult {
  strategy: 'direct' | 'think_first' | 'empathize_first' | 'recall_first' | 'confirm_action';
  contextHint: string;
  maxTokens: number;
  temperature: number;
  pacingHint: string;
}

@Injectable()
export class ReasoningEngine {

  plan(intent: UserIntent, userText: string): ReasoningResult {
    switch (intent) {
      case 'greeting':
        return {
          strategy: 'direct',
          contextHint: 'Respond warmly. Keep it very short - just a greeting.',
          maxTokens: 25,
          temperature: 0.95,
          pacingHint: 'Quick and warm. No thinking pause. Instant reaction like a friend picking up a call.',
        };

      case 'farewell':
        return {
          strategy: 'direct',
          contextHint: 'Say goodbye warmly and naturally.',
          maxTokens: 20,
          temperature: 0.9,
          pacingHint: 'Gentle and brief. Slight warmth. Like ending a phone call with a close friend.',
        };

      case 'emotional':
        return {
          strategy: 'empathize_first',
          contextHint: 'The user is expressing emotions. React first with a genuine emotional response. Then listen. Do NOT give advice unless asked. Just be present.',
          maxTokens: 60,
          temperature: 0.88,
          pacingHint: 'Slow and gentle. Pause before responding. Use "..." for breathing space. Lower energy. Soft tone. Like sitting next to a friend who is hurting.',
        };

      case 'memory_store':
        return {
          strategy: 'confirm_action',
          contextHint: 'The user wants you to remember something. Confirm briefly and naturally.',
          maxTokens: 30,
          temperature: 0.7,
          pacingHint: 'Quick acknowledgment. Casual and confident. Like a friend saying "Got it, noted."',
        };

      case 'memory_recall':
        return {
          strategy: 'recall_first',
          contextHint: 'The user is asking about something previously discussed. Check memory context. Answer naturally as if you actually remember.',
          maxTokens: 50,
          temperature: 0.7,
          pacingHint: 'Brief thinking pause like recalling a memory. "Oh yeah..." or "Hmm if I remember correctly..." then answer.',
        };

      case 'question':
        return {
          strategy: 'think_first',
          contextHint: this.getQuestionHint(userText),
          maxTokens: this.getQuestionTokens(userText),
          temperature: 0.82,
          pacingHint: this.getQuestionPacing(userText),
        };

      case 'task_request':
        return {
          strategy: 'confirm_action',
          contextHint: 'The user wants you to do something. Confirm clearly. If you cannot do it, say so naturally like a friend would.',
          maxTokens: 50,
          temperature: 0.75,
          pacingHint: 'Confident and clear. Brief pause to understand, then respond. Like a capable friend saying "Sure, on it."',
        };

      case 'command':
        return {
          strategy: 'direct',
          contextHint: 'Execute or acknowledge naturally.',
          maxTokens: 40,
          temperature: 0.8,
          pacingHint: 'Quick and responsive. No unnecessary pauses.',
        };

      case 'casual_chat':
        return {
          strategy: 'direct',
          contextHint: 'Casual conversation. Be natural, warm, and genuinely interested. Ask a follow-up question sometimes.',
          maxTokens: 50,
          temperature: 0.95,
          pacingHint: 'Relaxed and natural. Vary rhythm. Sometimes short reactions, sometimes slightly longer thoughts. Like chatting with a friend over coffee.',
        };

      default:
        return {
          strategy: 'direct',
          contextHint: 'Respond naturally and conversationally.',
          maxTokens: 50,
          temperature: 0.9,
          pacingHint: 'Natural human rhythm. Not too fast, not too slow.',
        };
    }
  }

  private getQuestionHint(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('why') || lower.includes('kyun') || lower.includes('kaise') || lower.includes('how')) {
      return 'WHY/HOW question. Think briefly, then explain simply. Use conversational language, not textbook language.';
    }
    if (lower.includes('opinion') || lower.includes('think') || lower.includes('lagta') || lower.includes('sochti')) {
      return 'Opinion question. Share a genuine personal perspective. Be thoughtful. It is okay to be uncertain.';
    }
    if (lower.includes('what is') || lower.includes('kya hai') || lower.includes('define')) {
      return 'Definition question. Explain like a friend would, not like a dictionary. Use examples.';
    }
    return 'Answer naturally. Be concise but not robotic.';
  }

  private getQuestionTokens(text: string): number {
    const lower = text.toLowerCase();
    if (lower.includes('explain') || lower.includes('samjhao') || lower.includes('detail')) return 100;
    if (lower.includes('why') || lower.includes('how') || lower.includes('kyun') || lower.includes('kaise')) return 80;
    return 60;
  }

  private getQuestionPacing(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('why') || lower.includes('kyun') || lower.includes('how') || lower.includes('kaise')) {
      return 'Slight thinking pause first. "Hmm..." or "So basically..." then explain. Break into small pieces. Do not dump everything at once.';
    }
    if (lower.includes('what') || lower.includes('kya') || lower.includes('who') || lower.includes('kaun')) {
      return 'Quick but natural. Direct answer first, then brief context if needed.';
    }
    return 'Natural pace. React first, then answer.';
  }
}
