import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentPrincipal } from '@zarax/shared-auth';
import type { Principal } from '@zarax/shared-types';

import { ChangePasswordDto } from './dto/change-password.dto';
import type {
  MembershipResponseDto,
  ProfileResponseDto,
  SessionResponseDto,
} from './dto/profile-response.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users/me')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: "Get the current user's profile." })
  @Get()
  async getProfile(@CurrentPrincipal() principal: Principal): Promise<ProfileResponseDto> {
    return this.usersService.getProfile(principal.id);
  }

  @ApiOperation({ summary: "Update the current user's profile." })
  @Patch()
  async updateProfile(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    return this.usersService.updateProfile(principal.id, dto);
  }

  @ApiOperation({
    summary: 'Change the current password. Revokes every other session, keeping this one signed in.',
  })
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  async changePassword(
    @CurrentPrincipal() principal: Principal,
    @Body() dto: ChangePasswordDto,
  ): Promise<{ success: true }> {
    await this.usersService.changePassword(principal, dto);
    return { success: true };
  }

  @ApiOperation({ summary: 'List every organization (tenant) the current user belongs to.' })
  @Get('tenants')
  async listTenants(@CurrentPrincipal() principal: Principal): Promise<MembershipResponseDto[]> {
    return this.usersService.listMemberships(principal.id);
  }

  @ApiOperation({ summary: 'List active sessions for the current user.' })
  @Get('sessions')
  async listSessions(@CurrentPrincipal() principal: Principal): Promise<SessionResponseDto[]> {
    return this.usersService.listSessions(principal);
  }

  @ApiOperation({ summary: 'Revoke a specific session (e.g. sign out a lost device).' })
  @HttpCode(HttpStatus.OK)
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentPrincipal() principal: Principal,
    @Param('id') sessionId: string,
  ): Promise<{ success: true }> {
    await this.usersService.revokeSession(principal, sessionId);
    return { success: true };
  }
}
