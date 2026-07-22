import {
  AudioFrame,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
} from '@livekit/rtc-node';
import type { Room } from '@livekit/rtc-node';

const FRAME_DURATION_MS = 20;

export class LiveKitAudioPublisher {
  private readonly source: AudioSource;
  private readonly track: LocalAudioTrack;
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
    const options = new TrackPublishOptions();
    // Required. Publishing with an unset source makes the native rtc-node engine
    // panic ("called Option::unwrap() on a None value" in rtc_session.rs).
    options.source = TrackSource.SOURCE_MICROPHONE;
    const publication = await participant.publishTrack(this.track, options);
    this.publicationSid = publication.sid;
  }

  async push(pcmBuffer: Buffer): Promise<void> {
    const samplesPerChannel = Math.floor((this.sampleRate * FRAME_DURATION_MS) / 1000);
    const bytesPerFrame = samplesPerChannel * this.numChannels * 2;

    for (let offset = 0; offset + bytesPerFrame <= pcmBuffer.length; offset += bytesPerFrame) {
      // Zero-copy Int16Array view. LiveKit docs warn against buffer.slice() here --
      // Node marks it unstable and it can append large bursts of noise.
      const int16 = new Int16Array(
        pcmBuffer.buffer,
        pcmBuffer.byteOffset + offset,
        samplesPerChannel * this.numChannels,
      );
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
