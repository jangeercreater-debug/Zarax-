import { Controller, Get, Inject, Header } from '@nestjs/common';

import { METRICS_REGISTRY } from './metrics.module';
import type { MetricsRegistry } from './metrics.registry';

@Controller()
export class MetricsController {
  constructor(@Inject(METRICS_REGISTRY) private readonly metrics: MetricsRegistry) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
