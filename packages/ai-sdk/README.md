# @zarax/ai-sdk

Layer 3 — unified `LLMProvider` interface over Claude, Groq, OpenAI, and Gemini.
`llm-orchestrator` (and any other service that calls an LLM) depends on this package and
the `AI_PROVIDER_REGISTRY` token — never on `@anthropic-ai/sdk`, `openai`, or
`@google/generative-ai` directly. Switching providers, adding a fallback chain, or
A/B-testing models becomes a config change.

## Wiring

```ts
AiSdkModule.forRoot({
  defaultProvider: 'anthropic',
  anthropicApiKey: config.get('ANTHROPIC_API_KEY'),
  groqApiKey: config.get('GROQ_API_KEY'),
  openaiApiKey: config.get('OPENAI_API_KEY'),
  geminiApiKey: config.get('GEMINI_API_KEY'),
})
```

Only providers with a configured API key are registered — calling `registry.get('groq')`
when no Groq key was provided throws a clear `DependencyUnavailableError` rather than a
confusing downstream SDK error.

## Why GroqProvider extends OpenAiProvider

Groq's API is OpenAI-compatible at the wire level — `GroqProvider` reuses
`OpenAiProvider`'s request/response mapping entirely and only overrides the base URL and
vendor label, per the project's no-duplicate-code principle.

## Streaming

`streamComplete()` yields a common `StreamChunk` union (`text_delta` / `tool_call` /
`done`) regardless of vendor — `llm-orchestrator` consumes one shape no matter which
provider is active.
