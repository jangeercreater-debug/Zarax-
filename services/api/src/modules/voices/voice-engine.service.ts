import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { randomUUID } from 'node:crypto';

import { CartesiaTTSAdapter } from './adapters/cartesia-tts.adapter';
import type { TTSAdapter } from './adapters/tts-adapter.interface';
import {
  DEFAULT_AUDIO_CONTRACT,
  VOICE_ERROR_CODES,
  type SynthesizeRequest,
  type SynthesizeResponse,
  type VoiceRecord,
} from './dto/voice.types';

class VoiceError extends Error {
  voiceErrorCode: string;
  status: number;
  constructor(message: string, code: string, status = 400) {
    super(message);
    this.voiceErrorCode = code;
    this.status = status;
  }
}

@Injectable()
export class VoiceEngineService {
  private readonly logger = new Logger(VoiceEngineService.name);
  private readonly adapter: TTSAdapter | null;

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    /**
     * CartesiaTTSAdapter is OPTIONAL — Phase 1 Voice Registry and CRUD work
     * without any TTS provider configured. Preview and synthesis return
     * VOICE_PROVIDER_NOT_CONFIGURED when no adapter is available.
     * Phase 2 will wire in the open-source TTS adapter.
     */
    @Optional() cartesiaAdapter?: CartesiaTTSAdapter,
  ) {
    this.adapter = cartesiaAdapter?.isConfigured() ? cartesiaAdapter : null;
    this.logger.log(
      this.adapter
        ? `VoiceEngine: TTS adapter ready (${this.adapter.providerId})`
        : 'VoiceEngine: No TTS adapter configured — CRUD/Registry available, synthesis/preview will return VOICE_PROVIDER_NOT_CONFIGURED',
    );
  }

  // ─── Voice Registry (works without TTS adapter) ───────────────────────────

  async listVoices(tenantId: string, filters?: {
    gender?: string;
    language?: string;
    voiceType?: string;
    status?: string;
    search?: string;
  }): Promise<VoiceRecord[]> {
    const where: Record<string, unknown> = {
      OR: [
        { isPublic: true, tenantId: null },
        { tenantId },
      ],
      status: filters?.status ?? 'ACTIVE',
    };

    if (filters?.gender) where.gender = filters.gender.toUpperCase();
    if (filters?.language) where.language = { contains: filters.language, mode: 'insensitive' };
    if (filters?.voiceType) where.voiceType = filters.voiceType.toUpperCase();
    if (filters?.search) {
      where.AND = [{
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
        ],
      }];
    }

    const voices = await this.prisma.voice.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { isPublic: 'desc' }, { name: 'asc' }],
    });

    return voices as unknown as VoiceRecord[];
  }

  async getVoice(tenantId: string, voiceId: string): Promise<VoiceRecord> {
    const voice = await this.prisma.voice.findFirst({
      where: {
        id: voiceId,
        OR: [
          { isPublic: true, tenantId: null },
          { tenantId },
        ],
      },
    });

    if (!voice) {
      throw new VoiceError(`Voice '${voiceId}' was not found.`, VOICE_ERROR_CODES.VOICE_NOT_FOUND, 404);
    }

    return voice as unknown as VoiceRecord;
  }

  async createVoice(tenantId: string, data: {
    name: string;
    description?: string;
    voiceType?: string;
    gender?: string;
    language?: string;
    languages?: string[];
    accent?: string;
    ageRange?: string;
    style?: string;
    defaultEmotion?: string;
    provider?: string;
    providerVoiceId?: string;
    model?: string;
    speakerId?: string;
    isDefault?: boolean;
    metadata?: Record<string, unknown>;
    sampleAudioUrl?: string;
  }): Promise<VoiceRecord> {
    const voice = await this.prisma.voice.create({
      data: {
        tenantId,
        name: data.name,
        description: data.description ?? null,
        voiceType: (data.voiceType ?? 'CUSTOM') as never,
        gender: (data.gender ?? 'NEUTRAL') as never,
        language: data.language ?? 'en',
        languages: data.languages ?? [],
        accent: data.accent ?? null,
        ageRange: data.ageRange ?? null,
        style: data.style ?? null,
        defaultEmotion: data.defaultEmotion ?? null,
        provider: data.provider ?? null,
        providerVoiceId: data.providerVoiceId ?? null,
        model: data.model ?? null,
        speakerId: data.speakerId ?? null,
        isDefault: data.isDefault ?? false,
        metadata: (data.metadata ?? null) as never,
        sampleAudioUrl: data.sampleAudioUrl ?? null,
        status: 'ACTIVE',
        isPublic: false,
      },
    });

    this.logger.log('VoiceEngineService: voice created', {
      tenantId, voiceId: voice.id, name: voice.name,
    });

    return voice as unknown as VoiceRecord;
  }

  async updateVoice(tenantId: string, voiceId: string, data: Partial<{
    name: string;
    description: string;
    gender: string;
    language: string;
    languages: string[];
    accent: string;
    style: string;
    defaultEmotion: string;
    provider: string;
    providerVoiceId: string;
    model: string;
    status: string;
    isDefault: boolean;
    metadata: Record<string, unknown>;
    sampleAudioUrl: string;
  }>): Promise<VoiceRecord> {
    const existing = await this.prisma.voice.findFirst({
      where: { id: voiceId, tenantId },
    });

    if (!existing) {
      throw new VoiceError(
        'Cannot modify this voice — it may be a system voice or belong to another tenant.',
        VOICE_ERROR_CODES.VOICE_ACCESS_DENIED,
        403,
      );
    }

    const update: Record<string, unknown> = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.description !== undefined) update.description = data.description;
    if (data.gender !== undefined) update.gender = data.gender.toUpperCase();
    if (data.language !== undefined) update.language = data.language;
    if (data.languages !== undefined) update.languages = data.languages;
    if (data.accent !== undefined) update.accent = data.accent;
    if (data.style !== undefined) update.style = data.style;
    if (data.defaultEmotion !== undefined) update.defaultEmotion = data.defaultEmotion;
    if (data.provider !== undefined) update.provider = data.provider;
    if (data.providerVoiceId !== undefined) update.providerVoiceId = data.providerVoiceId;
    if (data.model !== undefined) update.model = data.model;
    if (data.status !== undefined) update.status = data.status.toUpperCase();
    if (data.isDefault !== undefined) update.isDefault = data.isDefault;
    if (data.metadata !== undefined) update.metadata = data.metadata;
    if (data.sampleAudioUrl !== undefined) update.sampleAudioUrl = data.sampleAudioUrl;

    const updated = await this.prisma.voice.update({
      where: { id: voiceId },
      data: update as never,
    });

    this.logger.log('VoiceEngineService: voice updated', { tenantId, voiceId });
    return updated as unknown as VoiceRecord;
  }

  async deleteVoice(tenantId: string, voiceId: string): Promise<void> {
    const existing = await this.prisma.voice.findFirst({
      where: { id: voiceId, tenantId },
    });

    if (!existing) {
      throw new VoiceError(
        'Cannot delete this voice — it may be a system voice or belong to another tenant.',
        VOICE_ERROR_CODES.VOICE_ACCESS_DENIED,
        403,
      );
    }

    await this.prisma.voice.update({
      where: { id: voiceId },
      data: { status: 'INACTIVE' as never },
    });

    this.logger.log('VoiceEngineService: voice deactivated', { tenantId, voiceId });
  }

  // ─── Synthesis + Preview (require TTS adapter) ────────────────────────────

  private requireAdapter(): TTSAdapter {
    if (!this.adapter) {
      throw new VoiceError(
        'No TTS provider is configured. Phase 2 will add the open-source TTS engine.',
        VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED,
        503,
      );
    }
    return this.adapter;
  }

  async synthesize(tenantId: string, request: SynthesizeRequest): Promise<SynthesizeResponse> {
    const adapter = this.requireAdapter();
    const voice = await this.getVoice(tenantId, request.voiceId);

    if (voice.status !== 'ACTIVE') {
      throw new VoiceError(`Voice '${voice.name}' is not active.`, VOICE_ERROR_CODES.VOICE_INACTIVE, 400);
    }

    if (!voice.providerVoiceId) {
      throw new VoiceError(
        `Voice '${voice.name}' has no provider voice ID configured.`,
        VOICE_ERROR_CODES.VOICE_MODEL_NOT_CONFIGURED,
        400,
      );
    }

    const requestId = request.requestId ?? randomUUID();
    await adapter.synthesize({ ...request, requestId }, voice.providerVoiceId);

    return {
      requestId,
      voiceId: voice.id,
      providerVoiceId: voice.providerVoiceId,
      provider: voice.provider ?? adapter.providerId,
      audioFormat: DEFAULT_AUDIO_CONTRACT,
      audioUrl: undefined,
    };
  }

  async previewVoice(tenantId: string, voiceId: string, sampleText?: string): Promise<Buffer> {
    const adapter = this.requireAdapter();
    const voice = await this.getVoice(tenantId, voiceId);

    if (voice.status !== 'ACTIVE') {
      throw new VoiceError(`Voice '${voice.name}' is not active.`, VOICE_ERROR_CODES.VOICE_INACTIVE, 400);
    }

    if (!voice.providerVoiceId) {
      throw new VoiceError(
        `Voice '${voice.name}' has no provider voice ID — preview unavailable.`,
        VOICE_ERROR_CODES.VOICE_PREVIEW_UNAVAILABLE,
        400,
      );
    }

    return adapter.preview(voice.providerVoiceId, sampleText ?? undefined);
  }

  /** Returns the active TTSAdapter for direct use by VoiceDesignService. */
  getActiveAdapter(): TTSAdapter | null {
    return this.adapter;
  }
  
  async healthCheck(): Promise<{ provider: string | null; configured: boolean; healthy?: boolean; reason?: string }> {
    if (!this.adapter) {
      return {
        provider: null,
        configured: false,
        reason: VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED,
      };
    }
    const result = await this.adapter.healthCheck();
    return { provider: this.adapter.providerId, configured: true, ...result };
  }

  async validateVoice(tenantId: string, voiceId: string): Promise<{ valid: boolean; voice?: VoiceRecord }> {
    try {
      const voice = await this.getVoice(tenantId, voiceId);
      return { valid: voice.status === 'ACTIVE', voice };
    } catch {
      return { valid: false };
    }
  }
}
