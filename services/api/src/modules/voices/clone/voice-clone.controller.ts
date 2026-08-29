import {
  Body, Controller, Delete, Get, HttpCode,
  HttpStatus, Param, Post, Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from '@zarax/audit-log';
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import { CONSENT_STATEMENT_V1, CLONING_MODEL_METADATA, SYNTHESIS_UNAVAILABLE_MESSAGE } from './voice-clone.types';
import { VoiceCloneService } from './voice-clone.service';
import { InitiateCloneDto } from './dto/initiate-clone.dto';

@ApiTags('voice-clone')
@Controller('voices/clone')
export class VoiceCloneController {
  constructor(
    private readonly cloneService: VoiceCloneService,
    private readonly auditLog: AuditLogService,
  ) {}

  @RequirePermission(PERMISSIONS.VOICES_READ)
  @ApiOperation({ summary: 'Get consent statement text + model metadata for clone UI.' })
  @Get('info')
  getInfo() {
    return {
      data: {
        consentStatement: CONSENT_STATEMENT_V1,
        consentVersion: 'V1',
        model: CLONING_MODEL_METADATA.model,
        modelVersion: CLONING_MODEL_METADATA.version,
        license: CLONING_MODEL_METADATA.license,
        synthesisAvailable: CLONING_MODEL_METADATA.synthesisAvailable,
        synthesisUnavailableMessage: SYNTHESIS_UNAVAILABLE_MESSAGE,
        audioLimits: {
          maxSizeMB: 5,
          minDurationS: 5,
          maxDurationS: 120,
          acceptedFormats: ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4'],
        },
      },
    };
  }

  @RequirePermission(PERMISSIONS.VOICES_CLONE)
  @ApiOperation({ summary: 'Initiate voice cloning: consent + audio upload + profile creation.' })
  @Post()
  async initiateClone(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: InitiateCloneDto,
    @Req() req: Request,
  ) {
    const profile = await this.cloneService.initiateClone({
      tenantId: principal.tenantId,
      userId: principal.id,
      name: dto.name,
      description: dto.description,
      audioBase64: dto.audioBase64,
      audioMimeType: dto.audioMimeType,
      consentText: dto.consentText,
      consentVersion: dto.consentVersion,
      consentedAt: dto.consentedAt,
      isSelfVoice: dto.isSelfVoice,
      language: dto.language,
      ipAddress: (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim()
        ?? req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });

    await this.auditLog.record({
      principal,
      action: 'voice.clone.initiated',
      resourceType: 'voice_clone',
      resourceId: profile.id,
      metadata: {
        name: profile.name,
        status: profile.status,
        synthesisAvail: profile.synthesisAvail,
        model: CLONING_MODEL_METADATA.model,
      },
    });

    return { data: profile };
  }

  @RequirePermission(PERMISSIONS.VOICES_CLONE)
  @ApiOperation({ summary: 'List voice clone profiles for the current tenant.' })
  @Get()
  async listClones(@CurrentPrincipal() principal: Principal) {
    const profiles = await this.cloneService.listClones(principal.tenantId, principal.id);
    return { data: profiles, total: profiles.length };
  }

  @RequirePermission(PERMISSIONS.VOICES_CLONE)
  @ApiOperation({ summary: 'Get voice clone profile status.' })
  @Get(':id')
  async getClone(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    const profile = await this.cloneService.getClone(principal.tenantId, id);
    return { data: profile };
  }

  @RequirePermission(PERMISSIONS.VOICES_CLONE)
  @ApiOperation({ summary: 'Delete a voice clone profile (soft delete + audio cleared).' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteClone(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<void> {
    await this.cloneService.deleteClone(principal.tenantId, principal.id, id);
    await this.auditLog.record({
      principal,
      action: 'voice.clone.deleted',
      resourceType: 'voice_clone',
      resourceId: id,
    });
  }

  @RequirePermission(PERMISSIONS.VOICES_PREVIEW)
  @ApiOperation({ summary: 'Preview cloned voice — returns SYNTHESIS_UNAVAILABLE until GPU available.' })
  @Post(':id/preview')
  @HttpCode(HttpStatus.OK)
  async previewClone(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    // This always returns structured unavailable — never fake audio
    await this.cloneService.previewClone(principal.tenantId, id);
  }

  @RequirePermission(PERMISSIONS.VOICES_READ)
  @ApiOperation({ summary: 'Voice clone engine health check.' })
  @Get('engine/health')
  async engineHealth() {
    const health = await this.cloneService.healthCheck();
    return { data: health };
  }
}
