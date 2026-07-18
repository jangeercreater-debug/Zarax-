import { Injectable } from '@nestjs/common';

import type { VoiceSession } from './voice-session';

@Injectable()
export class SessionRegistry {
  private readonly sessions = new Map<string, VoiceSession>();

  register(callId: string, session: VoiceSession): void {
    this.sessions.set(callId, session);
  }

  get(callId: string): VoiceSession | undefined {
    return this.sessions.get(callId);
  }

  delete(callId: string): void {
    this.sessions.delete(callId);
  }

  get activeCount(): number {
    return this.sessions.size;
  }
}
