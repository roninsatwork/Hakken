# System Architecture

The Sonae Platform is built as a high-performance, real-time AI orchestration engine. This document outlines the core technical foundations and structural boundaries.

## 🏗️ Core Technology Stack

- **Frontend**: Next.js 16 (App Router), React 19.
- **Styling**: Tailwind CSS v4 + Framer Motion for high-fidelity animations.
- **Backend**: [Convex](https://www.convex.dev/) (V8 Edge runtime, Mutations, Queries, and Actions).
- **Database**: Convex Document Store (schematized JSON-like storage).
- **AI Integration**: Google GenAI SDK (Gemini models) via Convex Actions.
- **Infrastructure**: Google Cloud Run (Containerized Next.js).

## 🛡️ Administrative Governance

The platform enforces a strict three-tier tenancy and security model:

1.  **SUPER_ADMIN**: Full platform access. Can manage all companies, users, and global AI settings.
2.  **ADMIN**: Scoped to a specific `companyId`. Manages users and rules within their organizational boundary.
3.  **USER**: Standard access. Restricted from administrative routes (`/admin`).

> [!CAUTION]
> **Zero-Trust Backend**: Every Convex mutation/query must verify the user's role and tenancy context. Cross-company data leakage is prevented via explicit filters in the backend logic.

## 📊 The Audit Ledger

Every configuration change in the system (Users, Companies, Agents, Rules) is immutable and recorded.
- **Table**: `auditLogs`
- **Requirement**: Any administrative action must `await ctx.db.insert("auditLogs", ...)` upon success.

## 🤖 Orchestration Layer

Sonae's intelligence is split into two main components:

- **Agents**: Defined behavioral entities with specific system prompts, tools, and model configurations.
- **Workflows**: Visual orchestration (React Flow) that chains multi-agent interactions via linear or conditional nodes.

### RAG Pipeline (Knowledge Engine)

Knowledge is ingested, embedded using Gemini embeddings, and stored in a vector index.
- **Isolation**: Knowledge chunks are tagged with `companyId` or `agentId` to ensure data privacy between tenants.
- **Storage**: Files are persisted in Convex Storage, and processed asynchronously in Node.js Actions.

---

> [!NOTE]
> For detailed design principles (Glassmorphism, Fluid Layouts), refer to the **[Frontend Development](./frontend.md)** guide.
