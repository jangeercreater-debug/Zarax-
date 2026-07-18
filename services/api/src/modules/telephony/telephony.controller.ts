import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal, RequirePermission } from '@zarax/shared-auth';
import { CallRepository, PhoneNumberRepository, PRISMA_CLIENT, type PrismaClient } from '@zarax/database';
import { PERMISSIONS, type Principal } from '@zarax/shared-types';

import { AssignAgentDto, CreatePhoneNumberDto } from './dto/phone-number.dto';

@ApiTags('telephony')
@Controller('telephony')
export class TelephonyController {
  private readonly phoneRepo: PhoneNumberRepository;
  private readonly callRepo: CallRepository;

  constructor(@Inject(PRISMA_CLIENT) prisma: PrismaClient) {
    this.phoneRepo = new PhoneNumberRepository(prisma);
    this.callRepo = new CallRepository(prisma);
  }

  // ── Phone numbers ──────────────────────────────────────────────
  @RequirePermission(PERMISSIONS.TELEPHONY_MANAGE)
  @ApiOperation({ summary: 'List phone numbers for the tenant.' })
  @Get('phone-numbers')
  listPhoneNumbers(@CurrentPrincipal() principal: Principal) {
    return this.phoneRepo.listForTenant(principal.tenantId);
  }

  @RequirePermission(PERMISSIONS.TELEPHONY_MANAGE)
  @ApiOperation({ summary: 'Register a phone number.' })
  @Post('phone-numbers')
  createPhoneNumber(@CurrentPrincipal() principal: Principal, @Body() dto: CreatePhoneNumberDto) {
    return this.phoneRepo.create({ tenantId: principal.tenantId, ...dto });
  }

  @RequirePermission(PERMISSIONS.TELEPHONY_MANAGE)
  @ApiOperation({ summary: 'Assign or unassign an agent from a phone number.' })
  @Post('phone-numbers/:id/assign')
  assignAgent(@CurrentPrincipal() principal: Principal, @Param('id') id: string, @Body() dto: AssignAgentDto) {
    return this.phoneRepo.assignAgent(principal.tenantId, id, dto.agentId);
  }

  @RequirePermission(PERMISSIONS.TELEPHONY_MANAGE)
  @ApiOperation({ summary: 'Delete a phone number.' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('phone-numbers/:id')
  deletePhoneNumber(@CurrentPrincipal() principal: Principal, @Param('id') id: string) {
    return this.phoneRepo.delete(principal.tenantId, id);
  }

  // ── Call history ───────────────────────────────────────────────
  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: 'List call history (most recent first, up to 50).' })
  @Get('calls')
  listCalls(@CurrentPrincipal() principal: Principal) {
    return this.callRepo.listForTenant(principal.tenantId);
  }

  @RequirePermission(PERMISSIONS.CALLS_READ)
  @ApiOperation({ summary: 'List currently active calls.' })
  @Get('calls/active')
  listActiveCalls(@CurrentPrincipal() principal: Principal) {
    return this.callRepo.listActive(principal.tenantId);
  }
}
