import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { UnauthenticatedError } from '@zarax/shared-errors';
import type { Request } from 'express';

export const INTERNAL_SERVICE_TOKEN = Symbol('INTERNAL_SERVICE_TOKEN');
const INTERNAL_TOKEN_HEADER = 'x-internal-token';

/**
 * For internal-only workers (stt-service, tts-service, ...) that are never reached by
 * an end client directly — protected by a single shared secret rather than the full
 * Principal/RBAC machinery in CompositeAuthGuard, which is for tenant-facing traffic.
 *
 * Register the expected secret value under the `INTERNAL_SERVICE_TOKEN` DI token:
 *   { provide: INTERNAL_SERVICE_TOKEN, useFactory: (config) => config.get('INTERNAL_SERVICE_TOKEN'), inject: [APP_CONFIG] }
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  constructor(@Inject(INTERNAL_SERVICE_TOKEN) private readonly expectedToken: string) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const token = request.headers[INTERNAL_TOKEN_HEADER];

    if (typeof token !== 'string' || token !== this.expectedToken) {
      throw new UnauthenticatedError('Missing or invalid internal service token.');
    }
    return true;
  }
}
