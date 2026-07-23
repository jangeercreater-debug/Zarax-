import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  LocalTrackPublication,
  TrackPublishOptions,
} from '@livekit/rtc-node';
import type { Room } from '@livekit/rtc-node';

const FRAME_DURATION_MS = 20;

export class LiveKitAudioPublisher {
  private readonly source: AudioSource;
  private readonly track: LocalAudioTrack;
  private published = false;
  private publication: LocalTrackPublication | null = null;
  private leftover: Buffer = Buffer.alloc(0);

  constructor(
    private readonly room: Room,
    private readonly sampleRate: number,
    private readonly numChannels: number,
  ) {
    this.source = new AudioSource(sampleRate, numChannels);
    this.track = LocalAudioTrack.createAudioTrack('agent-voice', this.source);
  }

  async start(): Promise<void> {
    if (this.published) return;
    const localParticipant = this.room.localParticipant;
    if (!localParticipant) {
      throw new Error('LiveKitAudioPublisher: room.localParticipant is unavailable (room not connected?)');
    }
    this.publication = await localParticipant.publishTrack(this.track, new TrackPublishOptions());
    this.published = true;
  }

  async push(pcmBuffer: Buffer): Promise<void> {
    const samplesPerChannel = Math.floor((this.sampleRate * FRAME_DURATION_MS) / 1000);
    const bytesPerFrame = samplesPerChannel * this.numChannels * 2;

    const combined = this.leftover.length > 0 ? Buffer.concat([this.leftover, pcmBuffer]) : pcmBuffer;

    let offset = 0;
    for (; offset + bytesPerFrame <= combined.length; offset += bytesPerFrame) {
      const slice = combined.subarray(offset, offset + bytesPerFrame);
      const int16 = new Int16Array(slice.buffer, slice.byteOffset, slice.length / 2);
      const frame = new AudioFrame(int16, this.sampleRate, this.numChannels, samplesPerChannel);
      await this.source.captureFrame(frame);
    }

    this.leftover = combined.subarray(offset);
  }

  async flush(): Promise<void> {
    if (this.leftover.length === 0) return;

    const samplesPerChannel = Math.floor((this.sampleRate * FRAME_DURATION_MS) / 1000);
    const bytesPerFrame = samplesPerChannel * this.numChannels * 2;

    const padded = Buffer.alloc(bytesPerFrame);
    this.leftover.copy(padded);
    const int16 = new Int16Array(padded.buffer, padded.byteOffset, padded.length / 2);
    const frame = new AudioFrame(int16, this.sampleRate, this.numChannels, samplesPerChannel);
    await this.source.captureFrame(frame);

    this.leftover = Buffer.alloc(0);
  }

  async stop(): Promise<void> {
    if (!this.published) return;
    const localParticipant = this.room.localParticipant;
    if (localParticipant && this.publication) {
      await localParticipant.unpublishTrack(this.publication.sid);
    }
    this.published = false;
    this.publication = null;
  }
}
