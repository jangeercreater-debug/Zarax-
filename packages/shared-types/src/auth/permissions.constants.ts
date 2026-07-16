/**
 * Central registry of permission strings. Using `as const` + a union type means a typo
 * in `@RequirePermission('call:create')` (missing the 's') is a compile error, not a
 * silent authorization bug.
 */
export const PERMISSIONS = {
  CALLS_CREATE: 'calls:create',
  CALLS_READ: 'calls:read',
  CALLS_DELETE: 'calls:delete',
  AGENTS_CREATE: 'agents:create',
  AGENTS_READ: 'agents:read',
  AGENTS_UPDATE: 'agents:update',
  AGENTS_DELETE: 'agents:delete',
  WORKFLOWS_MANAGE: 'workflows:manage',
  TOOLS_EXECUTE: 'tools:execute',
  TENANT_MANAGE_MEMBERS: 'tenant:manage_members',
  TENANT_MANAGE_BILLING: 'tenant:manage_billing',
  API_KEYS_MANAGE: 'api_keys:manage',
  WILDCARD_ALL: '*',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
  VIEWER: 'viewer',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

/** Default permission sets for built-in roles. Tenants may extend this later via custom roles. */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [ROLES.OWNER]: [PERMISSIONS.WILDCARD_ALL],
  [ROLES.ADMIN]: [
    PERMISSIONS.CALLS_CREATE,
    PERMISSIONS.CALLS_READ,
    PERMISSIONS.CALLS_DELETE,
    PERMISSIONS.AGENTS_CREATE,
    PERMISSIONS.AGENTS_READ,
    PERMISSIONS.AGENTS_UPDATE,
    PERMISSIONS.AGENTS_DELETE,
    PERMISSIONS.WORKFLOWS_MANAGE,
    PERMISSIONS.TOOLS_EXECUTE,
    PERMISSIONS.TENANT_MANAGE_MEMBERS,
    PERMISSIONS.API_KEYS_MANAGE,
  ],
  [ROLES.MEMBER]: [
    PERMISSIONS.CALLS_CREATE,
    PERMISSIONS.CALLS_READ,
    PERMISSIONS.AGENTS_READ,
    PERMISSIONS.AGENTS_UPDATE,
  ],
  [ROLES.VIEWER]: [PERMISSIONS.CALLS_READ, PERMISSIONS.AGENTS_READ],
};
