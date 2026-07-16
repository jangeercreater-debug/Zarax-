# @zarax/feature-flags

Layer 4 — feature flag evaluation: tenant override > global default > percentage
rollout (consistent-hashed per tenant, so a tenant's bucket membership never flips
between evaluations). Redis-cached (30s TTL) with Postgres as the source of truth.

## Usage

```ts
const enabled = await this.featureFlagService.isEnabled('new_agent_builder', tenantId);
```

Unknown flags fail closed (return `false`) rather than throwing — a typo'd flag key
degrades to "feature off," never a crash.
