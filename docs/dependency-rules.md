# Dependency Rules

These rules are enforced in CI via `dependency-cruiser` (see `.dependency-cruiser.cjs`,
added in Milestone M2). A build fails if an import violates them — this document is the
source of truth the config encodes, not a suggestion.

## 1. Layering within `packages/*`

Packages are layered. A package may only depend on packages in the **same layer or below**.
Same-layer siblings must not depend on each other (that's a smell that the boundary is drawn
wrong — split or merge instead).

```
Layer 0  shared-types            (zero internal deps — pure types/enums/contracts)
Layer 1  shared-config, shared-logger, shared-errors     (depend only on Layer 0)
Layer 2  shared-auth, shared-observability, event-bus, resilience     (depend only on Layers 0-1)
Layer 3  database, redis-client, qdrant-client, ai-sdk    (depend only on Layers 0-2)
Layer 4  audit-log, feature-flags, api-standards           (depend only on Layers 0-3, incl. database/redis-client)
Layer 4  sdk, ui                                          (depend only on Layer 0, +Layer 2 sparingly for ui)
```

Rationale: this makes the dependency graph a DAG by construction. `shared-types` never
imports anything, so it can never be part of a cycle; every higher layer builds on strictly
lower, never sideways or backwards.

## 2. `services/*` (internal domain services)

- May depend on any `packages/*`.
- **Must NOT import from another `services/*` directly** (no `services/tool-executor`
  importing `services/workflow-engine` code). Cross-service communication happens only via:
  - `event-bus` (async, fire-and-forget or eventually-consistent flows)
  - Internal HTTP calls to another service's published contract (types shared via
    `shared-types`, never by importing the other service's internal modules)
- Must NOT be imported by `apps/*` directly — clients only reach services through
  `apps/gateway` or `apps/voice-gateway`.

## 3. `apps/*`

- `apps/gateway`, `apps/voice-gateway`: may depend on `packages/*` and may call
  `services/*` over the network (HTTP/event-bus), never via direct source import.
- `apps/web`, `apps/mobile`: may depend on `packages/sdk`, `packages/ui`, `packages/shared-types`.
  **Must NOT** depend on `packages/database`, `packages/redis-client`, `packages/qdrant-client`,
  `ai-sdk`, or any `services/*`/other `apps/*` — client apps only ever talk to the network
  boundary (`apps/gateway`) through the SDK.

## 4. Cross-cutting rules

- No package in `packages/*` may import from `apps/*` or `services/*` (dependency direction
  is always inward toward shared packages, never outward).
- Every `packages/*` entry has its own `package.json` with a real `version`, uses Changesets
  for version bumps, and declares its dependencies explicitly (no relying on hoisting).
- Circular imports anywhere in the graph are a CI failure, not a warning.

## 5. Enforcement

`dependency-cruiser` rules (added in M2) encode this document as `forbidden` rules with the
layer names above. `pnpm lint` runs it as part of the standard CI `lint` task.
