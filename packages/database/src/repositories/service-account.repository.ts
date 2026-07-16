import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { ServiceAccountValidator } from '@zarax/shared-auth';
import { asServiceAccountId, asTenantId, type ServiceAccountPrincipal } from '@zarax/shared-types';

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Implements @zarax/shared-auth's `ServiceAccountValidator` — used for internal
 * service-to-service calls (e.g. workflow-engine calling tool-executor). */
export class ServiceAccountRepository implements ServiceAccountValidator {
  constructor(private readonly prisma: PrismaClient) {}

  async validate(rawToken: string): Promise<ServiceAccountPrincipal | null> {
    const tokenHash = hashToken(rawToken);
    const record = await this.prisma.serviceAccount.findUnique({ where: { tokenHash } });

    if (!record || record.revokedAt) return null;

    return {
      type: 'service_account',
      id: asServiceAccountId(record.id),
      tenantId: asTenantId(record.tenantId),
      serviceName: record.serviceName,
      scopes: record.scopes,
      permissions: record.scopes,
      roles: [],
    };
  }
}
