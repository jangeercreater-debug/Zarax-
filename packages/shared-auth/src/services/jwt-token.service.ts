import { Inject, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import type { jwtEnvSchema } from '@zarax/shared-config';
import { asTenantId, asUserId, type UserPrincipal } from '@zarax/shared-types';
import type { z } from 'zod';

type JwtEnv = z.infer<typeof jwtEnvSchema>;

/**
 * The decoded shape of an access token. Deliberately includes roles/permissions inline
 * (resolved at login time) rather than just a userId — this is what makes JWT
 * validation stateless: no DB lookup is needed on every request, only signature and
 * expiry verification. Permission changes take effect on next token refresh, not
 * instantly — an accepted tradeoff for statelessness at scale (see docs/auth-design.md).
 */
export interface AccessTokenPayload {
  sub: string; // userId
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  tenantId: string;
  type: 'refresh';
}

@Injectable()
export class JwtTokenService {
  constructor(
    private readonly jwtService: JwtService,
    @Inject(APP_CONFIG) private readonly config: AppConfigService<JwtEnv>,
  ) {}

  signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
    return this.jwtService.sign(
      { ...payload, type: 'access' } satisfies AccessTokenPayload,
      { secret: this.config.get('JWT_ACCESS_SECRET'), expiresIn: this.config.get('JWT_ACCESS_TTL') },
    );
  }

  signRefreshToken(payload: Omit<RefreshTokenPayload, 'type'>): string {
    return this.jwtService.sign(
      { ...payload, type: 'refresh' } satisfies RefreshTokenPayload,
      { secret: this.config.get('JWT_REFRESH_SECRET'), expiresIn: this.config.get('JWT_REFRESH_TTL') },
    );
  }

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return this.jwtService.verify<RefreshTokenPayload>(token, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
    });
  }

  toPrincipal(payload: AccessTokenPayload): UserPrincipal {
    return {
      type: 'user',
      id: asUserId(payload.sub),
      tenantId: asTenantId(payload.tenantId),
      email: payload.email,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
