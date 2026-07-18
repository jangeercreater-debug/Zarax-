/**
 * One-time operational tool (not a product feature) — provisions the ServiceAccount
 * rows every inter-service HTTP call in this system authenticates with. There is
 * deliberately no API endpoint or admin UI for creating a ServiceAccount (these are
 * infrastructure credentials for our own services, not something a tenant should be
 * able to self-serve create), so this script is the one way to create them.
 *
 * Prints each service account's RAW token exactly once — it's stored only as a
 * SHA-256 hash (ServiceAccountRepository.validate()), so this is the only chance to
 * capture it. Copy each printed token into the corresponding *_SERVICE_ACCOUNT_TOKEN
 * env var for the CALLING service (not the one being called) — see the table this
 * script prints at the end.
 *
 * ServiceAccount.tenantId is a required foreign key to some real Tenant (Prisma
 * relation constraint), but it is NOT functionally restrictive: every endpoint a
 * service account calls resolves the *actual* tenant to operate on from the request
 * body (see @zarax/shared-auth's resolveEffectiveTenantId), not from this bound
 * value. Pick any existing tenant — its id here is just satisfying the FK.
 *
 * Usage:
 *   pnpm --filter @zarax/database seed:service-accounts -- --tenant-id=<a-real-tenant-id>
 */
import { randomBytes, createHash } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

interface ServiceAccountSpec {
  /** Human-readable identity for audit logs — "who is calling", not "who is called". */
  serviceName: string;
  /** Which env var the CALLING service reads this raw token from. */
  envVarName: string;
  scopes: string[];
}

const SERVICE_ACCOUNTS: ServiceAccountSpec[] = [
  {
    serviceName: 'services-api-to-llm-orchestrator',
    envVarName: 'LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN (in services/api)',
    scopes: ['conversations:turn'],
  },
  {
    serviceName: 'workflow-engine-to-llm-orchestrator',
    envVarName: 'LLM_ORCHESTRATOR_SERVICE_ACCOUNT_TOKEN (in services/workflow-engine)',
    scopes: ['conversations:turn'],
  },
  {
    serviceName: 'llm-orchestrator-to-rag-service',
    envVarName: 'RAG_SERVICE_ACCOUNT_TOKEN (in services/llm-orchestrator)',
    scopes: ['knowledge-base:search'],
  },
  {
    serviceName: 'workflow-engine-to-rag-service',
    envVarName: 'RAG_SERVICE_ACCOUNT_TOKEN (in services/workflow-engine)',
    scopes: ['knowledge-base:search'],
  },
];

function parseTenantIdArg(): string {
  const arg = process.argv.find((a) => a.startsWith('--tenant-id='));
  if (!arg) {
    console.error(
      'Usage: pnpm --filter @zarax/database seed:service-accounts -- --tenant-id=<a-real-tenant-id>\n' +
        'Find a real tenant id with: pnpm --filter @zarax/database studio (open the Tenant table).',
    );
    process.exit(1);
  }
  return arg.split('=')[1];
}

function generateRawToken(): string {
  return randomBytes(32).toString('hex'); // 64 hex chars — well over every service's z.string().min(32) requirement
}

function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

async function main(): Promise<void> {
  const tenantId = parseTenantIdArg();
  const prisma = new PrismaClient();

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    console.error(`No tenant found with id '${tenantId}'. Create one via signup first, then re-run this.`);
    process.exit(1);
  }

  console.log(`\nSeeding service accounts (bound to tenant '${tenant.name}' — see this script's header comment for why that binding doesn't functionally restrict anything)...\n`);

  const results: Array<{ serviceName: string; envVarName: string; rawToken: string }> = [];

  for (const spec of SERVICE_ACCOUNTS) {
    const existing = await prisma.serviceAccount.findFirst({
      where: { serviceName: spec.serviceName, revokedAt: null },
    });
    if (existing) {
      console.log(`Skipping '${spec.serviceName}' — an active service account already exists (id: ${existing.id}).`);
      console.log(`  If you need a new token for it, revoke this one first (set revokedAt) and re-run.\n`);
      continue;
    }

    const rawToken = generateRawToken();
    await prisma.serviceAccount.create({
      data: {
        tenantId,
        serviceName: spec.serviceName,
        tokenHash: hashToken(rawToken),
        scopes: spec.scopes,
      },
    });
    results.push({ serviceName: spec.serviceName, envVarName: spec.envVarName, rawToken });
  }

  await prisma.$disconnect();

  if (results.length === 0) {
    console.log('Nothing new to seed — every service account already exists.');
    return;
  }

  console.log('Created service accounts — copy each raw token into its env var NOW (shown only once):\n');
  console.log('| Service account | Env var (which service, which var) | Raw token |');
  console.log('|---|---|---|');
  for (const r of results) {
    console.log(`| ${r.serviceName} | ${r.envVarName} | ${r.rawToken} |`);
  }
  console.log();
}

main().catch((error: unknown) => {
  console.error('Seed script failed:', error);
  process.exit(1);
});
