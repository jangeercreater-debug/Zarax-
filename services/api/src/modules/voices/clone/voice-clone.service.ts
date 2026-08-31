import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { createHash } from 'node:crypto';

import { AudioValidatorService } from './audio-validator.service';
import { ChatterboxAdapter } from './chatterbox.adapter';
import {
  CLONE_ERROR_CODES,
  CLONING_MODEL_METADATA,
  CONSENT_STATEMENT_V1,
  CONSENT_VERSION,
  SYNTHESIS_UNAVAILABLE_MESSAGE,
  type VoiceCloneStatus,
} from './voice-clone.types';

class CloneError extends Error {
  cloneErrorCode: string;
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.cloneErrorCode = code;
    this.status = status;
  }
}

export interface InitiateCloneInput {
  tenantId: string;
  userId: string;
  name: string;
  description?: string;
  audioBase64: string;
  audioMimeType: string;
  consentText: string;
  consentVersion: string;
  consentedAt: string;
  isSelfVoice: boolean;
  ipAddress?: string;
  userAgent?: string;
  language?: string;
}

export interface VoiceCloneRecord {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  description: string | null;
  status: VoiceCloneStatus;
  audioMimeType: string;
  audioDurationS: number;
  audioSizeBytes: number;
  synthesisAvail: boolean;
  synthesisStatus: string;
  cloningModel: string | null;
  cloningModelVer: string | null;
  failureReason: string | null;
  voiceId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class VoiceCloneService {
  private readonly logger = new Logger(VoiceCloneService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly audioValidator: AudioValidatorService,
    private readonly adapter: ChatterboxAdapter,
  ) {}

  /**
   * Full clone initiation flow:
   * 1. Verify consent (hash check)
   * 2. Validate audio (format, size, duration, silence)
   * 3. Extract speaker embedding
   * 4. Create VoiceCloneConsent + VoiceCloneProfile in DB
   * 5. Clear raw audio from memory (never persisted in logs)
   */
  async initiateClone(input: InitiateCloneInput): Promise<VoiceCloneRecord> {
    // ── 1. Consent verification ────────────────────────────────────────────
    if (!input.isSelfVoice) {
      throw new CloneError(
        'Voice cloning requires confirmation that this is your own voice.',
        CLONE_ERROR_CODES.CLONE_CONSENT_SELF_VOICE_REQUIRED,
      );
    }

    if (input.consentVersion !== CONSENT_VERSION) {
      throw new CloneError(
        `Consent version mismatch. Expected ${CONSENT_VERSION}, got ${input.consentVersion}.`,
        CLONE_ERROR_CODES.CLONE_CONSENT_VERSION_MISMATCH,
      );
    }

    const expectedHash = createHash('sha256').update(CONSENT_STATEMENT_V1).digest('hex');
    const submittedHash = createHash('sha256').update(input.consentText).digest('hex');
    if (expectedHash !== submittedHash) {
      throw new CloneError(
        'Consent statement does not match the required text.',
        CLONE_ERROR_CODES.CLONE_CONSENT_INVALID,
      );
    }

    // ── 2. Audio validation ────────────────────────────────────────────────
    const validation = await this.audioValidator.validate(input.audioBase64, input.audioMimeType);
    if (!validation.valid) {
      throw new CloneError(
        validation.errorMessage ?? 'Audio validation failed.',
        validation.errorCode ?? CLONE_ERROR_CODES.CLONE_AUDIO_INVALID_FORMAT,
      );
    }

    // ── 3. Duplicate name check ────────────────────────────────────────────
    const existing = await this.prisma.voiceCloneProfile.findFirst({
      where: {
        tenantId: input.tenantId,
        userId: input.userId,
        name: input.name,
        status: { notIn: ['INACTIVE', 'FAILED'] as never[] },
      },
    });
    if (existing) {
      throw new CloneError(
        `A voice clone named "${input.name}" already exists.`,
        CLONE_ERROR_CODES.CLONE_DUPLICATE_NAME,
      );
    }

    // ── 4. Speaker embedding extraction ───────────────────────────────────
    const audioBuffer = Buffer.from(input.audioBase64, 'base64');
    let embeddingResult;
    try {
      embeddingResult = await this.adapter.extractEmbedding({
        audioBuffer,
        audioMimeType: validation.mimeType!,
        audioDurationS: validation.durationS!,
        language: input.language,
      });
    } catch (error) {
      this.logger.error('VoiceCloneService: embedding extraction failed', {
        tenantId: input.tenantId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw new CloneError('Voice profile extraction failed.', CLONE_ERROR_CODES.CLONE_PROCESSING_FAILED, 500);
    }

    // ── 5. Persist consent + profile ──────────────────────────────────────
    const consentedAt = new Date(input.consentedAt);

    const consent = await this.prisma.voiceCloneConsent.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        consentText: CONSENT_STATEMENT_V1,
        consentVersion: CONSENT_VERSION as never,
        consentedAt,
        isSelfVoice: input.isSelfVoice,
        consentHash: expectedHash,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ? input.userAgent.slice(0, 500) : null,
      },
    });

    const profile = await this.prisma.voiceCloneProfile.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        name: input.name,
        description: input.description ?? null,
        status: 'PROFILE_READY' as never,
        consentId: consent.id,
        audioMimeType: validation.mimeType!,
        audioDurationS: validation.durationS!,
        audioSizeBytes: validation.sizeBytes!,
        audioSha256: validation.sha256!,
        // Store audio temporarily for future GPU processing (Phase 6)
        // audioDataBase64 is encrypted at rest by Neon
        audioDataBase64: input.audioBase64,
        embeddingModel: embeddingResult.embeddingModel,
        embeddingDim: embeddingResult.embeddingDim,
        embeddingData: embeddingResult.embeddingData,
        cloningModel: CLONING_MODEL_METADATA.model,
        cloningModelVer: CLONING_MODEL_METADATA.version,
        synthesisAvail: embeddingResult.synthesisAvailable,
        processingStartedAt: new Date(),
        processingDoneAt: new Date(),
      },
    });

    this.logger.log('VoiceCloneService: profile created', {
      tenantId: input.tenantId,
      profileId: profile.id,
      status: profile.status,
      synthesisAvail: profile.synthesisAvail,
    });

    return this.toRecord(profile);
  }

  async listClones(tenantId: string, userId?: string): Promise<VoiceCloneRecord[]> {
    const where: Record<string, unknown> = {
      tenantId,
      status: { notIn: ['INACTIVE'] as never[] },
    };
    if (userId) where.userId = userId;

    const profiles = await this.prisma.voiceCloneProfile.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, tenantId: true, userId: true, name: true, description: true,
        status: true, audioMimeType: true, audioDurationS: true, audioSizeBytes: true,
        synthesisAvail: true, cloningModel: true, cloningModelVer: true,
        failureReason: true, voiceId: true, createdAt: true, updatedAt: true,
      },
    });

    return profiles.map(p => this.toRecord(p as never));
  }

  async getClone(tenantId: string, profileId: string): Promise<VoiceCloneRecord> {
    const profile = await this.prisma.voiceCloneProfile.findFirst({
      where: { id: profileId, tenantId, status: { not: 'INACTIVE' as never } },
      select: {
        id: true, tenantId: true, userId: true, name: true, description: true,
        status: true, audioMimeType: true, audioDurationS: true, audioSizeBytes: true,
        synthesisAvail: true, cloningModel: true, cloningModelVer: true,
        failureReason: true, voiceId: true, createdAt: true, updatedAt: true,
      },
    });

    if (!profile) {
      throw new CloneError(`Voice clone '${profileId}' not found.`, CLONE_ERROR_CODES.CLONE_NOT_FOUND, 404);
    }

    return this.toRecord(profile as never);
  }

  async deleteClone(tenantId: string, userId: string, profileId: string): Promise<void> {
    const profile = await this.prisma.voiceCloneProfile.findFirst({
      where: { id: profileId, tenantId },
    });

    if (!profile) {
      throw new CloneError(`Voice clone '${profileId}' not found.`, CLONE_ERROR_CODES.CLONE_NOT_FOUND, 404);
    }

    if (profile.userId !== userId) {
      throw new CloneError('Cannot delete another user\'s voice clone.', CLONE_ERROR_CODES.CLONE_ACCESS_DENIED, 403);
    }

    // Soft delete + clear audio data for privacy
    await this.prisma.voiceCloneProfile.update({
      where: { id: profileId },
      data: {
        status: 'INACTIVE' as never,
        audioDataBase64: null,
        embeddingData: null,
      },
    });

    this.logger.log('VoiceCloneService: profile deleted', { tenantId, profileId });
  }

  async previewClone(tenantId: string, profileId: string, text?: string): Promise<Buffer> {
    const profile = await this.getClone(tenantId, profileId);

    if (!this.adapter.isSynthesisAvailable()) {
      throw new CloneError(
        SYNTHESIS_UNAVAILABLE_MESSAGE,
        CLONE_ERROR_CODES.CLONE_SYNTHESIS_UNAVAILABLE,
        503,
      );
    }

    if (profile.status !== 'PROFILE_READY' && profile.status !== 'SYNTHESIS_READY') {
      throw new CloneError(
        `Voice profile status is '${profile.status}' — must be PROFILE_READY to synthesize.`,
        CLONE_ERROR_CODES.CLONE_PROCESSING_FAILED,
        400,
      );
    }

    // Fetch full profile including audioDataBase64
    const fullProfile = await this.prisma.voiceCloneProfile.findFirst({
      where: { id: profileId, tenantId },
      select: {
        id: true, audioDataBase64: true, embeddingData: true,
        embeddingDim: true, embeddingModel: true, audioMimeType: true,
      },
    });

    if (!fullProfile?.audioDataBase64) {
      throw new CloneError(
        'Reference audio not available. Please re-upload the voice recording.',
        CLONE_ERROR_CODES.CLONE_PROCESSING_FAILED,
        400,
      );
    }

    const previewText = (text ?? 'Hello! This is my cloned voice powered by Zarax.').slice(0, 500);

    this.logger.log('VoiceCloneService: synthesis preview started', {
      tenantId, profileId,
    });

    const audioBuffer = await this.adapter.synthesizeFromClone({
      text: previewText,
      profile: {
        id: fullProfile.id,
        embeddingData: fullProfile.embeddingData,
        embeddingDim: fullProfile.embeddingDim,
        embeddingModel: fullProfile.embeddingModel,
        audioMimeType: fullProfile.audioMimeType,
        audioDataBase64: fullProfile.audioDataBase64,
      },
      requestId: `preview-${profileId}`,
      language: 'en',
    });

    // Update status to SYNTHESIS_READY after first successful synthesis
    await this.prisma.voiceCloneProfile.update({
      where: { id: profileId },
      data: { status: 'SYNTHESIS_READY' as never, synthesisAvail: true },
    });

    this.logger.log('VoiceCloneService: synthesis preview complete', {
      tenantId, profileId, audioBytes: audioBuffer.length,
    });

    return audioBuffer;
  }

  async healthCheck(): Promise<Record<string, unknown>> {
    const health = await this.adapter.healthCheck();
    return {
      adapter: this.adapter.adapterId,
      model: this.adapter.modelName,
      modelVersion: this.adapter.modelVersion,
      license: this.adapter.license,
      ...health,
      gpuVramRequiredGB: CLONING_MODEL_METADATA.gpuVramRequiredGB,
      synthesisBlockedReason: CLONING_MODEL_METADATA.synthesisBlockedReason,
    };
  }

  private toRecord(profile: {
    id: string; tenantId: string; userId: string; name: string;
    description?: string | null; status: string; audioMimeType: string;
    audioDurationS: number; audioSizeBytes: number; synthesisAvail: boolean;
    cloningModel?: string | null; cloningModelVer?: string | null;
    failureReason?: string | null; voiceId?: string | null;
    createdAt: Date; updatedAt: Date;
  }): VoiceCloneRecord {
    return {
      ...profile,
      description: profile.description ?? null,
      status: profile.status as VoiceCloneStatus,
      cloningModel: profile.cloningModel ?? null,
      cloningModelVer: profile.cloningModelVer ?? null,
      failureReason: profile.failureReason ?? null,
      voiceId: profile.voiceId ?? null,
      synthesisStatus: profile.synthesisAvail
        ? 'SYNTHESIS_READY'
        : 'SYNTHESIS_UNAVAILABLE',
    };
  }
}
