import {
  Body, Controller, HttpCode, HttpStatus, Post, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from '@zarax/audit-log';
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import { VoiceDesignService } from './voice-design.service';
import { DesignVoiceDto, PreviewCandidateDto, SaveDesignedVoiceDto } from './dto/design-voice.dto';

@ApiTags('voice-design')
@Controller('voices/design')
export class VoiceDesignController {
  constructor(
    private readonly designService: VoiceDesignService,
    private readonly auditLog: AuditLogService,
  ) {}

  @RequirePermission(PERMISSIONS.VOICES_DESIGN)
  @ApiOperation({ summary: 'Parse a natural-language voice prompt and return ranked candidates.' })
  @Post()
  async design(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: DesignVoiceDto,
  ) {
    const result = await this.designService.design(principal.tenantId, dto.prompt);

    await this.auditLog.record({
      principal,
      action: 'voice.design.requested',
      resourceType: 'voice',
      resourceId: result.requestId,
      metadata: { promptLength: dto.prompt.length, candidates: result.candidates.length },
    });

    return { data: result };
  }

  @RequirePermission(PERMISSIONS.VOICES_PREVIEW)
  @ApiOperation({ summary: 'Generate a real TTS preview for a design candidate.' })
  @Post('preview')
  @HttpCode(HttpStatus.OK)
  async previewCandidate(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: PreviewCandidateDto,
    @Res() res: Response,
  ): Promise<void> {
    const audioBuffer = await this.designService.previewCandidate(
      principal.tenantId,
      dto.providerVoiceId,
      dto.sampleText,
    );

    await this.auditLog.record({
      principal,
      action: 'voice.previewed',
      resourceType: 'voice',
      resourceId: dto.providerVoiceId,
      metadata: { source: 'design-preview' },
    });

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('X-Provider-Voice-Id', dto.providerVoiceId);
    res.end(audioBuffer);
  }

  @RequirePermission(PERMISSIONS.VOICES_CREATE)
  @ApiOperation({ summary: 'Save a designed voice to the tenant Voice Registry.' })
  @Post('save')
  async saveDesignedVoice(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: SaveDesignedVoiceDto,
  ) {
    const voice = await this.designService.saveVoice(principal.tenantId, {
      name: dto.name,
      description: dto.description,
      providerVoiceId: dto.providerVoiceId,
      profile: {
        gender: dto.profile.gender as 'MALE' | 'FEMALE' | 'NEUTRAL',
        ageStyle: dto.profile.ageStyle as 'child' | 'young-adult' | 'adult' | 'senior',
        accent: dto.profile.accent,
        tone: dto.profile.tone,
        personality: dto.profile.personality,
        speakingStyle: dto.profile.speakingStyle,
        speed: dto.profile.speed,
        energy: dto.profile.energy,
        languages: dto.profile.languages,
        tags: dto.profile.tags,
      },
    });

    await this.auditLog.record({
      principal,
      action: 'voice.created',
      resourceType: 'voice',
      resourceId: voice.id,
      metadata: { name: voice.name, source: 'voice-design', providerVoiceId: dto.providerVoiceId },
    });

    return { data: voice };
  }
}
