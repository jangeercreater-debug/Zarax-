import type { HealthIndicatorService } from '@nestjs/terminus';

import type { ProviderHealthMonitor } from './provider-health-monitor';

export function createProviderHealthIndicator(
  monitor: ProviderHealthMonitor,
  healthIndicatorService: HealthIndicatorService,
) {
  return async () => {
    const indicator = healthIndicatorService.check(monitor.getProviderName());
    const snapshot = monitor.getSnapshot();

    if (!snapshot.isHealthy) {
      return indicator.down({
        failureRate: snapshot.failureRate,
        windowSize: snapshot.windowSize,
      });
    }
    return indicator.up({ failureRate: snapshot.failureRate, windowSize: snapshot.windowSize });
  };
}
