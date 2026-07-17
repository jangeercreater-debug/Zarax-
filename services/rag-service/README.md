# @zarax/rag-service

Retrieval-augmented generation — document ingestion (chunk → embed → store) and
semantic search over each tenant's knowledge base.

## Endpoints

All routes are versioned (`/v1/...`) except health/metrics.

| Method | Path                          | Auth | Description |
|--------|-------------------------------|------|--------------|
| POST   | `/v1/documents`               | `knowledge_base:manage` | Ingest raw text directly |
| POST   | `/v1/documents/upload`        | `knowledge_base:manage`, rate limit (20/min) | Upload a PDF, DOCX, or TXT file |
| POST   | `/v1/documents/url`           | `knowledge_base:manage`, rate limit (20/min) | Ingest a single web page by URL |
| GET    | `/v1/documents`               | `knowledge_base:manage` | List documents, optionally filtered by `?status=` / `?sourceType=` |
| GET    | `/v1/documents/:id`           | `knowledge_base:manage` | Get one document, including processing status |
| DELETE | `/v1/documents/:id`           | `knowledge_base:manage` | Delete a document and its indexed chunks |
| POST   | `/v1/documents/:id/reindex`   | `knowledge_base:manage` | Re-chunk/re-embed from the already-stored extracted text |
| POST   | `/v1/search`                  | any authenticated principal | Embeds a query and returns the top-k matching chunks |
| GET    | `/health`, `/ready`, `/metrics` | none | From `@zarax/shared-observability` |
| GET    | `/docs`                        | none | Auto-generated OpenAPI/Swagger UI |

`/search` deliberately has no permission requirement beyond authentication — it's
called both by human-facing tenant traffic (via the gateway) and by
`llm-orchestrator` acting as a `service_account` Principal during a live call (see
`/docs/auth-design.md`), so it accepts either Principal type.

## Pipeline

Text extraction is synchronous (fast — CPU-bound file parsing, or a single HTTP
fetch); chunking/embedding/indexing is asynchronous, via `@zarax/job-queue`, since
it's the network-dependent, potentially slow/flaky part (OpenAI embedding calls,
Qdrant upserts):

```
Upload/URL:  file or URL → extract text (sync) → create KnowledgeBaseDocument (status: pending)
                                                → enqueue processing job → return immediately

Worker:      load extractedText → status: processing
                                 → deleteByDocumentId() [clears stale chunks — safe to re-run]
                                 → chunkText() [paragraph/sentence-aware, with overlap]
                                 → EmbeddingService.embedBatch() [resilience-wrapped]
                                 → VectorStoreService.upsert() [tenant-scoped Qdrant collection]
                                 → status: completed (or, after every retry is
                                   exhausted: failed, via @zarax/job-queue's dead-letter callback)

Search:      query → EmbeddingService.embedOne()
                    → VectorStoreService.search() [same tenant collection]
                    → top-k chunks with similarity score
```

**Re-index** re-runs chunking/embedding from the already-stored `extractedText` — it
does not re-fetch a URL or re-parse an original file. There's no object storage
service in this project, so original file bytes aren't kept; only the extracted text
is. Re-fetching a URL's *current* live content (as opposed to recomputing embeddings
from what's already stored) would be a distinct "refresh from source" feature, not
built here.

**Single-page URL ingestion only** — a genuine multi-page crawler (following links,
respecting `robots.txt`, depth limits) is a materially larger feature and isn't built.
The URL extractor also blocks the common SSRF vectors (localhost, private/link-local
IP ranges) since a tenant-supplied URL is untrusted input reaching an outbound fetch
from our own infrastructure.

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
