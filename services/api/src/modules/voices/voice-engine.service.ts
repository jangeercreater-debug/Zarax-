import { Inject, Injectable, Logger } from '@nestjs/common';
import { PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { ForbiddenError, NotFoundError } from '@zarax/shared-errors';
import { randomUUID } from 'node:crypto';

import { CartesiaTTSAdapter } from './adapters/cartesia-tts.adapter';
import {
  DEFAULT_AUDIO_CONTRACT,
  VOICE_ERROR_CODES,
  type SynthesizeRequest,
  type SynthesizeResponse,
  type VoiceRecord,
} from './dto/voice.types';

/**
 * Phase 1: Zarax Voice Engine
 *
 * Central orchestrator for all voice operations.
 * The application layer (controllers, agents) talks ONLY to VoiceEngineService,
 * never directly to CartesiaTTSAdapter or any specific provider.
 *
 * Architecture:
 *   Controller → VoiceEngineService → TTSAdapter → Provider
 *
 * Future phases replace/extend the adapter — no changes needed here.
 */
@Injectable()
export class VoiceEngineService {
  private readonly logger = new Logger(VoiceEngineService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly ttsAdapter: CartesiaTTSAdapter,
  ) {}

  // ─── Voice Registry ────────────────────────────────────────────────────────

  /**
   * List voices available to the tenant.
   * Returns global system voices + tenant-specific voices.
   * Private voices from other tenants are NEVER returned.
   */
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
      where.AND = [
        {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const voices = await this.prisma.voice.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { isPublic: 'desc' }, { name: 'asc' }],
    });

    return voices as unknown as VoiceRecord[];
  }

  /**
   * Get a single voice by ID.
   * Enforces tenant isolation — tenants cannot access each other's private voices.
   */
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
      const err = new NotFoundError('Voice', voiceId);
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_NOT_FOUND;
      throw err;
    }

    return voice as unknown as VoiceRecord;
  }

  /**
   * Create a tenant-owned voice in the registry.
   */
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

  /**
   * Update a tenant-owned voice.
   * System voices (tenantId = null) cannot be modified by tenants.
   */
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
      const err = new ForbiddenError('Cannot modify this voice — it may be a system voice or belong to another tenant.');
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_ACCESS_DENIED;
      throw err;
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

  /**
   * Soft-delete a voice by setting status to INACTIVE.
   * System voices cannot be deleted by tenants.
   */
  async deleteVoice(tenantId: string, voiceId: string): Promise<void> {
    const existing = await this.prisma.voice.findFirst({
      where: { id: voiceId, tenantId },
    });

    if (!existing) {
      const err = new ForbiddenError('Cannot delete this voice — it may be a system voice or belong to another tenant.');
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_ACCESS_DENIED;
      throw err;
    }

    await this.prisma.voice.update({
      where: { id: voiceId },
      data: { status: 'INACTIVE' as never },
    });

    this.logger.log('VoiceEngineService: voice deactivated', { tenantId, voiceId });
  }

  // ─── Synthesis + Preview ───────────────────────────────────────────────────

  /**
   * Synthesize audio for a voice. Used by agent calls and direct API.
   */
  async synthesize(tenantId: string, request: SynthesizeRequest): Promise<SynthesizeResponse> {
    const voice = await this.getVoice(tenantId, request.voiceId);

    if (voice.status !== 'ACTIVE') {
      const err = new ForbiddenError(`Voice '${voice.name}' is not active.`);
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_INACTIVE;
      throw err;
    }

    if (!voice.providerVoiceId) {
      const err = new Error(`Voice '${voice.name}' has no provider voice ID configured.`);
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_MODEL_NOT_CONFIGURED;
      throw err;
    }

    const requestId = request.requestId ?? randomUUID();
    const audioBuffer = await this.ttsAdapter.synthesize({ ...request, requestId }, voice.providerVoiceId);

    return {
      requestId,
      voiceId: voice.id,
      providerVoiceId: voice.providerVoiceId,
      provider: voice.provider ?? this.ttsAdapter.providerId,
      audioFormat: DEFAULT_AUDIO_CONTRACT,
      audioUrl: undefined,
    };
  }

  /**
   * Preview a voice with a short sample clip.
   * Returns raw PCM audio buffer.
   */
  async previewVoice(tenantId: string, voiceId: string, sampleText?: string): Promise<Buffer> {
    const voice = await this.getVoice(tenantId, voiceId);

    if (voice.status !== 'ACTIVE') {
      const err = new ForbiddenError(`Voice '${voice.name}' is not active.`);
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_INACTIVE;
      throw err;
    }

    if (!voice.providerVoiceId) {
      const err = new Error(`Voice '${voice.name}' has no provider voice ID — preview unavailable.`);
      (err as Record<string, unknown>)['voiceErrorCode'] = VOICE_ERROR_CODES.VOICE_PREVIEW_UNAVAILABLE;
      throw err;
    }

    return this.ttsAdapter.preview(voice.providerVoiceId, sampleText);
  }

  /**
   * Check Voice Engine health — returns adapter status.
   */
  async healthCheck(): Promise<{ provider: string; configured: boolean; healthy?: boolean; reason?: string }> {
    if (!this.ttsAdapter.isConfigured()) {
      return {
        provider: this.ttsAdapter.providerId,
        configured: false,
        reason: VOICE_ERROR_CODES.VOICE_PROVIDER_NOT_CONFIGURED,
      };
    }
    const result = await this.ttsAdapter.healthCheck();
    return { provider: this.ttsAdapter.providerId, configured: true, ...result };
  }

  /**
   * Validate a voice ID is accessible to tenant.
   * Used by agent builder to validate voiceId field.
   */
  async validateVoice(tenantId: string, voiceId: string): Promise<{ valid: boolean; voice?: VoiceRecord }> {
    try {
      const voice = await this.getVoice(tenantId, voiceId);
      return { valid: voice.status === 'ACTIVE', voice };
    } catch {
      return { valid: false };
    }
  }
}
