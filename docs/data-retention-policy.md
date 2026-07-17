# Data Retention Policy (GDPR-Ready Architecture)

This document describes what ZaraX's architecture already supports for data retention
and subject-rights requests, and what remains to be built before claiming full GDPR
compliance (which is a legal determination, not purely a technical one — this document
covers the technical architecture only).

## What's already in place

- **Soft delete on core business entities** (`Tenant`, `User`, `Agent` —
  `deletedAt` column, added this milestone). A "delete my account" or "delete this
  agent" request is immediately reflected in every read path (every repository method
  filters `deletedAt: null` by default) without destroying the underlying row instantly
  — this is what makes a **grace-period undo** possible (e.g. "restore my account
  within 30 days") and gives an operator a forensic trail if a deletion needs
  investigating.
- **Conversation history has a hard TTL already** (`llm-orchestrator`'s
  `ConversationStateService`, 2-hour Redis TTL) — in-flight call transcripts are not
  retained indefinitely by default; they expire automatically.
- **Audit logs are tenant-scoped and queryable** (`@zarax/audit-log`) — supports
  answering "what happened to this user's data and when," a common subject-access-
  request component.
- **Tenant isolation** (DB/Redis/Qdrant, see `docs/architecture.md`) means a
  tenant-level or user-level data export/deletion request has a clean boundary — no
  risk of a deletion accidentally touching another tenant's rows.

## What's designed but not yet scheduled/automated

1. **Hard-delete purge job** — soft-deleted rows currently stay in Postgres
   indefinitely. A real retention policy needs a scheduled job (a natural fit for
   `@zarax/job-queue`, once a recurring/cron-triggered job type is added — today's
   `JobQueue` only supports on-demand `add()`, not a scheduler) that hard-deletes rows
   where `deletedAt` is older than the tenant's configured retention window (e.g. 30
   days), cascading through every table with a foreign key to the deleted row.
2. **Right to erasure (GDPR Art. 17) end-to-end flow** — soft delete + a future purge
   job covers the mechanism, but a complete flow also needs: an API endpoint a tenant
   admin (or, per-user, the user themself) can call to request erasure; confirmation
   that erasure has propagated to Qdrant (delete the tenant's/user's vector points, not
   just Postgres rows) and to any third-party processor ZaraX's tools send data to
   (webhooks, CRM integrations) — the last part depends on which real integrations
   exist by the time this is built.
3. **Right to data portability (GDPR Art. 20)** — an export endpoint producing a
   structured (JSON) dump of a tenant's/user's data across Postgres tables. Not yet
   built; straightforward once the retention windows and erasure flow above exist,
   since it's largely the same "gather everything scoped to this tenant/user" query
   shape.
4. **Per-data-type retention windows** — today's implicit policy is "keep until soft-
   deleted, then indefinitely." A configurable policy (e.g. call transcripts: 90 days;
   audit logs: 1 year; usage/billing events: 7 years for financial record-keeping)
   needs a small `RetentionPolicy` config (per tenant plan tier, likely) driving the
   purge job in item #1.
5. **Consent and data-processing records** — if ZaraX's tools call third-party
   processors (webhooks, future CRM/calendar integrations), a GDPR-complete
   architecture tracks what data was sent to which processor and when — currently
   `@zarax/audit-log`'s `tool.executed` action entries capture this at the "an action
   happened" level; whether that's sufficient detail for a formal data-processing
   register is a legal/compliance question, not an engineering one.

## Recommended next milestone

Build the **hard-delete purge job** (item #1) first — it's the most mechanical piece,
directly unblocks the erasure flow (item #2), and can ship as soon as `@zarax/job-queue`
gets a recurring/scheduled job type (currently only supports on-demand jobs). Everything
else in this document builds on top of that foundation.
