import { Controller, Get, Header, VERSION_NEUTRAL } from '@nestjs/common';

import { MetricsRegistry } from './metrics.registry';

@Controller({ version: VERSION_NEUTRAL })
export class MetricsController {
  constructor(private readonly metrics: MetricsRegistry) {}

  @Get('metrics')
  @Header('Content-Type', 'text/plain')
  async getMetrics(): Promise<string> {
    return this.metrics.registry.metrics();
  }
}
