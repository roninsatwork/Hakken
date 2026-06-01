# AI Provider And Tool Extension Notes

This note supports Phase 3 of the code quality plan. Keep runtime code provider-neutral except inside adapter modules.

## Provider Path

- Resolve the execution model through `convex/aiModels.resolveModelForExecution`.
- Keep model selection rules in `convex/aiModelService.ts`.
- Keep Vertex client setup in `convex/vertexProviderService.ts`.
- Add any future provider behind its own adapter service instead of constructing provider clients inline in actions.
- Runtime actions should pass provider-neutral prompts, content, configs, and tool declarations into the adapter boundary.

## Tool Path

- Store global tool metadata in `aiTools`.
- Bind tools to agents through `agentTools`.
- Build model-facing tool declarations through `convex/aiToolExecutionService.ts`.
- Normalize function names before sending them to a provider.
- Parse and validate model tool-call args as JSON objects before any backend execution.
- Return normalized tool result payloads with either `{ status: "success", data }` or `{ status: "error", error }`.

## Safety Rules

- Never execute a tool solely because the model requested it.
- Re-check the caller role and tenant boundary before executing a backend tool.
- Reject invalid tool payloads clearly.
- Treat tool schemas and tool results as untrusted data.
- Keep provider-specific terms such as Vertex only at real provider boundaries.
