import type { QdrantClient } from '@qdrant/js-client-rest';
import type { TenantId } from '@zarax/shared-types';

import { tenantCollectionName, type VectorCollectionPurpose } from '../collections/collection-naming';

export interface VectorPoint<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  vector: number[];
  payload: TPayload;
}

export interface VectorSearchResult<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  score: number;
  payload: TPayload;
}

export class VectorStoreService {
  constructor(
    private readonly client: QdrantClient,
    private readonly vectorSize: number,
  ) {}

  private async ensureCollection(collectionName: string): Promise<void> {
    const { exists } = await this.client.collectionExists(collectionName);
    if (exists) return;

    await this.client.createCollection(collectionName, {
      vectors: { size: this.vectorSize, distance: 'Cosine' },
    });
  }

  async upsert<TPayload extends Record<string, unknown>>(
    tenantId: TenantId,
    purpose: VectorCollectionPurpose,
    points: VectorPoint<TPayload>[],
  ): Promise<void> {
    const collectionName = tenantCollectionName(tenantId, purpose);
    await this.ensureCollection(collectionName);
    await this.client.upsert(collectionName, {
      wait: true,
      points: points.map((p) => ({ id: p.id, vector: p.vector, payload: p.payload })),
    });
  }

  async search<TPayload extends Record<string, unknown>>(
    tenantId: TenantId,
    purpose: VectorCollectionPurpose,
    queryVector: number[],
    limit = 10,
  ): Promise<VectorSearchResult<TPayload>[]> {
    const collectionName = tenantCollectionName(tenantId, purpose);
    const { exists } = await this.client.collectionExists(collectionName);
    if (!exists) return [];

    const results = await this.client.search(collectionName, { vector: queryVector, limit });
    return results.map((r) => ({
      id: String(r.id),
      score: r.score,
      payload: r.payload as TPayload,
    }));
  }

  async deletePoints(
    tenantId: TenantId,
    purpose: VectorCollectionPurpose,
    pointIds: string[],
  ): Promise<void> {
    const collectionName = tenantCollectionName(tenantId, purpose);
    await this.client.delete(collectionName, { points: pointIds, wait: true });
  }
}
