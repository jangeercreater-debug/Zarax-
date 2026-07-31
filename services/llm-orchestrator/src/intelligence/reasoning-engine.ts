import { Injectable } from '@nestjs/common';
import type { UserIntent } from './intent-detector';

export interface ReasoningResult {
  strategy: 'direct' | 'think_first' | 'empathize_first' | 'recall_first' | 'confirm_action';
  contextHint: string;
  maxTokens: number;
  temperature: number;
}

@Injectable()
export class ReasoningEngine {

  plan(intent: UserIntent, userText: string): ReasoningResult {
    switch (intent) {
      case 'greeting':
        return {
          strategy: 'direct',
          contextHint: 'Respond warmly and naturally. Keep it short.',
          maxTokens: 40,
          temperature: 0.95,
        };

      case 'farewell':
        return {
          strategy: 'direct',
          contextHint: 'Say goodbye warmly. Be brief.',
          maxTokens: 30,
          temperature: 0.9,
        };

      case 'emotional':
        return {
          strategy: 'empathize_first',
          contextHint: 'The user is expressing emotions. Acknowledge their feelings first before anything else. Be gentle and caring. Do NOT give advice unless asked.',
          maxTokens: 80,
          temperature: 0.88,
        };

      case 'memory_store':
        return {
          strategy: 'confirm_action',
          contextHint: 'The user wants you to remember something. Confirm what you are saving. Be natural about it.',
          maxTokens: 50,
          temperature: 0.7,
        };

      case 'memory_recall':
        return {
          strategy: 'recall_first',
          contextHint: 'The user is asking about something previously discussed or saved. Check memory context carefully before responding.',
          maxTokens: 80,
          temperature: 0.7,
        };

      case 'question':
        return {
          strategy: 'think_first',
          contextHint: this.getQuestionHint(userText),
          maxTokens: 100,
          temperature: 0.8,
        };

      case 'task_request':
        return {
          strategy: 'confirm_action',
          contextHint: 'The user wants you to do something. Confirm the action clearly. If you cannot do it, say so naturally.',
          maxTokens: 80,
          temperature: 0.75,
        };

      case 'command':
        return {
          strategy: 'direct',
          contextHint: 'Execute or acknowledge the command naturally. Be concise.',
          maxTokens: 60,
          temperature: 0.8,
        };

      case 'casual_chat':
        return {
          strategy: 'direct',
          contextHint: 'This is casual conversation. Be natural, warm, and ask a follow-up question.',
          maxTokens: 60,
          temperature: 0.95,
        };

      default:
        return {
          strategy: 'direct',
          contextHint: 'Respond naturally and conversationally.',
          maxTokens: 80,
          temperature: 0.9,
        };
    }
  }

  private getQuestionHint(text: string): string {
    const lower = text.toLowerCase();
    if (lower.includes('why') || lower.includes('kyun') || lower.includes('kaise') || lower.includes('how')) {
      return 'This is a WHY/HOW question. Think step by step but explain simply and conversationally.';
    }
    if (lower.includes('opinion') || lower.includes('think') || lower.includes('lagta') || lower.includes('sochti')) {
      return 'User is asking for your opinion. Share a thoughtful personal perspective.';
    }
    return 'Answer the question naturally and concisely.';
  }
}
