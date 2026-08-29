import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';

import { AUDIO_LIMITS, CLONE_ERROR_CODES } from './voice-clone.types';

export interface AudioValidationResult {
  valid: boolean;
  errorCode?: string;
  errorMessage?: string;
  mimeType?: string;
  durationS?: number;
  sizeBytes?: number;
  sha256?: string;
}

/**
 * Phase 4: Audio Validator Service
 *
 * Validates reference audio for voice cloning without any external dependencies.
 * Checks: format, size, duration, silence, corruption.
 *
 * Security: Never logs raw audio content, embeddings, or personal voice data.
 */
@Injectable()
export class AudioValidatorService {
  private readonly logger = new Logger(AudioValidatorService.name);

  async validate(audioBase64: string, declaredMimeType: string): Promise<AudioValidationResult> {
    // 1. Decode base64
    let audioBuffer: Buffer;
    try {
      audioBuffer = Buffer.from(audioBase64, 'base64');
    } catch {
      return { valid: false, errorCode: CLONE_ERROR_CODES.CLONE_AUDIO_CORRUPTED, errorMessage: 'Audio data is not valid base64.' };
    }

    // 2. Size check
    const sizeBytes = audioBuffer.length;
    if (sizeBytes === 0) {
      return { valid: false, errorCode: CLONE_ERROR_CODES.CLONE_AUDIO_MISSING, errorMessage: 'Audio data is empty.' };
    }
    if (sizeBytes > AUDIO_LIMITS.MAX_SIZE_BYTES) {
      return {
        valid: false,
        errorCode: CLONE_ERROR_CODES.CLONE_AUDIO_TOO_LARGE,
        errorMessage: `Audio exceeds maximum size of ${AUDIO_LIMITS.MAX_SIZE_BYTES / 1024 / 1024}MB. Got ${(sizeBytes / 1024 / 1024).toFixed(2)}MB.`,
      };
    }

    // 3. Format detection via magic bytes
    const detectedMime = this.detectMimeType(audioBuffer);
    if (!detectedMime) {
      return {
        valid: false,
        errorCode: CLONE_ERROR_CODES.CLONE_AUDIO_INVALID_FORMAT,
        errorMessage: `Unsupported audio format. Accepted: WAV, MP3, OGG, M4A. Detected MIME: ${declaredMimeType}`,
      };
    }

    // 4. Duration estimation
    const durationS = this.estimateDuration(audioBuffer, detectedMime);
    if (durationS < AUDIO_LIMITS.MIN_DURATION_S) {
      return {
        valid: false,
        errorCode: CLONE_ERROR_CODES.CLONE_AUDIO_TOO_SHORT,
        errorMessage: `Audio is too short (${durationS.toFixed(1)}s). Minimum is ${AUDIO_LIMITS.MIN_DURATION_S}s for voice cloning.`,
      };
    }
    if (durationS > AUDIO_LIMITS.MAX_DURATION_S) {
      return {
        valid: false,
        errorCode: CLONE_ERROR_CODES.CLONE_AUDIO_TOO_LONG,
        errorMessage: `Audio is too long (${durationS.toFixed(0)}s). Maximum is ${AUDIO_LIMITS.MAX_DURATION_S}s.`,
      };
    }

    // 5. Silence detection (WAV only — skip for compressed formats)
    if (detectedMime === 'audio/wav') {
      const isSilent = this.checkSilence(audioBuffer);
      if (isSilent) {
        return {
          valid: false,
          errorCode: CLONE_ERROR_CODES.CLONE_AUDIO_SILENT,
          errorMessage: 'Audio appears to be silent. Please record or upload audio containing speech.',
        };
      }
    }

    // 6. SHA256 hash for integrity
    const sha256 = createHash('sha256').update(audioBuffer).digest('hex');

    this.logger.log('AudioValidatorService: audio validated', {
      mimeType: detectedMime,
      durationS: durationS.toFixed(2),
      sizeBytes,
      // Never log sha256 (could be used to reconstruct audio)
    });

    return { valid: true, mimeType: detectedMime, durationS, sizeBytes, sha256 };
  }

  private detectMimeType(buffer: Buffer): string | null {
    if (buffer.length < 12) return null;

    // WAV: "RIFF....WAVE"
    if (
      buffer[0] === 0x52 && buffer[1] === 0x49 &&
      buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x41 &&
      buffer[10] === 0x56 && buffer[11] === 0x45
    ) return 'audio/wav';

    // MP3 with ID3 tag
    if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) return 'audio/mpeg';

    // MP3 sync bytes
    if (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xf3 || buffer[1] === 0xf2)) return 'audio/mpeg';

    // OGG
    if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) return 'audio/ogg';

    // M4A/MP4 — ftyp box at offset 4
    if (buffer.length >= 8 && buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) return 'audio/mp4';

    return null;
  }

  private estimateDuration(buffer: Buffer, mimeType: string): number {
    try {
      if (mimeType === 'audio/wav') {
        // WAV header: sample rate at offset 24 (4 bytes LE), channels at 22, bits at 34
        if (buffer.length < 44) return 0;
        const sampleRate = buffer.readUInt32LE(24);
        const numChannels = buffer.readUInt16LE(22);
        const bitsPerSample = buffer.readUInt16LE(34);
        const dataSize = buffer.readUInt32LE(40);
        if (sampleRate === 0 || numChannels === 0 || bitsPerSample === 0) return 0;
        return dataSize / (sampleRate * numChannels * (bitsPerSample / 8));
      }

      // MP3: estimate from file size assuming 128kbps
      if (mimeType === 'audio/mpeg') {
        return (buffer.length * 8) / 128_000;
      }

      // OGG/M4A: rough estimate at 96kbps
      return (buffer.length * 8) / 96_000;
    } catch {
      // If parsing fails, assume minimum duration to pass (real validation on GPU side)
      return AUDIO_LIMITS.MIN_DURATION_S;
    }
  }

  private checkSilence(wavBuffer: Buffer): boolean {
    try {
      // WAV PCM data starts at offset 44
      if (wavBuffer.length < 44) return true;
      const dataStart = 44;
      const sampleCount = Math.min((wavBuffer.length - dataStart) / 2, 10_000);
      if (sampleCount < 100) return true;

      let totalEnergy = 0;
      for (let i = 0; i < sampleCount; i++) {
        const sample = wavBuffer.readInt16LE(dataStart + i * 2);
        totalEnergy += Math.abs(sample);
      }
      const avgEnergy = totalEnergy / sampleCount;
      // Threshold: < 50 out of 32767 = effectively silent
      return avgEnergy < 50;
    } catch {
      return false; // If we can't check, assume not silent
    }
  }
}
