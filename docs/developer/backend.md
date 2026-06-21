# Backend & Data Layer

The Sonae backend is a reactive, real-time ecosystem powered by Convex. It manages complex multi-tenant data, vector search, and AI agent orchestration.

## 📊 Convex Schema Overview

The schema is defined in `convex/schema.ts` and enforces strict typings across the stack.

### Key Tables:
- **`companies`**: Tenant definitions and organization-wide system prompts.
- **`users`**: Profile management and Roles (`SUPER_ADMIN`, `ADMIN`, `USER`).
- **`agents`**: Configuration for AI thinkers (LLM model, temperature, tools, rules).
- **`workflows`**: Reactive orchestration graphs (nodes/edges).
- **`knowledgeDocuments` / `knowledgeChunks`**: RAG pipeline data with vector indices.
- **`auditLogs`**: Immutable ledger of administrative actions.

## ⚡ Execution Runtimes

Execution is strategically split between Two environments:

1.  **Convex V8 (Edge)**:
    - Queries and Mutations.
    - Optimized for millisecond reactivity and native Auth context.
    - Used for UI polling, log retrieval, and metadata updates.
2.  **Node.js (Actions)**:
    - Heavy computation and external API calls (e.g., Google GenAI, Vertex SDK).
    - Necessary for the Swarm Engine where multi-agent chaining occurs.
    - Files: `convex/aiModelsActions.ts`, `convex/knowledgeActions.ts`, `convex/swarmActions.ts`.

## 🧠 The Swarm Engine

The Autonomous Swarm is the platform's brain.
- **Isolation**: It extracts tenant context (`companyName`, `systemPrompt`) on-the-fly from the database, ensuring zero hardcoding of domain knowledge.
- **Context Security**: RAG searches inside the Swarm are filtered by `companyId` at the vector index level to prevent cross-tenant data bleed.
- **Memory**: Swarm state is persisted in `swarmLogs` and `messages`.

## 🏦 Full-Spectrum Audit Ledger

All administrative changes must be traceable.
```typescript
// Example: Insert audit log after successful mutation
await ctx.db.insert("auditLogs", {
  actorId: user._id,
  actionType: "UPDATE_AGENT",
  entityId: agentId,
  entityType: "agents",
  metadata: JSON.stringify(updates),
  companyId: user.companyId,
  timestamp: Date.now(),
});
```

---

> [!IMPORTANT]
> **Performance Tip**: Avoid heavy computations inside Mutations. Move expensive logic (PDF parsing, LLM calls) to Actions and use the `scheduler` for background processing.
