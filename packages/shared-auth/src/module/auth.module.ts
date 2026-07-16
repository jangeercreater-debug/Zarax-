import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { APP_CONFIG, type AppConfigService } from '@zarax/shared-config';
import type { jwtEnvSchema } from '@zarax/shared-config';
import type { z } from 'zod';

import { CompositeAuthGuard } from '../guards/composite-auth.guard';
import { PermissionsGuard } from '../guards/permissions.guard';
import { RolesGuard } from '../guards/roles.guard';
import { JwtTokenService } from '../services/jwt-token.service';
import { API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR } from '../services/validator.interfaces';
import { JwtStrategy } from '../strategies/jwt.strategy';

type JwtEnv = z.infer<typeof jwtEnvSchema>;

export interface AuthModuleOptions {
  /** Provider implementing ApiKeyValidator — omit to disable API-key auth for this service. */
  apiKeyValidatorProvider?: Provider;
  /** Provider implementing ServiceAccountValidator — omit to disable service-account auth. */
  serviceAccountValidatorProvider?: Provider;
}

@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions = {}): DynamicModule {
    const optionalProviders: Provider[] = [];
    if (options.apiKeyValidatorProvider) optionalProviders.push(options.apiKeyValidatorProvider);
    if (options.serviceAccountValidatorProvider) {
      optionalProviders.push(options.serviceAccountValidatorProvider);
    }

    return {
      module: AuthModule,
      global: true,
      imports: [
        PassportModule,
        JwtModule.registerAsync({
          useFactory: (config: AppConfigService<JwtEnv>) => ({
            secret: config.get('JWT_ACCESS_SECRET'),
            signOptions: { expiresIn: config.get('JWT_ACCESS_TTL') },
          }),
          inject: [APP_CONFIG],
        }),
      ],
      providers: [
        JwtStrategy,
        JwtTokenService,
        ...optionalProviders,
        { provide: APP_GUARD, useClass: CompositeAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: PermissionsGuard },
      ],
      exports: [JwtTokenService],
    };
  }
}

// Re-exported so services wiring a validator provider can reference the tokens without
// reaching into the `services/` subpath directly.
export { API_KEY_VALIDATOR, SERVICE_ACCOUNT_VALIDATOR };
