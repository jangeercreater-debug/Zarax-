import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';

import { AuditLogService } from '../audit-log.service';
import { AuditInterceptor } from '../interceptor/audit.interceptor';

export interface AuditLogModuleOptions {
  /** Set false to provide AuditLogService without the global interceptor — e.g. if a
   * service wants to call `auditLogService.record()` manually instead of via
   * `@Audited()`. Defaults to true. */
  enableGlobalInterceptor?: boolean;
}

@Module({})
export class AuditLogModule {
  static forRoot(options: AuditLogModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [AuditLogService];

    if (options.enableGlobalInterceptor ?? true) {
      providers.push({ provide: APP_INTERCEPTOR, useClass: AuditInterceptor });
    }

    return {
      module: AuditLogModule,
      global: true,
      providers,
      exports: [AuditLogService],
    };
  }
}
