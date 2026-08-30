import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus,
  Param, Patch, Post, Query, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditLogService } from '@zarax/audit-log';
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import { VoiceEngineService } from './voice-engine.service';
import { CreateVoiceDto } from './dto/create-voice.dto';
import { UpdateVoiceDto } from './dto/update-voice.dto';
import { PreviewVoiceDto } from './dto/preview-voice.dto';

@ApiTags('voices')
@Controller('voices')
export class VoicesController {
  constructor(
    private readonly voiceEngine: VoiceEngineService,
    private readonly auditLog: AuditLogService,
  ) {}

  @RequirePermission(PERMISSIONS.VOICES_READ)
  @ApiOperation({ summary: 'List voices available to the tenant (system + tenant-owned).' })
  @Get()
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query('gender') gender?: string,
    @Query('language') language?: string,
    @Query('voiceType') voiceType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    const voices = await this.voiceEngine.listVoices(principal.tenantId, {
      gender, language, voiceType, status, search,
    });
    return { data: voices, total: voices.length };
  }

  @RequirePermission(PERMISSIONS.VOICES_READ)
  @ApiOperation({ summary: 'Get a single voice by ID.' })
  @Get(':id')
  async getOne(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    const voice = await this.voiceEngine.getVoice(principal.tenantId, id);
    return { data: voice };
  }

  @RequirePermission(PERMISSIONS.VOICES_CREATE)
  @ApiOperation({ summary: 'Create a new tenant voice.' })
  @Post()
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: CreateVoiceDto,
  ) {
    const voice = await this.voiceEngine.createVoice(principal.tenantId, dto);

    await this.auditLog.record({
      principal,
      action: 'voice.created',
      resourceType: 'voice',
      resourceId: voice.id,
      metadata: { name: voice.name, voiceType: voice.voiceType },
    });

    return { data: voice };
  }

  @RequirePermission(PERMISSIONS.VOICES_UPDATE)
  @ApiOperation({ summary: 'Update a tenant-owned voice.' })
  @Patch(':id')
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateVoiceDto,
  ) {
    const voice = await this.voiceEngine.updateVoice(principal.tenantId, id, dto);

    await this.auditLog.record({
      principal,
      action: 'voice.updated',
      resourceType: 'voice',
      resourceId: id,
      metadata: { updatedFields: Object.keys(dto) },
    });

    return { data: voice };
  }

  @RequirePermission(PERMISSIONS.VOICES_DELETE)
  @ApiOperation({ summary: 'Deactivate (soft-delete) a tenant-owned voice.' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ): Promise<void> {
    await this.voiceEngine.deleteVoice(principal.tenantId, id);

    await this.auditLog.record({
      principal,
      action: 'voice.deleted',
      resourceType: 'voice',
      resourceId: id,
    });
  }

  @RequirePermission(PERMISSIONS.VOICES_PREVIEW)
  @ApiOperation({ summary: 'Preview a voice with a short audio sample.' })
  @Post(':id/preview')
  async preview(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
    @Body() dto: PreviewVoiceDto,
    @Res() res: Response,
  ): Promise<void> {
    const audioBuffer = await this.voiceEngine.previewVoice(
      principal.tenantId,
      id,
      dto.sampleText,
    );

    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', audioBuffer.length);
    res.setHeader('X-Voice-Id', id);
    res.end(audioBuffer);
  }

  @RequirePermission(PERMISSIONS.VOICES_READ)
  @ApiOperation({ summary: 'Voice Engine health check — adapter status.' })
  @Get('engine/health')
  async engineHealth() {
    const health = await this.voiceEngine.healthCheck();
    return { data: health };
  }

  @RequirePermission(PERMISSIONS.VOICES_READ)
  @ApiOperation({ summary: 'Validate a voiceId is accessible to this tenant.' })
  @Get(':id/validate')
  async validate(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    const result = await this.voiceEngine.validateVoice(principal.tenantId, id);
    return { data: result };
  }

  @RequirePermission(PERMISSIONS.VOICES_READ)
  @ApiOperation({ summary: 'Get honest capability declaration for a voice (Phase 5).' })
  @Get(':id/capabilities')
  async getCapabilities(
    @CurrentPrincipal() principal: Principal,
    @Param('id') id: string,
  ) {
    const capabilities = await this.voiceEngine.getVoiceCapabilities(principal.tenantId, id);

    await this.auditLog.record({
      principal,
      action: 'voice.capabilities.requested',
      resourceType: 'voice',
      resourceId: id,
    });

    return { data: capabilities };
  }
}
