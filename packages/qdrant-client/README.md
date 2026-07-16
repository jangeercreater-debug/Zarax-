# @zarax/qdrant-client

Layer 3 — Qdrant wrapper. Tenant isolation strategy: **one collection per tenant per
purpose** (`tenant_{id}_knowledge_base`, `tenant_{id}_call_transcripts`), not a shared
collection filtered by a `tenant_id` payload field. A wrong collection name 404s; a
forgotten filter on a shared collection silently leaks data across tenants — the former
is a much safer failure mode, so it's the one this package makes structurally easy.

`VectorStoreService` auto-creates a tenant's collection on first `upsert()` — no manual
provisioning step needed when a new tenant signs up.
