# @zarax/rag-service

Retrieval-augmented generation — document ingestion (chunk → embed → store) and
semantic search over each tenant's knowledge base.

## Endpoints

| Method | Path         | Auth | Description |
|--------|--------------|------|--------------|
| POST   | `/documents` | `knowledge_base:manage` permission | Chunks, embeds, and stores a document |
| POST   | `/search`    | any authenticated principal | Embeds a query and returns the top-k matching chunks |
| GET    | `/health`, `/ready`, `/metrics` | none | From `@zarax/shared-observability` |

`/search` deliberately has no permission requirement beyond authentication — it's
called both by human-facing tenant traffic (via the gateway) and by
`llm-orchestrator` acting as a `service_account` Principal during a live call (see
`/docs/auth-design.md`), so it accepts either Principal type.

## Pipeline

```
Ingest:  text → chunkText() [paragraph/sentence-aware, with overlap]
              → EmbeddingService.embedBatch() [OpenAI text-embedding-3-small, resilience-wrapped]
              → VectorStoreService.upsert() [tenant-scoped Qdrant collection, auto-created]

Search:  query → EmbeddingService.embedOne()
               → VectorStoreService.search() [same tenant collection]
               → top-k chunks with similarity score
```

## Why chunking never splits mid-sentence

`chunkText()` splits on sentence boundaries first, only breaking a document into a new
chunk once the running total exceeds `maxChunkSize` — a chunk ending mid-sentence would
retrieve as an incomplete, confusing fragment for the LLM to reason over. A small
overlap (default 100 characters) is carried into the next chunk so context isn't lost
right at a chunk boundary.

## Why the embedding model is fixed, not configurable per-tenant

All chunks in a tenant's collection must share the same embedding model — vectors from
different models aren't comparable. `text-embedding-3-small` is hardcoded for this
milestone; supporting multiple embedding models per tenant would require per-tenant
collection-naming to also encode the model (a larger design change, deferred).

## Local development

```bash
cp .env.example .env
pnpm --filter @zarax/database migrate:dev
pnpm --filter @zarax/rag-service dev
```

## Docker

```bash
docker build -f services/rag-service/Dockerfile -t zarax-rag-service .
```
