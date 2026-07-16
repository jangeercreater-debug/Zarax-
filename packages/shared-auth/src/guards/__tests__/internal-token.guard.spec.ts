import type { ExecutionContext } from '@nestjs/common';
import { UnauthenticatedError } from '@zarax/shared-errors';
import { describe, expect, it } from 'vitest';

import { InternalTokenGuard } from '../internal-token.guard';

function buildContext(headers: Record<string, string>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers }) }),
  } as unknown as ExecutionContext;
}

describe('InternalTokenGuard', () => {
  const guard = new InternalTokenGuard('a-valid-shared-secret-value-1234');

  it('allows a request with the correct token', () => {
    expect(guard.canActivate(buildContext({ 'x-internal-token': 'a-valid-shared-secret-value-1234' }))).toBe(
      true,
    );
  });

  it('rejects a request with a wrong token', () => {
    expect(() => guard.canActivate(buildContext({ 'x-internal-token': 'wrong' }))).toThrow(
      UnauthenticatedError,
    );
  });

  it('rejects a request with no token header', () => {
    expect(() => guard.canActivate(buildContext({}))).toThrow(UnauthenticatedError);
  });
});
