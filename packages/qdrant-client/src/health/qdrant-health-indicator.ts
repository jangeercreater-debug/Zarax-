import type { QdrantClient } from '@qdrant/js-client-rest';
import type { HealthIndicatorService } from '@nestjs/terminus';

export function createQdrantHealthIndicator(
  client: QdrantClient,
  healthIndicatorService: HealthIndicatorService,
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
