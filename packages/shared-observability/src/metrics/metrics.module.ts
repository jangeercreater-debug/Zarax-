import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { MetricsController } from './metrics.controller';
import { MetricsInterceptor } from './metrics.interceptor';
import { MetricsRegistry } from './metrics.registry';

export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');

interface MetricsModuleOptions {
  serviceName: string;
  enableHttpInterceptor?: boolean;
}

@Module({})
export class MetricsModule {
  static forRoot(options: MetricsModuleOptions): DynamicModule {
    const registry = new MetricsRegistry(options.serviceName);

    const providers: Provider[] = [
      { provide: METRICS_REGISTRY, useValue: registry },
      { provide: MetricsRegistry, useValue: registry },
    ];

    if (options.enableHttpInterceptor ?? true) {
      providers.push({ provide: APP_INTERCEPTOR, useClass: MetricsInterceptor });
    }

    return {
      module: MetricsModule,
      global: true,
      controllers: [MetricsController],
      providers,
      exports: [METRICS_REGISTRY, MetricsRegistry],
    };
  }
}
