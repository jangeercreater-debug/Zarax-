import { Module, type DynamicModule } from '@nestjs/common';

import { EnvSecretsProvider, type SecretsProvider } from './secrets-provider.interface';

export const SECRETS_PROVIDER = Symbol('SECRETS_PROVIDER');

export interface SecretsModuleOptions {
  /** Defaults to EnvSecretsProvider. Pass a different implementation (e.g. a Vault- or
   * AWS-Secrets-Manager-backed one) to switch the entire app's secret source without
   * touching any of the code that injects SECRETS_PROVIDER. */
  provider?: SecretsProvider;
}

@Module({})
export class SecretsModule {
  static forRoot(options: SecretsModuleOptions = {}): DynamicModule {
    return {
      module: SecretsModule,
      global: true,
      providers: [{ provide: SECRETS_PROVIDER, useValue: options.provider ?? new EnvSecretsProvider() }],
      exports: [SECRETS_PROVIDER],
    };
  }
}
