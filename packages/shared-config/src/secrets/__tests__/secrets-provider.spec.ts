import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { EnvSecretsProvider, SecretNotFoundError } from '../secrets-provider.interface';

describe('EnvSecretsProvider', () => {
  const provider = new EnvSecretsProvider();

  beforeEach(() => {
    process.env.TEST_SECRET = 'super-secret-value';
    delete process.env.TEST_MISSING_SECRET;
  });

  afterEach(() => {
    delete process.env.TEST_SECRET;
  });

  it('returns the secret value when present', async () => {
    expect(await provider.getSecret('TEST_SECRET')).toBe('super-secret-value');
  });

  it('throws SecretNotFoundError when the secret is missing', async () => {
    await expect(provider.getSecret('TEST_MISSING_SECRET')).rejects.toThrow(
      SecretNotFoundError,
    );
  });

  it('getOptionalSecret returns undefined instead of throwing when missing', async () => {
    expect(await provider.getOptionalSecret('TEST_MISSING_SECRET')).toBeUndefined();
  });

  it('getOptionalSecret returns the value when present', async () => {
    expect(await provider.getOptionalSecret('TEST_SECRET')).toBe('super-secret-value');
  });
});
