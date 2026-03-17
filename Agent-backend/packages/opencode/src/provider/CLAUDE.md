# provider

> **Path:** `Agent-backend/packages/opencode/src/provider/`

## Purpose

Provider-agnostic LLM integration layer. Registers and manages 20+ AI providers (Anthropic, OpenAI, Google, Azure, Bedrock, Groq, Mistral, xAI, OpenRouter, GitHub Copilot, etc.) via the Vercel AI SDK. Handles model resolution, provider authentication, response transformations, token limits, error classification (overflow, rate limit, retryable), and model metadata from models.dev.

## Usage Status

| Product             | Status   | Notes                                          |
| ------------------- | -------- | ---------------------------------------------- |
| Orbit Desktop (SDK) | `active` | All LLM calls flow through this provider layer |
| Orbit CLI           | `active` | All LLM calls flow through this provider layer |

## Key Files

| File           | Purpose                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider.ts`  | `Provider` namespace -- provider registry, model resolution with fuzzy matching, SDK instance creation for all 20+ providers, model listing |
| `auth.ts`      | `ProviderAuth` namespace -- authentication method discovery via plugins (OAuth, API key), credential management                             |
| `models.ts`    | `ModelsDev` namespace -- model metadata fetching/caching from models.dev (capabilities, costs, context windows)                             |
| `transform.ts` | `ProviderTransform` namespace -- provider-specific message/tool transformations, output token limits, modality filtering                    |
| `error.ts`     | `ProviderError` namespace -- error classification (overflow patterns, retryable errors, rate limits) across all providers                   |
