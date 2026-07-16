# @zarax/shared-config

Layer 1 — fail-fast environment configuration. Every service defines its required env
vars by composing zod schema fragments from `schemas/common-env.schemas.ts`
(`baseEnvSchema.merge(postgresEnvSchema).merge(redisEnvSchema)` etc.), then registers
`AppConfigModule.forRoot({ schema })` in its root module. Validation happens synchronously
at bootstrap — a misconfigured deployment crashes immediately with every missing/invalid
variable listed, rather than starting up and failing on the first request that touches it.
