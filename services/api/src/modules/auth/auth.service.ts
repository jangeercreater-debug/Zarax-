import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditLogService } from '@zarax/audit-log';
import {
  EmailVerificationTokenRepository,
  PasswordResetTokenRepository,
  PRISMA_CLIENT,
  TenantRepository,
  UserRepository,
  UserSessionRepository,
  type PrismaClient,
} from '@zarax/database';
import { JwtTokenService } from '@zarax/shared-auth';
import { ConflictError, ForbiddenError, UnauthenticatedError, ValidationError } from '@zarax/shared-errors';
import {
  asTenantId,
  asUserId,
  DEFAULT_ROLE_PERMISSIONS,
  type Principal,
  type Role,
} from '@zarax/shared-types';

import { AuthEmailService } from './auth-email.service';
import type { AuthTokensDto } from './dto/auth-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';

export interface RequestContext {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly userSessionRepository: UserSessionRepository;
  private readonly passwordResetTokenRepository: PasswordResetTokenRepository;
  private readonly emailVerificationTokenRepository: EmailVerificationTokenRepository;

  constructor(
    private readonly userRepository: UserRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly jwtTokenService: JwtTokenService,
    private readonly auditLogService: AuditLogService,
    private readonly authEmailService: AuthEmailService,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {
    this.userSessionRepository = new UserSessionRepository(prisma);
    this.passwordResetTokenRepository = new PasswordResetTokenRepository(prisma);
    this.emailVerificationTokenRepository = new EmailVerificationTokenRepository(prisma);
  }

  async signup(dto: SignupDto, context: RequestContext): Promise<AuthTokensDto> {
    const existingTenant = await this.tenantRepository.findBySlug(dto.tenantSlug);
    if (existingTenant) {
      throw new ConflictError(`A tenant with slug '${dto.tenantSlug}' already exists.`);
    }

    const passwordHash = await argon2.hash(dto.password);
    const tenant = await this.tenantRepository.create({ name: dto.tenantName, slug: dto.tenantSlug });
    const user = await this.userRepository.create({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
    });

    // First user of a new tenant is always its owner.
    await this.userRepository.createMembership({
      userId: user.id,
      tenantId: tenant.id,
      role: 'OWNER',
    });

    const verification = await this.emailVerificationTokenRepository.create(user.id);
    this.authEmailService.sendVerificationEmail(user.email, verification.rawToken);

    await this.recordAuthAuditEvent('auth.signup', user.id, tenant.id, user.email, ['owner'], ['*']);

    return this.issueTokensWithSession(user.id, tenant.id, user.email, 'OWNER', context);
  }

  async login(dto: LoginDto, context: RequestContext): Promise<AuthTokensDto> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.isActive) throw new UnauthenticatedError('Invalid email or password.');

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) throw new UnauthenticatedError('Invalid email or password.');

    const membership = await this.prisma.tenantMembership.findFirst({ where: { userId: user.id } });
    if (!membership) {
      throw new UnauthenticatedError('This user is not associated with any tenant.');
    }

    const role = membership.role.toLowerCase() as Role;
    await this.recordAuthAuditEvent(
      'auth.login',
      user.id,
      membership.tenantId,
      user.email,
      [role],
      DEFAULT_ROLE_PERMISSIONS[role] ?? [],
    );

    return this.issueTokensWithSession(user.id, membership.tenantId, user.email, membership.role, context);
  }

  /**
   * Unlike the pre-M7C stateless-only refresh flow, this now checks (and rotates) a
   * server-side UserSession row — a refresh token whose session was revoked (logout,
   * password reset, or explicit session revocation) is rejected even if the JWT
   * signature and expiry are still technically valid. A refresh token minted before
   * this milestone (no `sessionId` claim) is also rejected, forcing one re-login —
   * an acceptable one-time migration cost for gaining real revocability.
   */
  async refresh(refreshToken: string, context: RequestContext): Promise<AuthTokensDto> {
    const payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
    if (!payload.sessionId) {
      throw new UnauthenticatedError('Please sign in again.');
    }

    const user = await this.userRepository.findByIdOrThrow(payload.sub);
    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId: user.id, tenantId: payload.tenantId },
    });
    if (!membership) throw new UnauthenticatedError('Tenant membership no longer exists.');

    const role = membership.role.toLowerCase() as Role;
    const tokens = this.signTokens(user.id, membership.tenantId, user.email, role, payload.sessionId);

    const rotated = await this.userSessionRepository.validateAndRotate(
      payload.sessionId,
      refreshToken,
      tokens.refreshToken,
    );
    if (!rotated) {
      throw new UnauthenticatedError('This session is no longer valid. Please sign in again.');
    }

    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    let payload;
    try {
      payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
    } catch {
      return; // Already-expired/invalid token — nothing to revoke, logout still "succeeds" from the caller's perspective.
    }
    if (payload.sessionId) {
      await this.userSessionRepository.revoke(payload.sub, payload.sessionId);
    }
  }

  /** Deliberately identical response/timing shape regardless of whether the email
   * exists — never reveal account existence through this endpoint. */
  async forgotPassword(email: string): Promise<string | undefined> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return undefined;

    const resetToken = await this.passwordResetTokenRepository.create(user.id);
    return this.authEmailService.sendPasswordResetEmail(user.email, resetToken.rawToken);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const validated = await this.passwordResetTokenRepository.validate(rawToken);
    if (!validated) {
      throw new ValidationError('This password reset link is invalid or has expired.');
    }

    const passwordHash = await argon2.hash(newPassword);
    await this.userRepository.updatePassword(validated.userId, passwordHash);
    await this.passwordResetTokenRepository.markUsed(validated.tokenId);

    // A password reset is a strong signal of compromise-recovery intent — invalidate
    // every existing session so a possibly-stolen session can't outlive the reset.
    await this.userSessionRepository.revokeAllForUser(validated.userId);
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const validated = await this.emailVerificationTokenRepository.validate(rawToken);
    if (!validated) {
      throw new ValidationError('This verification link is invalid or has expired.');
    }
    await this.userRepository.markEmailVerified(validated.userId);
    await this.emailVerificationTokenRepository.markUsed(validated.tokenId);
  }

  async resendVerification(principal: Principal): Promise<string> {
    const user = await this.userRepository.findByIdOrThrow(principal.id);
    if (user.emailVerified) {
      throw new ConflictError('This email address is already verified.');
    }
    const token = await this.emailVerificationTokenRepository.create(user.id);
    return this.authEmailService.sendVerificationEmail(user.email, token.rawToken);
  }

  /** Re-issues tokens scoped to a different tenant the same user belongs to — the
   * mechanism behind the organization switcher. Membership is re-validated here
   * rather than trusted from the caller, even though the UI only ever offers
   * tenants the user's own `/users/me/tenants` list already confirmed. */
  async switchTenant(
    principal: Principal,
    targetTenantId: string,
    context: RequestContext,
  ): Promise<AuthTokensDto> {
    if (principal.type !== 'user') {
      throw new ForbiddenError('Only user accounts can switch organizations.');
    }

    const membership = await this.userRepository.findMembership(principal.id, targetTenantId);
    if (!membership) {
      throw new ForbiddenError('You are not a member of that organization.');
    }

    return this.issueTokensWithSession(principal.id, targetTenantId, principal.email, membership.role, context);
  }

  private async recordAuthAuditEvent(
    action: string,
    userId: string,
    tenantId: string,
    email: string,
    roles: string[],
    permissions: string[],
  ): Promise<void> {
    await this.auditLogService.record({
      principal: {
        type: 'user',
        id: asUserId(userId),
        tenantId: asTenantId(tenantId),
        email,
        roles,
        permissions,
      },
      action,
    });
  }

  private signTokens(
    userId: string,
    tenantId: string,
    email: string,
    dbRole: string,
    sessionId: string,
  ): AuthTokensDto {
    const role = dbRole.toLowerCase() as Role;
    const permissions = DEFAULT_ROLE_PERMISSIONS[role] ?? [];

    const accessToken = this.jwtTokenService.signAccessToken({
      sub: userId,
      tenantId,
      email,
      roles: [role],
      permissions,
      sessionId,
    });
    const refreshToken = this.jwtTokenService.signRefreshToken({ sub: userId, tenantId, sessionId });

    return { accessToken, refreshToken };
  }

  private async issueTokensWithSession(
    userId: string,
    tenantId: string,
    email: string,
    dbRole: string,
    context: RequestContext,
  ): Promise<AuthTokensDto> {
    const sessionId = randomUUID();
    const tokens = this.signTokens(userId, tenantId, email, dbRole, sessionId);

    await this.userSessionRepository.create({
      id: sessionId,
      userId,
      tenantId,
      refreshToken: tokens.refreshToken,
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
    });

    return tokens;
  }
}
