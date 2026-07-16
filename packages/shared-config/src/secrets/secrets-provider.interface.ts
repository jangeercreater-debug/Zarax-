/**
 * The contract business logic depends on — never `process.env` directly. Swapping the
 * bound implementation (see SecretsModule.forRoot()) from `EnvSecretsProvider` to a
 * real secret manager client is a config change, not a code change.
 */
export interface SecretsProvider {
  getSecret(key: string): Promise<string>;
  /** Returns undefined instead of throwing — for genuinely optional secrets (e.g. a
   * feature that degrades gracefully without a given third-party API key). */
  getOptionalSecret(key: string): Promise<string | undefined>;
}

/** Deliberately a plain Error, not @zarax/shared-errors' DependencyUnavailableError —
 * shared-config and shared-errors are both Layer 1 siblings and must not depend on
 * each other (see docs/dependency-rules.md). A caller in a Nest context can still
 * catch this and rethrow as whatever AppError fits its situation. */
export class SecretNotFoundError extends Error {
  constructor(key: string) {
    super(`Secret '${key}' is not configured.`);
    this.name = 'SecretNotFoundError';
  }
}

/**
 * Default implementation — reads from `process.env`. This is the *only* place in the
 * codebase that should read `process.env` for a secret value; everything else goes
 * through `SecretsProvider.getSecret()`/`getOptionalSecret()`. Bootstrap-time module
 * composition (see docs on why app.module.ts files read process.env directly for
 * Prisma/Redis client construction) remains a documented, separate exception — that
 * code runs before Nest's DI container exists at all, so it cannot depend on any
 * injected provider, secrets or otherwise.
 */
export class EnvSecretsProvider implements SecretsProvider {
  async getSecret(key: string): Promise<string> {
    const value = process.env[key];
    if (!value) {
      throw new SecretNotFoundError(key);
    }
    return value;
  }

  async getOptionalSecret(key: string): Promise<string | undefined> {
    return process.env[key] || undefined;
  }
}
