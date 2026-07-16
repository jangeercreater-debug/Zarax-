import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@zarax/shared-types';

export const REQUIRED_PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Usage: `@RequirePermission(PERMISSIONS.CALLS_CREATE)`. Multiple permissions on one
 * route are ANDed — the principal must hold all of them (or the wildcard `'*'`).
 */
export const RequirePermission = (...permissions: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
