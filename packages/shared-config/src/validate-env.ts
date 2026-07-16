import type { ZodSchema } from 'zod';

/**
 * Thrown at boot (never at request time) when required environment variables are
 * missing or malformed. Aggregates every problem into one message so an operator
 * fixes all of them in one deploy attempt instead of playing whack-a-mole.
 */
export class EnvValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Environment validation failed:\n  - ${issues.join('\n  - ')}`);
    this.name = 'EnvValidationError';
  }
}

/**
 * Validates `process.env` (or a provided source) against a zod schema. Call this once,
 * synchronously, at the very top of `main.ts` — before `NestFactory.create` — so a
 * misconfigured deployment fails immediately and loudly rather than starting up and
 * failing on the first request that touches the missing variable.
 */
export function validateEnv<T>(schema: ZodSchema<T>, source: NodeJS.ProcessEnv = process.env): T {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new EnvValidationError(issues);
  }
  return result.data;
}
