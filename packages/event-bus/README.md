# @zarax/event-bus

Layer 2 — typed pub/sub for cross-service events (`call.*`, `tool.*`, `workflow.*` from
`@zarax/shared-types`). Decouples `voice-gateway`, `llm-orchestrator`, `tool-executor`,
and `workflow-engine` from each other — none of them import each other's source
(enforced by `.dependency-cruiser.cjs`); they only publish/subscribe to typed events.

**Why this doesn't depend on `@zarax/redis-client`:** both are internal packages, but
`event-bus` is Layer 2 and `redis-client` is Layer 3 — Layer 2 cannot depend upward on
Layer 3 (see `/docs/dependency-rules.md`). `event-bus` uses the `ioredis` **npm package**
directly (an external dependency, not an internal one), which is unaffected by internal
layering rules.

## Usage

```ts
// Publishing (e.g. from voice-gateway when a call ends)
const event = createEvent({ type: 'call.ended', tenantId, payload: { callId, agentId, durationMs, endReason } });
await eventBus.publish(event);

// Subscribing (e.g. in workflow-engine)
eventBus.subscribe('call.ended', async (event) => {
  // event is fully typed as CallEndedEvent here
});
```

Swappable transport: `RedisEventBusService` is today's implementation of the `EventBus`
interface. Moving to Kafka/NATS later means writing a new class implementing the same
interface — no call site changes.
