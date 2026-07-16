import { Module, type DynamicModule } from '@nestjs/common';
import type { ZodSchema } from 'zod';

import { validateEnv } from '../validate-env';

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Thin, strongly-typed wrapper so consuming code gets `.get('SOME_KEY')` with
 * autocompletion and compile-time key checking, without depending on @nestjs/config's
 * loosely-typed `ConfigService.get<T>()` generic-cast pattern.
 */
export class AppConfigService<T extends Record<string, unknown>> {
  constructor(private readonly config: Readonly<T>) {}

  get<K extends keyof T>(key: K): T[K] {
    return this.config[key];
  }

  getAll(): Readonly<T> {
    return this.config;
  }
}

interface AppConfigModuleOptions<T> {
  schema: ZodSchema<T>;
  /** Defaults to true — config is almost always needed app-wide. */
  isGlobal?: boolean;
}

/**
 * Validates `process.env` against `schema` synchronously at module registration time
 * (i.e. at app bootstrap, before any request is served) and exposes the result as an
 * injectable `AppConfigService<T>` under the `APP_CONFIG` token.
 *
 * Usage in a service's app.module.ts:
 *   AppConfigModule.forRoot({ schema: baseEnvSchema.merge(postgresEnvSchema) })
 *
 * Usage in a provider:
 *   constructor(@Inject(APP_CONFIG) private readonly config: AppConfigService<MyEnv>) {}
 */
@Module({})
export class AppConfigModule {
  static forRoot<T extends Record<string, unknown>>(
    options: AppConfigModuleOptions<T>,
  ): DynamicModule {
    const validatedConfig = validateEnv(options.schema);

    return {
      module: AppConfigModule,
      global: options.isGlobal ?? true,
      providers: [
        {
          provide: APP_CONFIG,
          useValue: new AppConfigService(validatedConfig),
        },
      ],
      exports: [APP_CONFIG],
    };
  }
}
