import type { QdrantClient } from '@qdrant/js-client-rest';

interface HealthIndicatorServiceLike {
  check(key: string): { up(): unknown; down(opts: Record<string, unknown>): unknown };
}

export function createQdrantHealthIndicator(
  client: QdrantClient,
  healthIndicatorService: HealthIndicatorServiceLike,
) {
  return async () => {
    const indicator = healthIndicatorService.check('qdrant');
    try {
      await client.getCollections();
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : 'unknown error' });
    }
  };
}
