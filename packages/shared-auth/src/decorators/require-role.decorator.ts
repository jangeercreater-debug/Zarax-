import { SetMetadata } from '@nestjs/common';
import type { Role } from '@zarax/shared-types';

export const REQUIRED_ROLES_KEY = 'requiredRoles';

/** Usage: `@RequireRole(ROLES.ADMIN, ROLES.OWNER)` — principal must hold at least one. */
export const RequireRole = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ROLES_KEY, roles);
