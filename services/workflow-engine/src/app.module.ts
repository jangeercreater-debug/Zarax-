import { Module } from '@nestjs/common';
import { AuditLogModule } from '@zarax/audit-log';
import { PrismaClientModule } from '@zarax/database';
import { AppConfigModule } from '@zarax/shared-config';
import { LoggerModule } from '@zarax/shared-logger';
import { HealthModule, MetricsModule } from '@zarax/shared-observability';

import { workflowEngineEnvSchema } from './config/env.schema';
import { ExecutionModule } from './execution/execution.module';

@Module({
  imports: [
    AppConfigModule.forRoot({ schema: workflowEngineEnvSchema as never }),
    LoggerModule.forRoot({
      serviceName: 'workflow-engine',
      level: process.env.LOG_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    }),
    HealthModule.forRoot({
      indicators: [],
    }),
    MetricsModule.forRoot({ serviceName: 'workflow-engine' }),
    AuditLogModule.forRoot({ enableGlobalInterceptor: false }),
    PrismaClientModule.forRoot(),
    ExecutionModule,
  ],
})
export class AppModule {}
