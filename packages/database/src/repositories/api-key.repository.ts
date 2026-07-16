import { createHash } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';
import type { ApiKeyValidator } from '@zarax/shared-auth';
import { asApiKeyId, asTenantId, type ApiKeyPrincipal } from '@zarax/shared-types';

function hashKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Implements @zarax/shared-auth's `ApiKeyValidator`. Wire this into a service's
 * AuthModule.forRoot() as the `apiKeyValidatorProvider` — this is the concrete
 * fulfillment of the pluggable-validator design in /docs/auth-design.md.
 */
export class ApiKeyRepository implements ApiKeyValidator {
  constructor(private readonly prisma: PrismaClient) {}

  async validate(rawKey: string): Promise<ApiKeyPrincipal | null> {
    const keyHash = hashKey(rawKey);
    const record = await this.prisma.apiKey.findUnique({ where: { keyHash } });

    if (!record || record.revokedAt) return null;

    // Fire-and-forget last-used tracking — must never block or fail the auth path.
    void this.prisma.apiKey
      .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      type: 'api_key',
      id: asApiKeyId(record.id),
      tenantId: asTenantId(record.tenantId),
      label: record.label,
      scopes: record.scopes,
      // API-key permissions derive from its declared scopes directly — no roles concept
      // for machine credentials, keeping their blast radius explicit and minimal.
      permissions: record.scopes,
      roles: [],
    };
  }

  async create(params: {
    tenantId: string;
    label: string;
    rawKey: string;
    keyPrefix: string;
    scopes: string[];
  }): Promise<{ id: string }> {
    const created = await this.prisma.apiKey.create({
      data: {
        tenantId: params.tenantId,
        label: params.label,
        keyHash: hashKey(params.rawKey),
        keyPrefix: params.keyPrefix,
        scopes: params.scopes,
      },
    });
    return { id: created.id };
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  }
}
