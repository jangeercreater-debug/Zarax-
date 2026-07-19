import { Controller, Get, Inject, Module, VERSION_NEUTRAL, type DynamicModule } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  TerminusModule,
  type HealthIndicatorFunction,
} from '@nestjs/terminus';

export const HEALTH_INDICATORS = Symbol('HEALTH_INDICATORS');

@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    @Inject(HEALTH_INDICATORS) private readonly indicators: HealthIndicatorFunction[],
  ) {}

  /**
   * Liveness — "is the process up and able to handle requests at all". Deliberately
   * does not check downstream dependencies; a Postgres blip should not make the
   * orchestrator (Railway/k8s) kill and restart an otherwise-healthy pod.
   */
  @Get('health')
  liveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /**
   * Readiness — "can this instance actually serve traffic right now". Runs every
   * indicator the consuming service registered (DB ping, Redis ping, Qdrant ping, etc.).
   * Load balancers/orchestrators should stop routing traffic here on failure, without
   * necessarily restarting the process.
   */
  @Get('ready')
  @HealthCheck()
  readiness(): ReturnType<HealthCheckService['check']> {
    return this.health.check(this.indicators);
  }
}

interface HealthModuleOptions {
  /** Async checks specific to this service — e.g. Prisma ping, Redis ping, Qdrant ping.
   * Built and supplied by the consuming service (Layer 3 packages own those clients;
   * shared-observability at Layer 2 must not depend on them). */
  indicators?: HealthIndicatorFunction[];
}

@Module({})
export class HealthModule {
  static forRoot(options: HealthModuleOptions = {}): DynamicModule {
    return {
      module: HealthModule,
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: HEALTH_INDICATORS, useValue: options.indicators ?? [] }],
    };
  }
}
// force rebuild
