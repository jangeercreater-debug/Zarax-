import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitedError } from '@zarax/shared-errors';
import { describe, expect, it, vi } from 'vitest';

import { RateLimitGuard } from '../rate-limit.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({ name: 'testHandler' }),
    getClass: () => ({ name: 'TestController' }),
  } as unknown as ExecutionContext;
}

describe('RateLimitGuard', () => {
  it('allows the request when under the limit', async () => {
    const limiter = { consume: vi.fn().mockResolvedValue({ allowed: true, count: 1, limit: 10, resetInMs: 1000 }) };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector, limiter as never, { limit: 10, windowMs: 60_000 });

    const result = await guard.canActivate(buildContext({ ip: '1.2.3.4', headers: {} }));
    expect(result).toBe(true);
  });

  it('throws RateLimitedError when the limit is exceeded', async () => {
    const limiter = { consume: vi.fn().mockResolvedValue({ allowed: false, count: 11, limit: 10, resetInMs: 5000 }) };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector, limiter as never, { limit: 10, windowMs: 60_000 });

    await expect(guard.canActivate(buildContext({ ip: '1.2.3.4', headers: {} }))).rejects.toThrow(
      RateLimitedError,
    );
  });

  it('keys by tenant+principal when authenticated, not just IP', async () => {
    const limiter = { consume: vi.fn().mockResolvedValue({ allowed: true, count: 1, limit: 10, resetInMs: 1000 }) };
    const reflector = { getAllAndOverride: vi.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector, limiter as never, { limit: 10, windowMs: 60_000 });

    await guard.canActivate(
      buildContext({
        ip: '1.2.3.4',
        headers: {},
        principal: { tenantId: 'tenant-1', type: 'user', id: 'user-1' },
      }),
    );

    expect(limiter.consume).toHaveBeenCalledWith(
      expect.stringContaining('tenant-1:user:user-1'),
      expect.anything(),
    );
  });

  it('uses per-route @RateLimit() override when present', async () => {
    const limiter = { consume: vi.fn().mockResolvedValue({ allowed: true, count: 1, limit: 3, resetInMs: 1000 }) };
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue({ limit: 3, windowMs: 1000 }),
    } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector, limiter as never, { limit: 100, windowMs: 60_000 });

    await guard.canActivate(buildContext({ ip: '1.2.3.4', headers: {} }));

    expect(limiter.consume).toHaveBeenCalledWith(expect.any(String), { limit: 3, windowMs: 1000 });
  });
});
