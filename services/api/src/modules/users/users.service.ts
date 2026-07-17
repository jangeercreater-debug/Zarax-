import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditLogService } from '@zarax/audit-log';
import { PRISMA_CLIENT, UserRepository, UserSessionRepository, type PrismaClient } from '@zarax/database';
import { ForbiddenError, UnauthenticatedError } from '@zarax/shared-errors';
import type { Principal } from '@zarax/shared-types';

import type { ChangePasswordDto } from './dto/change-password.dto';
import type {
  MembershipResponseDto,
  ProfileResponseDto,
  SessionResponseDto,
} from './dto/profile-response.dto';
import type { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  private readonly userSessionRepository: UserSessionRepository;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly auditLogService: AuditLogService,
    @Inject(PRISMA_CLIENT) prisma: PrismaClient,
  ) {
    this.userSessionRepository = new UserSessionRepository(prisma);
  }

  async getProfile(userId: string): Promise<ProfileResponseDto> {
    const user = await this.userRepository.findByIdOrThrow(userId);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
    };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileResponseDto> {
    const user = await this.userRepository.updateProfile(userId, dto);
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
    };
  }

  async changePassword(principal: Principal, dto: ChangePasswordDto): Promise<void> {
    const user = await this.userRepository.findByIdOrThrow(principal.id);

    const currentValid = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!currentValid) {
      throw new UnauthenticatedError('Current password is incorrect.');
    }

    const newPasswordHash = await argon2.hash(dto.newPassword);
    await this.userRepository.updatePassword(user.id, newPasswordHash);

    // Changing your own password (unlike a forgot-password reset) keeps the current
    // session alive — only every *other* session is revoked, so you aren't
    // immediately signed out of the device you just used to change it.
    const currentSessionId = principal.type === 'user' ? principal.sessionId : undefined;
    await this.userSessionRepository.revokeAllForUser(user.id, currentSessionId);

    await this.auditLogService.record({ principal, action: 'user.password_changed' });
  }

  async listMemberships(userId: string): Promise<MembershipResponseDto[]> {
    return this.userRepository.listMemberships(userId);
  }

  async listSessions(principal: Principal): Promise<SessionResponseDto[]> {
    const sessions = await this.userSessionRepository.listForUser(principal.id);
    const currentSessionId = principal.type === 'user' ? principal.sessionId : undefined;

    return sessions.map((session) => ({
      id: session.id,
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt.toISOString(),
      lastUsedAt: session.lastUsedAt.toISOString(),
      isCurrent: session.id === currentSessionId,
    }));
  }

  async revokeSession(principal: Principal, sessionId: string): Promise<void> {
    const revoked = await this.userSessionRepository.revoke(principal.id, sessionId);
    if (!revoked) {
      throw new ForbiddenError('That session does not exist or has already been revoked.');
    }
    await this.auditLogService.record({
      principal,
      action: 'user.session_revoked',
      resourceType: 'session',
      resourceId: sessionId,
    });
  }
}
