import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DistributedRateLimiter } from '@zarax/redis-client';
import { RateLimitedError } from '@zarax/shared-errors';
import type { Principal } from '@zarax/shared-types';
import type { Request } from 'express';

import { RATE_LIMIT_METADATA_KEY, type RateLimitOptions } from './rate-limit.decorator';

export const RATE_LIMITER = Symbol('RATE_LIMITER');
export const DEFAULT_RATE_LIMIT_OPTIONS = Symbol('DEFAULT_RATE_LIMIT_OPTIONS');

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(RATE_LIMITER) private readonly limiter: DistributedRateLimiter,
    @Inject(DEFAULT_RATE_LIMIT_OPTIONS) private readonly defaultOptions: RateLimitOptions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]) ?? this.defaultOptions;

    const request = context.switchToHttp().getRequest<Request & { principal?: Principal }>();
    const identity = request.principal
      ? `${request.principal.tenantId}:${request.principal.type}:${request.principal.id}`
      : `ip:${request.ip}`;
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const key = `ratelimit:${identity}:${route}`;

    const result = await this.limiter.consume(key, options);

    if (!result.allowed) {
      throw new RateLimitedError(
        `Rate limit exceeded (${result.limit} requests per ${options.windowMs}ms). Try again in ${Math.ceil(result.resetInMs / 1000)}s.`,
      );
    }
    return true;
  }
}
