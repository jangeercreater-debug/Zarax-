import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Principal } from '@zarax/shared-types';
import type { Request } from 'express';

import '../types/express';

/**
 * Usage: `create(@CurrentPrincipal() principal: Principal, @Body() dto: CreateAgentDto)`.
 * Populated by CompositeAuthGuard before the route handler runs; will be `undefined`
 * only on routes marked `@Public()`, so non-public handlers can rely on it being present.
 */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.principal;
  },
);
