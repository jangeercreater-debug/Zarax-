# @zarax/ai-sdk

Layer 3 — unified `LLMProvider` interface over Claude, Groq, OpenAI, and Gemini.
`llm-orchestrator` (and any other service that calls an LLM) depends on this package and
the `AI_PROVIDER_REGISTRY` token — never on `@anthropic-ai/sdk`, `openai`, or
`@google/generative-ai` directly.

## Resilience is built in, not bolted on

Every provider adapter wraps its outbound calls in a `@zarax/resilience` `ResilientClient`
— retry with backoff, timeout, circuit breaker, rate limiting, and health monitoring, per
the project standard that business logic (and adapters themselves) never call a vendor
SDK unwrapped. `complete()` goes through the full pipeline (including retry); streaming
(`streamComplete()`) is circuit-breaker-gated at connection time only — see
`ClaudeProvider.streamComplete`'s doc comment for why retrying mid-stream isn't
meaningful once tokens have started emitting.

## Automatic fallback

```ts
const response = await registry.completeWithFallback(['anthropic', 'groq', 'openai'], request);
```

Tries each configured provider in order, preferring already-healthy ones (via each
provider's `resilientClient.healthMonitor`), falling back to the next on failure —
built on `@zarax/resilience`'s `FallbackChain`.

## Wiring

```ts
AiSdkModule.forRoot({
  defaultProvider: 'anthropic',
  anthropicApiKey: config.get('ANTHROPIC_API_KEY'),
  groqApiKey: config.get('GROQ_API_KEY'),
  openaiApiKey: config.get('OPENAI_API_KEY'),
  geminiApiKey: config.get('GEMINI_API_KEY'),
  logger,
})
```

Only providers with a configured API key are registered — calling `registry.get('groq')`
when no Groq key was provided throws a clear `DependencyUnavailableError` rather than a
confusing downstream SDK error.

## Why GroqProvider extends OpenAiProvider

Groq's API is OpenAI-compatible at the wire level — `GroqProvider` reuses
`OpenAiProvider`'s request/response mapping and resilience wiring entirely, only
overriding the base URL and vendor label (passed explicitly through the constructor
options, not via a subclass field override — see the doc comment on `GroqProvider` for
why: subclass field initializers run *after* the base constructor finishes, so a field
override isn't visible yet when the base constructor builds the resilience client).

## Streaming

`streamComplete()` yields a common `StreamChunk` union (`text_delta` / `tool_call` /
`done`) regardless of vendor — `llm-orchestrator` consumes one shape no matter which
provider is active.
