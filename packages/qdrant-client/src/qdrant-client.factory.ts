import { QdrantClient } from '@qdrant/js-client-rest';

export interface CreateQdrantClientOptions {
  url: string;
  apiKey?: string;
}

export function createQdrantClient(options: CreateQdrantClientOptions): QdrantClient {
  return new QdrantClient({ url: options.url, apiKey: options.apiKey });
}
