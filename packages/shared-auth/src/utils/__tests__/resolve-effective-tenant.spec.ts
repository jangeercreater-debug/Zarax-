import { ValidationError } from '@zarax/shared-errors';
import { asTenantId, asUserId, type ServiceAccountPrincipal, type UserPrincipal } from '@zarax/shared-types';
import { describe, expect, it } from 'vitest';

import { resolveEffectiveTenantId } from '../resolve-effective-tenant';

describe('resolveEffectiveTenantId', () => {
  it('requires and uses the explicit tenantId for a service_account principal', () => {
    const principal: ServiceAccountPrincipal = {
      type: 'service_account',
      id: 'sa-1' as never,
      tenantId: asTenantId('service-account-home-tenant'),
      serviceName: 'llm-orchestrator',
      scopes: [],
      permissions: [],
      roles: [],
    };

    const result = resolveEffectiveTenantId(principal, 'tenant-real');
    expect(result).toBe('tenant-real');
  });

  it('throws when a service_account principal omits the explicit tenantId', () => {
    const principal: ServiceAccountPrincipal = {
      type: 'service_account',
      id: 'sa-1' as never,
      tenantId: asTenantId('service-account-home-tenant'),
      serviceName: 'llm-orchestrator',
      scopes: [],
      permissions: [],
      roles: [],
    };

    expect(() => resolveEffectiveTenantId(principal)).toThrow(ValidationError);
  });

  it('always uses the principal\'s own tenantId for a user principal, ignoring any explicit override', () => {
    const principal: UserPrincipal = {
      type: 'user',
      id: asUserId('user-1'),
      tenantId: asTenantId('tenant-real'),
      email: 'a@b.com',
      roles: ['owner'],
      permissions: ['*'],
    };

    // Even if a malicious/buggy client sent a different tenantId, the user's own
    // authenticated Principal wins — this is the anti-privilege-escalation guarantee.
    const result = resolveEffectiveTenantId(principal, 'someone-elses-tenant');
    expect(result).toBe('tenant-real');
  });
});
