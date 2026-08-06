import { Injectable } from '@nestjs/common';

export interface ConversationState {
  topics: string[];
  askedQuestions: string[];
  answeredPoints: string[];
  lastTopic: string;
  turnCount: number;
  followUpSuggestion: string | null;
}

@Injectable()
export class ConversationIntelligence {
  private sessions = new Map<string, ConversationState>();

  getOrCreate(callId: string): ConversationState {
    if (!this.sessions.has(callId)) {
      this.sessions.set(callId, {
        topics: [],
        askedQuestions: [],
        answeredPoints: [],
        lastTopic: '',
        turnCount: 0,
        followUpSuggestion: null,
      });
    }
    return this.sessions.get(callId)!;
  }

  processUserTurn(callId: string, userText: string): string {
    const state = this.getOrCreate(callId);
    state.turnCount++;

    const topic = this.extractTopic(userText);
    const isTopicSwitch = state.lastTopic && topic !== state.lastTopic;

    if (topic && !state.topics.includes(topic)) {
      state.topics.push(topic);
    }
    if (topic) state.lastTopic = topic;

    if (this.isQuestion(userText)) {
      state.askedQuestions.push(userText.toLowerCase().trim());
    }

    let contextHint = '';

    if (isTopicSwitch) {
      contextHint += `[Context switch] User changed topic from "${state.lastTopic}" to "${topic}". Acknowledge the switch naturally, like "Oh achha, ${topic} ki baat" or just flow naturally.\n`;
    }

    const repeated = this.findRepetition(state, userText);
    if (repeated) {
      contextHint += `[Repetition warning] User asked something similar before: "${repeated}". Do NOT repeat your previous answer. Say something like "Hmm I think I mentioned this before..." or give a different angle.\n`;
    }

    if (state.turnCount > 0 && state.turnCount % 3 === 0) {
      state.followUpSuggestion = this.suggestFollowUp(state);
    }

    return contextHint;
  }

  processAssistantTurn(callId: string, responseText: string): void {
    const state = this.getOrCreate(callId);
    const keyPoints = this.extractKeyPoints(responseText);
    state.answeredPoints.push(...keyPoints);
  }

  getAntiRepetitionHint(callId: string): string {
    const state = this.getOrCreate(callId);
    if (state.answeredPoints.length === 0) return '';

    const recent = state.answeredPoints.slice(-5);
    return `[Already discussed] You have already mentioned these points: ${recent.join('; ')}. Do NOT repeat them unless the user specifically asks again.`;
  }

  getFollowUpHint(callId: string): string {
    const state = this.getOrCreate(callId);
    if (!state.followUpSuggestion) return '';
    const hint = state.followUpSuggestion;
    state.followUpSuggestion = null;
    return `[Natural follow-up] If appropriate, you could ask: "${hint}"`;
  }

  cleanup(callId: string): void {
    this.sessions.delete(callId);
  }

  private extractTopic(text: string): string {
    const lower = text.toLowerCase();
    const topics: Record<string, string[]> = {
      'work': ['office', 'meeting', 'boss', 'project', 'deadline', 'client', 'kaam', 'job'],
      'health': ['doctor', 'hospital', 'medicine', 'headache', 'fever', 'tired', 'gym', 'tabiyat', 'dawai'],
      'family': ['mom', 'dad', 'sister', 'brother', 'wife', 'husband', 'papa', 'mummy', 'bhai', 'behen'],
      'food': ['eat', 'lunch', 'dinner', 'cook', 'restaurant', 'khana', 'recipe'],
      'travel': ['trip', 'travel', 'flight', 'hotel', 'vacation', 'safar', 'ghumna'],
      'tech': ['code', 'app', 'software', 'phone', 'laptop', 'bug', 'website'],
      'feelings': ['feel', 'happy', 'sad', 'angry', 'love', 'lonely', 'miss', 'dukhi', 'khush'],
      'plans': ['plan', 'tomorrow', 'weekend', 'future', 'goal', 'kal', 'sochna'],
      'money': ['money', 'salary', 'invest', 'spend', 'save', 'paisa', 'budget'],
      'study': ['exam', 'study', 'college', 'school', 'learn', 'padhai', 'class'],
    };

    for (const [topic, keywords] of Object.entries(topics)) {
      if (keywords.some(k => lower.includes(k))) return topic;
    }
    return 'general';
  }

  private isQuestion(text: string): boolean {
    const lower = text.toLowerCase().trim();
    return lower.includes('?') || lower.startsWith('kya ') || lower.startsWith('how ') ||
      lower.startsWith('why ') || lower.startsWith('what ') || lower.startsWith('when ') ||
      lower.startsWith('where ') || lower.startsWith('who ') || lower.startsWith('kaise ') ||
      lower.startsWith('kyun ') || lower.startsWith('kab ') || lower.startsWith('kahan ');
  }

  private findRepetition(state: ConversationState, text: string): string | null {
    const lower = text.toLowerCase().trim();
    for (const q of state.askedQuestions) {
      const similarity = this.simpleSimilarity(lower, q);
      if (similarity > 0.7) return q;
    }
    return null;
  }

  private simpleSimilarity(a: string, b: string): number {
    const wordsA = new Set(a.split(/\s+/));
    const wordsB = new Set(b.split(/\s+/));
    let common = 0;
    for (const w of wordsA) { if (wordsB.has(w)) common++; }
    return common / Math.max(wordsA.size, wordsB.size, 1);
  }

  private extractKeyPoints(text: string): string[] {
    return text.split(/[.!?]/)
      .map(s => s.trim())
      .filter(s => s.length > 10)
      .slice(0, 3);
  }

  private suggestFollowUp(state: ConversationState): string | null {
    const topic = state.lastTopic;
    const suggestions: Record<string, string[]> = {
      'work': ['Aur project mein kya progress hui?', 'Boss ka reaction kaisa tha?'],
      'health': ['Ab kaisi tabiyat hai?', 'Doctor ne kya bola?'],
      'family': ['Aur ghar pe sab theek?', 'Unse baat hui recently?'],
      'food': ['Kya banane ka mann hai?', 'Last time kya achha khaya tha?'],
      'travel': ['Trip plan kar rahe ho?', 'Last trip kaisi thi?'],
      'feelings': ['Ab kaisa feel ho raha hai?', 'Koi aur cheez bhi bother kar rahi hai?'],
      'plans': ['Kab tak karna chahte ho?', 'Koi help chahiye plan mein?'],
      'money': ['Budget set kiya hai?', 'Savings kaisi chal rahi hai?'],
      'study': ['Exam kab hai?', 'Preparation kaisi chal rahi hai?'],
    };

    const options = suggestions[topic];
    if (!options || options.length === 0) return null;
    return options[Math.floor(Math.random() * options.length)] ?? null;
  }
}
