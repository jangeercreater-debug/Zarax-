import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, UnauthenticatedError } from '@zarax/shared-errors';
import { PERMISSIONS, type Permission } from '@zarax/shared-types';
import type { Request } from 'express';

import '../types/express';
import { REQUIRED_PERMISSIONS_KEY } from '../decorators/require-permission.decorator';

/**
 * Runs after CompositeAuthGuard (registered later in the global guard chain — see
 * AuthModule). Deliberately independent of *how* the Principal authenticated; it only
 * ever inspects `principal.permissions`, per the design in /docs/auth-design.md.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const principal = request.principal;
    if (!principal) throw new UnauthenticatedError();

    const hasWildcard = principal.permissions.includes(PERMISSIONS.WILDCARD_ALL);
    const hasAll = hasWildcard || required.every((perm) => principal.permissions.includes(perm));

    if (!hasAll) {
      throw new ForbiddenError(
        `This action requires the following permission(s): ${required.join(', ')}.`,
      );
    }
    return true;
  }
}
