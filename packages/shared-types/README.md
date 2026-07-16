# @zarax/shared-types

Layer 0 shared package — pure TypeScript types, enums, and contracts. **Zero internal
dependencies** (enforced by `.dependency-cruiser.cjs`). Every other package and app may
depend on this; this package may depend on nothing else in the monorepo.

Contains: tenant/multi-tenancy primitives, the `Principal` auth contract, versioned event
payload contracts for `event-bus`, shared error codes, and common API/result envelopes.
