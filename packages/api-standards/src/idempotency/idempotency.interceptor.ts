import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { ConflictError } from '@zarax/shared-errors';
import type { Principal } from '@zarax/shared-types';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import { from, of, switchMap, tap } from 'rxjs';

export const IDEMPOTENCY_REDIS_CLIENT = Symbol('IDEMPOTENCY_REDIS_CLIENT');

const IDEMPOTENCY_HEADER = 'idempotency-key';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const IN_PROGRESS_SENTINEL = '__IN_PROGRESS__';
const IN_PROGRESS_TTL_SECONDS = 30; // generous ceiling for a single request's handler time
const RESULT_TTL_SECONDS = 60 * 60 * 24; // replay window for a completed response

interface CachedResult {
  statusCode: number;
  body: unknown;
}

/**
 * Write endpoints (POST/PUT/PATCH/DELETE) honor an `Idempotency-Key` header: a
 * repeated request with the same key replays the original cached response instead of
 * re-executing, and a concurrent duplicate in-flight request is rejected (409) rather
 * than racing the handler.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IDEMPOTENCY_REDIS_CLIENT) private readonly redis: Redis) {}

  intercept(context: ExecutionContext, next: CallHandler): ReturnType<CallHandler['handle']> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request & { principal?: Principal }>();
    const response = httpContext.getResponse<Response>();

    if (!MUTATING_METHODS.has(request.method)) {
      return next.handle();
    }

    const idempotencyKey = request.headers[IDEMPOTENCY_HEADER];
    if (typeof idempotencyKey !== 'string' || !idempotencyKey) {
      return next.handle(); // Idempotency is opt-in per request, not mandatory.
    }

    const tenantId = request.principal?.tenantId ?? 'anonymous';
    const redisKey = `idempotency:${tenantId}:${idempotencyKey}`;

    return from(this.claimOrFetch(redisKey)).pipe(
      switchMap((claim) => {
        if (claim.status === 'cached') {
          response.status(claim.result.statusCode);
          return of(claim.result.body);
        }
        if (claim.status === 'in_progress') {
          throw new ConflictError(
            'A request with this Idempotency-Key is already being processed.',
          );
        }

        // claim.status === 'claimed' — we own this key, run the real handler.
        return next.handle().pipe(
          tap((body: unknown) => {
            void this.redis.set(
              redisKey,
              JSON.stringify({ statusCode: response.statusCode, body }),
              'EX',
              RESULT_TTL_SECONDS,
            );
          }),
        );
      }),
    );
  }

  private async claimOrFetch(
    redisKey: string,
  ): Promise<
    { status: 'claimed' } | { status: 'in_progress' } | { status: 'cached'; result: CachedResult }
  > {
    const claimed = await this.redis.set(
      redisKey,
      IN_PROGRESS_SENTINEL,
      'EX',
      IN_PROGRESS_TTL_SECONDS,
      'NX',
    );
    if (claimed === 'OK') return { status: 'claimed' };

    const existing = await this.redis.get(redisKey);
    if (existing === IN_PROGRESS_SENTINEL) return { status: 'in_progress' };
    if (existing) return { status: 'cached', result: JSON.parse(existing) as CachedResult };

    // Existing was deleted/expired between our SET NX and this GET — vanishingly rare
    // race; treat as claimed rather than erroring the request over it.
    return { status: 'claimed' };
  }
}
