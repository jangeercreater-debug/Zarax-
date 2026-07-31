import { Injectable } from '@nestjs/common';

export type UserIntent =
  | 'question'
  | 'command'
  | 'memory_store'
  | 'memory_recall'
  | 'casual_chat'
  | 'emotional'
  | 'task_request'
  | 'greeting'
  | 'farewell'
  | 'unknown';

const INTENT_PATTERNS: Array<{ intent: UserIntent; patterns: RegExp[] }> = [
  {
    intent: 'greeting',
    patterns: [
      /^(hi|hello|hey|namaste|zarax|haan|kya haal|howdy|sup|assalam)/i,
    ],
  },
  {
    intent: 'farewell',
    patterns: [
      /^(bye|goodbye|alvida|good night|tata|chal|baad mein|talk later)/i,
    ],
  },
  {
    intent: 'memory_store',
    patterns: [
      /(remember|yaad rakh|yaad kar|save|note|store|likh|mat bhul|dont forget|memorize)/i,
    ],
  },
  {
    intent: 'memory_recall',
    patterns: [
      /(what did i|kya bataya|yaad hai|remember when|recall|pehle bola|maine kya|do you remember)/i,
    ],
  },
  {
    intent: 'emotional',
    patterns: [
      /(sad|happy|angry|frustrated|depressed|anxious|worried|scared|lonely|excited|dukhi|khush|gussa|tension|pareshan|dar|akela)/i,
    ],
  },
  {
    intent: 'task_request',
    patterns: [
      /(remind|set alarm|schedule|create|make|send|call|book|order|calculate|convert|translate|search)/i,
    ],
  },
  {
    intent: 'question',
    patterns: [
      /^(what|who|when|where|why|how|which|kya|kaun|kab|kahan|kyun|kaise|kitna|konsa)\b/i,
      /\?$/,
    ],
  },
  {
    intent: 'command',
    patterns: [
      /^(do|open|close|start|stop|play|pause|show|tell|bata|karo|chalu|band|dikha)/i,
    ],
  },
];

@Injectable()
export class IntentDetector {

  detect(text: string): { intent: UserIntent; confidence: number } {
    const trimmed = text.trim();

    for (const { intent, patterns } of INTENT_PATTERNS) {
      for (const pattern of patterns) {
        if (pattern.test(trimmed)) {
          return { intent, confidence: 0.85 };
        }
      }
    }

    if (trimmed.length < 10) {
      return { intent: 'casual_chat', confidence: 0.6 };
    }

    return { intent: 'unknown', confidence: 0.3 };
  }

  isMemoryRelated(intent: UserIntent): boolean {
    return intent === 'memory_store' || intent === 'memory_recall';
  }

  isEmotional(intent: UserIntent): boolean {
    return intent === 'emotional';
  }

  needsReasoning(intent: UserIntent): boolean {
    return intent === 'question' || intent === 'task_request' || intent === 'command';
  }
}
