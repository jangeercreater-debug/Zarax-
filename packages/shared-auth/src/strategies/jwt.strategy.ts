import { Inject, Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import type { jwtEnvSchema } from '@zarax/shared-config';
import { UnauthenticatedError } from '@zarax/shared-errors';
import type { UserPrincipal } from '@zarax/shared-types';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { z } from 'zod';

import { JwtTokenService, type AccessTokenPayload } from '../services/jwt-token.service';

type JwtEnv = z.infer<typeof jwtEnvSchema>;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    @Inject(APP_CONFIG) config: AppConfigService<JwtEnv>,
    private readonly jwtTokenService: JwtTokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: AccessTokenPayload): UserPrincipal {
    if (payload.type !== 'access') {
      throw new UnauthenticatedError('A refresh token cannot be used to authenticate requests.');
    }
    return this.jwtTokenService.toPrincipal(payload);
  }
}
