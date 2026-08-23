import { Injectable } from '@nestjs/common';

export interface ProactiveTopic {
  opener: string;
  category: string;
}

/**
 * Phase 7: Proactive Companion Engine.
 * Zarax doesn't just answer — she naturally brings up relevant topics from memory,
 * follows up on things the user mentioned before, and makes the user feel remembered.
 * Rules: never spam, never interrupt, max 1 proactive topic per session start.
 */
@Injectable()
export class ProactiveCompanionEngine {

  /** Called at session start. Given recent memories, generates a natural proactive
   * opener that Zarax can weave into her greeting — like a friend who remembers. */
  generateProactiveTopic(memories: Array<{ category: string; key: string | null; value: unknown; updatedAt?: string }>): ProactiveTopic | null {
    if (!memories || memories.length === 0) return null;

    // Priority: goals, tasks, projects — things with pending follow-up potential
    const followUpCategories = ['goal', 'project', 'task', 'habit'];
    const followUpMemory = memories.find(m => followUpCategories.includes(m.category));

    if (followUpMemory) {
      const label = followUpMemory.key ?? String(followUpMemory.value).slice(0, 40);
      return {
        opener: this.buildFollowUpOpener(followUpMemory.category, label),
        category: followUpMemory.category,
      };
    }

    return null;
  }

  /** Generates the system hint that tells Zarax HOW to use the proactive topic —
   * naturally, not mechanically. The LLM decides the exact wording. */
  generateProactivePrompt(topic: ProactiveTopic | null): string {
    if (!topic) return '';
    return [
      `[Proactive companion] You remember something relevant about this user:`,
      `Category: ${topic.category}`,
      `Suggested follow-up: "${topic.opener}"`,
      `If it feels natural early in the conversation, you can bring this up yourself — like a friend who remembers.`,
      `Do NOT force it. Do NOT mention it if the user is already talking about something else.`,
      `Only one proactive reference per conversation. Keep it brief and natural.`,
    ].join('\n');
  }

  /** Generates an instruction for Zarax to end conversations naturally — like a
   * real person, not like a service bot closing a ticket. */
  generateFarewellGuidance(): string {
    return [
      `[Natural conversation endings]`,
      `When the user says goodbye, wrap up naturally like a real friend:`,
      `- Keep it warm and brief`,
      `- Reference something from the conversation if possible ("Talk to you soon!", "Good luck with that thing!")`,
      `- NEVER say "Is there anything else I can help you with?"`,
      `- NEVER say "Have a great day!" in a robotic way`,
      `- Match their energy: if they're tired, be gentle; if they're cheerful, be warm`,
      `Examples: "Okay, take care!", "Alright, talk soon!", "Bye, was nice talking!", "Get some rest!"`,
    ].join('\n');
  }

  private buildFollowUpOpener(category: string, label: string): string {
    const openers: Record<string, string[]> = {
      goal: [
        `How's that going? You mentioned "${label}" last time.`,
        `Any progress on "${label}"?`,
        `Still working on "${label}"?`,
      ],
      project: [
        `How's the "${label}" project coming along?`,
        `Any updates on "${label}"?`,
        `Last time you mentioned "${label}" — how's that going?`,
      ],
      task: [
        `Did you get to "${label}"?`,
        `How did "${label}" go?`,
        `Were you able to finish "${label}"?`,
      ],
      habit: [
        `How's the "${label}" habit going?`,
        `Still keeping up with "${label}"?`,
      ],
    };

    const options = openers[category] ?? [`How's "${label}" going?`];
    return options[Math.floor(Math.random() * options.length)] ?? options[0] ?? `How's "${label}" going?`;
  }
}
