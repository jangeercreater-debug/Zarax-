import { AudioFrame, AudioSource, LocalAudioTrack, TrackPublishOptions } from '@livekit/rtc-node';
import type { Room } from '@livekit/rtc-node';

const FRAME_DURATION_MS = 20; // 20ms per frame — Opus-compatible

/**
 * Publishes PCM audio to a LiveKit room track. Call push() to queue audio chunks;
 * they are emitted as fixed-size AudioFrame objects at the correct sample rate.
 */
export class LiveKitAudioPublisher {
  private readonly source: AudioSource;
  private readonly track: LocalAudioTrack;
  /** Publication SID, captured at publish time — unpublishTrack() takes the SID, not the track. */
  private publicationSid: string | undefined;

  constructor(
    private readonly room: Room,
    private readonly sampleRate: number,
    private readonly numChannels: number,
  ) {
    this.source = new AudioSource(sampleRate, numChannels);
    this.track = LocalAudioTrack.createAudioTrack('agent-voice', this.source);
  }

  async start(): Promise<void> {
    if (this.publicationSid) return;
    const participant = this.room.localParticipant;
    if (!participant) {
      throw new Error('LiveKitAudioPublisher: room has no localParticipant');
    }
    const publication = await participant.publishTrack(this.track, new TrackPublishOptions());
    this.publicationSid = publication.sid;
  }

  /** Push a Buffer of 16-bit LE PCM. Splits into fixed-size frames automatically. */
  async push(pcmBuffer: Buffer): Promise<void> {
    const samplesPerChannel = Math.floor((this.sampleRate * FRAME_DURATION_MS) / 1000);
    const bytesPerFrame = samplesPerChannel * this.numChannels * 2;

    for (let offset = 0; offset + bytesPerFrame <= pcmBuffer.length; offset += bytesPerFrame) {
      const slice = pcmBuffer.subarray(offset, offset + bytesPerFrame);
      const int16 = new Int16Array(slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength));
      const frame = new AudioFrame(int16, this.sampleRate, this.numChannels, samplesPerChannel);
      await this.source.captureFrame(frame);
    }
  }

  async stop(): Promise<void> {
    const sid = this.publicationSid;
    if (!sid) return;
    const participant = this.room.localParticipant;
    if (participant) {
      await participant.unpublishTrack(sid);
    }
    this.publicationSid = undefined;
  }
}
