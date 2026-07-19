import { Inject, Injectable, Optional, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { UnauthenticatedError } from '@zarax/shared-errors';
import { setRequestPrincipal } from '@zarax/shared-logger';
import type { Principal } from '@zarax/shared-types';
import type { Request } from 'express';

import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  API_KEY_VALIDATOR,
  SERVICE_ACCOUNT_VALIDATOR,
  type ApiKeyValidator,
  type ServiceAccountValidator,
} from '../services/validator.interfaces';

const API_KEY_HEADER = 'x-api-key';
const SERVICE_ACCOUNT_HEADER = 'x-service-account-token';

/**
 * Registered as a global guard (see AuthModule). For each request, in order:
 *   1. `@Public()` routes bypass authentication entirely.
 *   2. `Authorization: Bearer <jwt>` → delegates to the JWT Passport strategy.
 *   3. `X-API-Key: <key>` → delegates to the injected ApiKeyValidator (if wired).
 *   4. `X-Service-Account-Token: <token>` → delegates to ServiceAccountValidator (if wired).
 *   5. Otherwise → UnauthenticatedError.
 * Whichever path succeeds, the result is a Principal attached to `request.principal` —
 * downstream guards/controllers never need to know which path was taken.
 */
@Injectable()
export class CompositeAuthGuard implements CanActivate {
  private readonly jwtGuard = new (AuthGuard('jwt'))();

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(API_KEY_VALIDATOR) private readonly apiKeyValidator?: ApiKeyValidator,
    @Optional()
    @Inject(SERVICE_ACCOUNT_VALIDATOR)
    private readonly serviceAccountValidator?: ServiceAccountValidator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();

    if (request.headers.authorization?.startsWith('Bearer ')) {
      const passed = await this.jwtGuard.canActivate(context);
      if (passed) {
        const principal = request.user as Principal | undefined; // populated by JwtStrategy.validate()
        request.principal = principal;
        if (principal) setRequestPrincipal(principal.tenantId, principal.id);
        return true;
      }
      return false;
    }

    const apiKey = request.headers[API_KEY_HEADER];
    if (typeof apiKey === 'string' && this.apiKeyValidator) {
      const principal = await this.apiKeyValidator.validate(apiKey);
      if (!principal) throw new UnauthenticatedError('Invalid or revoked API key.');
      request.principal = principal;
      setRequestPrincipal(principal.tenantId, principal.id);
      return true;
    }

    const serviceToken = request.headers[SERVICE_ACCOUNT_HEADER];
    if (typeof serviceToken === 'string' && this.serviceAccountValidator) {
      const principal = await this.serviceAccountValidator.validate(serviceToken);
      if (!principal) throw new UnauthenticatedError('Invalid service account token.');
      request.principal = principal;
      setRequestPrincipal(principal.tenantId, principal.id);
      return true;
    }

    throw new UnauthenticatedError();
  }
}
