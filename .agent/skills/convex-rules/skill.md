---
name: convex-best-practices
description: Convex principles for real-time backends. Schema design, functions (query/mutation/action), indexing, and security.
allowed-tools: Read, Write, Edit, Glob, Grep
---

# Convex Best Practices

> Principles for building and maintaining real-time, type-safe backends with Convex.

---

## 1. Schema & Data Modeling

### The Foundation

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
    tokenIdentifier: v.string(),
  }).index("by_token", ["tokenIdentifier"]),
  
  posts: defineTable({
    authorId: v.id("users"),
    title: v.string(),
    body: v.string(),
    isPublished: v.boolean(),
  }).index("by_author", ["authorId"]),
});
```

### Strategy

| Pattern | Use Case |
|---------|----------|
| **Normalized** | Default for data integrity and consistency |
| **Denormalized** | High-performance read paths (use sparingly) |
| **Soft Deletes** | When data history or recovery is required |

---

## 2. Function Types

### Decision Tree

```
Does the function need to...?
│
├── Read data only (Cached, Reactive)
│   └── Query (`query`)
│
├── Modify data (Transactional, Pure)
│   └── Mutation (`mutation`)
│
└── Side effects (Fetch, Crypto, AI)
    └── Action (`action`)
```

### Function Comparison

| Type | Pure? | Real-time? | Side Effects? | Use Case |
|------|-------|------------|---------------|----------|
| **Query** | Yes | Yes | No | Fetching UI state |
| **Mutation** | Yes | Yes | No | Updating database |
| **Action** | No | No | Yes | OpenAI, Stripe, Fetch |

---

## 3. Validation (The `v` Validator)

### Best Practices

- **Always validate arguments**: Never use `v.any()` for public functions.
- **Use `v.id("tableName")`**: Ensures foreign keys exist and are valid.
- **Strict schemas**: Keep `schema.ts` as the single source of truth for types.

```typescript
export const create = mutation({
  args: {
    title: v.string(),
    content: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // ... logic
  },
});
```

---

## 4. Indexing & Performance

### Query Optimization

- **Filter by Index**: Use `.withIndex()` instead of `.filter()` for large datasets.
- **Search Indexes**: Use `searchIndex` for full-text search.
- **Vector Indexes**: Use `vectorIndex` for AI/embeddings similarity search.

| Method | Performance | Use Case |
|--------|-------------|----------|
| `db.query("table").filter(...)` | O(N) - Slow | Small tables only |
| `db.query("table").withIndex(...)` | O(log N) - Fast | Standard lookups |
| `db.query("table").withSearchIndex(...)` | Optimized | Text search |

---

## 5. Security & Auth

### Access Control

- **Identify Users**: Use `ctx.auth.getUserIdentity()`.
- **Row-Level Security**: Check ownership inside the function handler.
- **Internal Functions**: Use `internalQuery` and `internalMutation` for system-only tasks.

```typescript
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new ConvexError("Not authenticated");
```

---

## 6. Error Handling

### Pattern

- Use `ConvexError` for expected errors (validation, auth, business logic).
- Let unexpected errors crash the function (logs will be captured).

```typescript
import { ConvexError } from "convex/values";

if (args.amount < 0) {
  throw new ConvexError("Amount must be positive");
}
```

---

## 7. Side Effects & Actions

### Rules of Thumb

1. **Mutations must be deterministic**: No `Date.now()`, `Math.random()`, or `fetch`.
2. **Actions handle the "Outside World"**: Use them for API calls.
3. **Chain functions**: Actions should call Mutations to save results to the DB.

---

## 8. Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|-------|
| Logic in Frontend | Move business logic to Convex Functions |
| `fetch` in Mutations | Move `fetch` to Actions |
| Skip Indexing | Index fields used in query filters |
| Return all fields | Map/Filter return values for the UI |
| Manual Type Casting | Rely on Convex generated `Doc` and `Id` types |

---

## 9. Project Structure

```
convex/
├── _generated/     # Auto-generated (DO NOT EDIT)
├── auth.config.ts  # Auth configuration
├── schema.ts       # Database schema
├── users.ts        # User-related functions
├── posts.ts        # Post-related functions
└── messages.ts     # Real-time message logic
```

---

## 10. Implementation Checklist

- [ ] Schema defined with proper types and indexes.
- [ ] Functions categorized correctly (Query/Mutation/Action).
- [ ] User identity checked for sensitive operations.
- [ ] Args validated using `v` validator.
- [ ] `ConvexError` used for user-facing errors.

---

> **Remember:** Convex is deterministic. Keep your database pure and reactive, and push the messy side effects into Actions.
