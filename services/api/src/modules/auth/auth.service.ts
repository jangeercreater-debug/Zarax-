import { Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { TenantRepository, UserRepository, type PrismaClient } from '@zarax/database';
import { JwtTokenService } from '@zarax/shared-auth';
import { ConflictError, UnauthenticatedError } from '@zarax/shared-errors';
import { DEFAULT_ROLE_PERMISSIONS, type Role } from '@zarax/shared-types';
import { PRISMA_CLIENT } from '../../common/database.module';
import type { AuthTokensDto } from './dto/auth-response.dto';
import type { LoginDto } from './dto/login.dto';
import type { SignupDto } from './dto/signup.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly tenantRepository: TenantRepository,
    private readonly jwtTokenService: JwtTokenService,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async signup(dto: SignupDto): Promise<AuthTokensDto> {
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

    return this.issueTokens(user.id, tenant.id, user.email, 'OWNER');
  }

  async login(dto: LoginDto): Promise<AuthTokensDto> {
    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.isActive) throw new UnauthenticatedError('Invalid email or password.');

    const passwordValid = await argon2.verify(user.passwordHash, dto.password);
    if (!passwordValid) throw new UnauthenticatedError('Invalid email or password.');

    const membership = await this.prisma.tenantMembership.findFirst({ where: { userId: user.id } });
    if (!membership) {
      throw new UnauthenticatedError('This user is not associated with any tenant.');
    }

    return this.issueTokens(user.id, membership.tenantId, user.email, membership.role);
  }

  async refresh(refreshToken: string): Promise<AuthTokensDto> {
    const payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
    const user = await this.userRepository.findByIdOrThrow(payload.sub);

    const membership = await this.prisma.tenantMembership.findFirst({
      where: { userId: user.id, tenantId: payload.tenantId },
    });
    if (!membership) throw new UnauthenticatedError('Tenant membership no longer exists.');

    return this.issueTokens(user.id, membership.tenantId, user.email, membership.role);
  }

  private issueTokens(
    userId: string,
    tenantId: string,
    email: string,
    dbRole: string,
  ): AuthTokensDto {
    // Prisma's MemberRole enum is uppercase ('OWNER'); shared-types' Role union (used
    // for permission lookups and RBAC guards) is lowercase ('owner') — normalize here,
    // at the one seam between the two, rather than in every caller.
    const role = dbRole.toLowerCase() as Role;
    const permissions = DEFAULT_ROLE_PERMISSIONS[role] ?? [];

    const accessToken = this.jwtTokenService.signAccessToken({
      sub: userId,
      tenantId,
      email,
      roles: [role],
      permissions,
    });
    const refreshToken = this.jwtTokenService.signRefreshToken({
      sub: userId,
      tenantId,
    });

    return { accessToken, refreshToken };
  }
}
