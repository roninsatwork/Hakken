> **RETIRED 2026-07-20.** All previous plans were closed to start fresh.
> This document is historical reference only and must not drive new work.
> The single source of truth is [Movement Definitive Plan](../active/movement-definitive-plan.md).

# AI Runtime Retry Hardening Plan

This plan documents the current AI call-site audit and the phased work needed to make provider calls robust when providers throttle, time out, or return transient errors. The immediate product goal is: when a provider returns `429` or another retryable failure, Hakken should pause, retry with bounded backoff, and continue the in-flight task whenever it is safe to do so.

## Implementation Status

Core runtime retry hardening is implemented.

- Added shared retry classification, bounded exponential backoff, jitter, and `Retry-After` support in `convex/aiProviderRetryService.ts`.
- Routed OpenAI and Anthropic generation, model sync, and provider health model-list calls through retried HTTP requests.
- Added Google Vertex SDK wrappers for `generateContent` and `embedContent`.
- Moved direct Google generation and embedding calls in chat, title generation, transcription, workflow config generation, agents, swarm, knowledge ingestion, sales reports, and routing behind retry wrappers.
- Added a drift test that blocks new raw provider model calls outside the retry wrapper boundary.
- Changed knowledge ingestion so documents are marked `failed` when chunk embedding fails permanently instead of saving partial chunks as `ready`.
- Updated provider-neutral fallback text where runtime errors may come from Google, OpenAI, or Anthropic.
- Routed Resend email dispatch calls through the retry-aware HTTP helper with stable idempotency keys for invite, workflow, and platform-alert sends.
- Left Firecrawl website map/scrape calls on their existing behavior for now; only the downstream AI embedding step uses the new retry wrapper.

Remaining optional follow-ups:

- Add persisted retry counters or aggregate retry metrics to AI operations dashboards.
- Consider moving Firecrawl website map/scrape calls onto the retry helper later if website ingestion needs the same `Retry-After` and jitter behavior.
- Consider resumable, chunk-by-chunk knowledge ingestion for very large documents if action sleep time becomes a production limit.

## Current State

Hakken has a provider-neutral generation path, but retry handling is still thin.

- `convex/providerHttpService.ts` parses provider HTTP failures but does not classify status codes, read `Retry-After`, retry, add jitter, or preserve provider metadata on errors.
- `convex/openaiProviderService.ts` calls OpenAI Responses and Models endpoints directly through `fetch`.
- `convex/anthropicProviderService.ts` calls Anthropic Messages and Models endpoints directly through `fetch`.
- `convex/googleProviderAdapter.ts` calls `ai.models.generateContent` directly through the Google GenAI SDK.
- `convex/aiProviderRegistry.ts` is the right shared generation boundary for provider-neutral chat and title generation.
- Several older or richer paths still call the Google SDK directly because they use embeddings, multimodal input, JSON schema, Google Search grounding, or tool declarations.

There is one existing special-case retry behavior:

- `convex/knowledgeActions.ts` reschedules website scraping after a Firecrawl `429`, but with a fixed 10 second delay and without `Retry-After` parsing or attempt tracking.

## Audited AI And Provider Call Sites

### Shared Provider Runtime

- `convex/providerHttpService.ts`
  - Existing helper: `parseProviderJsonResponse`.
  - Gap: throws ordinary `Error` for all non-OK responses, so callers cannot distinguish retryable throttling from permanent credential/configuration errors.

- `convex/openaiProviderService.ts`
  - Runtime generation: `createOpenAIProviderAdapter(...).generateText`.
  - Model sync/health: `listOpenAIModels`.
  - Gap: no retries for `429`, `408`, `409`, `425`, or `5xx`; no `Retry-After` support.

- `convex/anthropicProviderService.ts`
  - Runtime generation: `createAnthropicProviderAdapter(...).generateText`.
  - Model sync/health: `listAnthropicModels`.
  - Gap: same as OpenAI.

- `convex/googleProviderAdapter.ts`
  - Runtime generation: `createGoogleProviderAdapter(...).generateText`.
  - Gap: direct SDK call has no retry wrapper and no normalized retryable error classification.

- `convex/aiProviderRegistry.ts`
  - Provider-neutral generation boundary: `generateTextWithResolvedModel`.
  - Opportunity: keep retry inside adapters or a shared runtime helper so callers do not each invent retry behavior.

### Chat And Assistant

- `convex/ai.ts`
  - Assistant RAG embedding uses `ai.models.embedContent`.
  - Main assistant response uses `generateTextWithResolvedModel`.
  - Audio transcription uses direct `ai.models.generateContent`.
  - Thread title generation uses `generateTextWithResolvedModel`.
  - Workflow node config generation uses direct `ai.models.generateContent` with JSON schema.
  - Gap: main generation failure is caught and saved as an offline assistant message. Retry must happen before that catch writes a terminal failure.

### Agents, Tools, Workflows, Swarm

- `convex/agentRuntime.ts`
  - Agent RAG embedding uses `ai.models.embedContent`.
  - Agent response pass 1 and tool-synthesis pass 2 use direct `ai.models.generateContent`.
  - Workflow agent node execution uses direct `ai.models.generateContent`.
  - Gap: multi-pass agent calls need per-call retry. Retrying the whole action after tool logging could duplicate logs or change state.

- `convex/swarmActions.ts`
  - Architect agent embedding uses `ai.models.embedContent`.
  - Each swarm micro-agent uses direct `ai.models.generateContent`.
  - Gap: each micro-agent currently becomes an error log entry on transient failures. Retry should happen inside the micro-agent step before marking it failed.

- `convex/workflowRuntime.ts`
  - Agent nodes call `internal.agentRuntime.executeAgentNode`.
  - API action nodes and email nodes use external HTTP calls that are not AI providers, but would benefit from a separate generic integration retry policy later.
  - Gap: workflow AI retry should be handled inside `executeAgentNode` so workflow step state remains claimed and can continue.

### Knowledge And Reports

- `convex/knowledgeActions.ts`
  - Document ingestion chunks text and embeds each chunk using direct `ai.models.embedContent`.
  - Website queue calls Firecrawl map/scrape through `fetch`.
  - Gap: embedding failures are logged per chunk and then skipped. Under throttling, this can silently create partial knowledge documents.

- `convex/salesReportActions.ts`
  - Sales report generation uses direct `ai.models.generateContent` with JSON schema.
  - Gap: batch generation logs failure and throws. Retry should happen around the model call before writing the error log.

- `convex/orchestrator.ts`
  - Intent routing uses direct `ai.models.generateContent` with JSON schema.
  - Gap: routing fails open to the global assistant. A short retry budget is safe here, but it should remain lower latency than full chat/report generation.

## Retry Policy

Add a single retry policy that provider adapters and Google SDK helpers share.

### Retryable Conditions

Retry these failures by default:

- HTTP `408`, `409`, `425`, `429`, `500`, `502`, `503`, `504`.
- Network and connection failures from `fetch`.
- Google SDK errors that expose retryable status/code values, including `429`, `RESOURCE_EXHAUSTED`, `503`, `UNAVAILABLE`, `DEADLINE_EXCEEDED`, and `INTERNAL`.
- Provider messages that clearly indicate transient throttling, quota burst exhaustion, timeout, overload, or temporary unavailability.

Do not retry these failures by default:

- HTTP `400`, `401`, `403`, `404`, `422`.
- Missing API keys, disabled providers, unsupported model/provider combinations, invalid schemas, invalid JSON parsing, tenant/auth failures, payload too large, and local validation errors.
- Tool permission denials or admin/user access checks.

### Backoff Defaults

Use bounded exponential backoff with jitter.

- `maxAttempts`: 4 for user-facing generation, 3 for low-latency routing/title generation, 5 for background ingestion/report jobs.
- `baseDelayMs`: 1,000.
- `maxDelayMs`: 30,000 for chat/agent/workflow/report generation, 10,000 for routing/title.
- `jitter`: randomize each calculated delay by roughly +/- 20 percent.
- `Retry-After`: if present and valid, honor it within bounds. Support both seconds and HTTP-date formats.
- `maxElapsedMs`: keep a hard ceiling per call path so Convex actions do not sleep indefinitely.

### Error Shape

Introduce a typed retry error shape rather than throwing plain `Error` everywhere.

Recommended fields:

- `providerKey`
- `operation`, for example `generateText`, `embedContent`, `listModels`, `transcribeAudio`
- `status`
- `code`
- `retryable`
- `attempt`
- `maxAttempts`
- `retryAfterMs`
- `message`
- `safeProviderMessage`

The safe message must not include API keys, raw request bodies, full prompts, uploaded file content, or provider payloads that may contain user data.

## Implementation Plan

### Phase 1: Shared Retry Utilities

Create a focused runtime helper, probably `convex/aiProviderRetryService.ts`.

It should provide:

- `sleep(ms)` for actions.
- `parseRetryAfterMs(headers, now?)`.
- `isRetryableHttpStatus(status)`.
- `classifyProviderError(error)`.
- `withProviderRetry(operation, fn, policyOverrides?)`.
- Sanitized attempt logging hooks.

Acceptance checks:

- Unit tests cover `429` with `Retry-After`, HTTP-date retry headers, `503` without retry headers, network failures, invalid JSON as non-retryable, and auth/config errors as non-retryable.
- Tests verify max attempts and jitter bounds without relying on real timers when possible.

### Phase 2: Fetch Provider Adapters

Update `convex/providerHttpService.ts` so provider HTTP calls can be retried consistently.

Recommended shape:

- Add `requestProviderJson({ providerName, providerKey, operation, fetchImpl, url, init, retryPolicy })`.
- Keep `parseProviderJsonResponse` or replace it with the new helper.
- Make OpenAI and Anthropic generation/model-list calls go through the helper.

Call sites:

- `convex/openaiProviderService.ts`
- `convex/anthropicProviderService.ts`

Acceptance checks:

- OpenAI generation retries a first `429` response, waits according to `Retry-After`, and then returns the successful second response.
- Anthropic generation retries a first `503` response and does not retry `401`.
- Model sync/connection tests receive degraded/error health only after retry exhaustion.

### Phase 3: Google SDK Wrappers

Add Google-specific retry wrappers behind the Vertex boundary.

Recommended shape:

- `generateGoogleContentWithRetry(ai, request, context)`.
- `embedGoogleContentWithRetry(ai, request, context)`.
- Error classifier that understands Google SDK `status`, `code`, `message`, and nested cause fields.

Call sites:

- `convex/googleProviderAdapter.ts`
- `convex/ai.ts`
- `convex/agentRuntime.ts`
- `convex/swarmActions.ts`
- `convex/knowledgeActions.ts`
- `convex/salesReportActions.ts`
- `convex/orchestrator.ts`

Acceptance checks:

- Direct Google generation calls no longer call `ai.models.generateContent` without retry except inside the helper itself.
- Direct Google embedding calls no longer call `ai.models.embedContent` without retry except inside the helper itself.
- Tests simulate Google-style `429` and `UNAVAILABLE` errors and confirm continuation after a later success.

### Phase 4: Preserve Task Continuation Semantics

Apply retries at the smallest safe boundary.

- Chat: retry RAG embedding and final generation before saving an offline assistant message.
- Agents: retry pass 1 and pass 2 separately; do not re-run tool logging or tool access checks because a synthesis retry failed.
- Workflow agent nodes: retry the model call while the existing step is claimed, then finalize normally.
- Swarm: retry each micro-agent call before marking that micro-agent log as `error`.
- Knowledge ingestion: retry each chunk embedding. If retries exhaust, record a clear partial-ingestion status or fail the document rather than silently skipping many chunks.
- Sales reports: retry the model call before writing `BATCH_GENERATION_ERROR`.
- Router/title generation: use a short retry policy and keep current fail-open behavior after exhaustion.

Acceptance checks:

- Chat does not produce duplicate user messages or duplicate assistant replies after retry.
- Agent tool runs do not duplicate `TOOL DISPATCH` logs when only the final synthesis call is retried.
- Workflow steps remain single-finalized.
- Knowledge document status reflects whether all chunks embedded or some chunks failed permanently.

### Phase 5: Observability And Admin Feedback

Add lightweight telemetry so throttling is visible without exposing sensitive data.

Recommended additions:

- Log provider retry attempts with provider, operation, status/code, attempt, delay, and final outcome.
- Store final retry exhaustion in existing agent/chat/report logs where those logs already exist.
- Consider adding aggregated retry counts to AI cost/usage analytics later, but do not block the first robustness pass on analytics schema work.
- Update user-facing fallback messages to be provider-neutral. Avoid messages that say "Google Cloud intelligence cluster" when OpenAI or Anthropic may have been selected.

Acceptance checks:

- Logs distinguish retried-success from retry-exhausted.
- No prompt, file content, API key, or raw provider payload is stored in retry logs.
- User-facing chat failures are neutral and action-oriented.

### Phase 6: Regression Tests And Drift Checks

Add focused tests before broad refactors.

Recommended tests:

- `convex/providerHttpService.test.ts` for retry classification and `Retry-After`.
- `convex/openaiProviderService.test.ts` retry coverage for generation and model list.
- `convex/anthropicProviderService.test.ts` retry coverage for generation and model list.
- `convex/googleProviderAdapter.test.ts` or `convex/vertexProviderService.test.ts` retry coverage using injected fake model clients if needed.
- Extend existing chat/agent/workflow/report tests only where they can verify no duplicate persisted state.
- Add a drift test that flags direct `ai.models.generateContent` and `ai.models.embedContent` calls outside approved helper files.

Quality gates:

```bash
npm run lint:all
npm run check
npm run build
git diff --check
```

## Suggested Work Order

1. Build and test the shared retry classifier/helper.
2. Move OpenAI and Anthropic fetch calls onto it.
3. Add Google SDK retry wrappers and move `googleProviderAdapter` first.
4. Replace direct Google calls in chat/title/transcription/workflow config.
5. Replace direct Google calls in agent runtime and workflow agent node execution.
6. Replace direct Google calls in swarm, sales reports, and knowledge ingestion.
7. Tighten user-facing fallback text and retry observability.
8. Add the drift test after all approved direct call sites are gone.

## Open Decisions

- Whether background knowledge ingestion should pause inside one action for all chunk retries or reschedule long documents with attempt state. For small documents, in-action retry is simpler. For large documents, resumable chunk processing is safer.
- Whether provider retry policy should be configurable in system settings or kept as code constants first.
- Whether Firecrawl should join the same retry helper later or remain on its existing queue reschedule behavior. It is not an AI provider, but the same classification approach applies.
- Whether non-Google providers should support embeddings, tool calls, JSON schema, and multimodal paths before direct Google paths are made provider-neutral. Retry hardening can happen first without changing provider selection semantics.
