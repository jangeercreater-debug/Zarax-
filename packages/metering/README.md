# @zarax/metering

Layer 4 — provider cost tracking and usage metering, one `UsageEvent` row per billable
unit of provider consumption. See `docs/production-standards.md` items #4 and #5.

## Usage

```ts
await meteringService.recordLlmUsage({
  tenantId, provider: 'anthropic', model: 'claude-sonnet-4-5',
  inputTokens: completion.usage.inputTokens, outputTokens: completion.usage.outputTokens,
  callId,
});
```

Wired as the reference example in `llm-orchestrator`'s `ConversationOrchestratorService`
— every LLM completion call records its token usage and calculated cost. `stt-service`/
`tts-service`/`rag-service` should record `recordSttUsage()`/`recordTtsUsage()`/
`recordRagEmbeddingUsage()` the same way as those pipelines mature.

## Pricing data

`src/pricing/pricing-table.ts` is a manually-maintained snapshot of provider list
pricing — treat `UsageEvent.costUsd` as **accounting telemetry** (relative cost
tracking, budget alerts, billing estimates), not as an authoritative invoice figure.
Update the table when a provider's pricing changes; an unknown model/provider
calculates to $0 rather than throwing, so metering never blocks a real request over a
pricing-table gap.
