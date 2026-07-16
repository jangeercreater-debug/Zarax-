import { Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ForbiddenError, UnauthenticatedError } from '@zarax/shared-errors';
import type { Role } from '@zarax/shared-types';
import type { Request } from 'express';

import '../types/express';
import { REQUIRED_ROLES_KEY } from '../decorators/require-role.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(REQUIRED_ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const principal = request.principal;
    if (!principal) throw new UnauthenticatedError();

    const hasAny = required.some((role) => principal.roles.includes(role));
    if (!hasAny) {
      throw new ForbiddenError(`This action requires one of these roles: ${required.join(', ')}.`);
    }
    return true;
  }
}
