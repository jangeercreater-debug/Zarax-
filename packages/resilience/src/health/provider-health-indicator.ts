import type { ProviderHealthMonitor } from './provider-health-monitor';

interface HealthIndicatorServiceLike {
  check(key: string): { up(opts?: Record<string, unknown>): unknown; down(opts: Record<string, unknown>): unknown };
}

export function createProviderHealthIndicator(
  monitor: ProviderHealthMonitor,
  healthIndicatorService: HealthIndicatorServiceLike,
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
