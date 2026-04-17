# Sonae Platform Architecture

> [!IMPORTANT]
> **AI AGENT MANDATE:** This file is the structural ground-truth of the Sonae ecosystem. Read this document at the start of every session to establish the core operating parameters, tech stack boundaries, and aesthetic constraints. Do not deviate from these established patterns.

---

## 1. Core Technology Stack

- **Frontend Layer:** Next.js 16.2+ (App Router), React 19.2+.
- **Styling Pipeline:** Tailwind CSS v4 + Framer Motion.
- **Backend & Data:** Convex (Real-time reactivity, isolated Actions/Mutations, background Scheduler).
- **Authentication:** Convex Auth (Resend Magic Links + Google OAuth).

---

## 2. Strict Aesthetics & UI Design System

Do not deviate from these formatting rules. A premium, modern feel is paramount to the platform.

### A. Fluid Layouts & Spacing
- **Always Fluid:** The main content workspace MUST NOT have a maximum width limitation (`max-w-7xl`, `max-w-4xl`, etc. are strictly banned). Content must flex smoothly across all screen sizes spanning 100% horizontally.
- **Wrapping Constraints:** All new admin pages must wrap inner content in `<div className="flex flex-col gap-6">` natively following `<Header />`. Do not force arbitrary `mt-*` strings. Let the Header organically determine the top edge distance.

### B. Glassmorphism & High-Density UI
- **Layering:** Prioritize translucent backgrounds (`bg-sidebar/40`, `bg-foreground/5`). Avoid flat opaque fills.
- **Lighting Dynamics:** Apply subtle inner radials (`bg-radial-at-tl`) and drop shadows (`shadow-2xl`) to invoke tactical depth.

### C. The Sonae Modal Protocol
- **NEVER** utilize system browser dialogs (`window.confirm`, `window.alert`, `window.prompt`).
- Use custom Framer Motion-driven "Sonae Modals" wrapped in `backdrop-blur-3xl`.
- Avoid hard visual divider lines; modals should exist as unified "glass objects."
- Use `font-light` and tracking (`tracking-[0.12em]`) for header typography.

---

## 3. Administrative Governance & Tenancy Matrix

### Security & Tenancy Rules
- Sonae operates on a **Global System** vs **Company Tenant** boundary.
- **SUPER_ADMIN:** Supreme platform oversight. Can impersonate tenants, modify core architecture, create global AI overrides, view all telemetry, and manipulate deployment boundaries. Access is exclusively restricted to master controllers.
- **ADMIN:** Bound to a `companyId`. Can only view users, rules, and configurations linked inherently to their company boundary.
- **USER:** Cannot access the `/admin` subsystem under any circumstances.

### Full-Spectrum Audit Ledger
- **Traceability:** Every single configuration mutation (Users, Companies, Rules, Agents, Prompts, Configs) is hooked into the immutable `auditLogs` Convex table via backend insertion queries.
- **Rule of Thumb:** Any new administrative backend capabilities must `await ctx.db.insert("auditLogs", {...})` immediately proceeding the successful execution of its logic.

---

## 4. Orchestration: Agents & Workflows

Sonae operates dual intelligence drivers.

### A. Agents (The Thinkers)
Agents define behavioral context, tools, and processing capabilities.
- **Global Agents:** Function ubiquitously across the platform.
- **Inline Agents:** Scoped exclusively as executors inside of Workflows (cannot be accessed outside their explicit workflow bounds).
- **Model Resolution Configuration:** Agents query the `aiModels` system config. If their specified LLM is inactive or invalid, it gracefully shifts to the active default, and eventually hard-fails to the explicit system default fallback (`gemini-3.1-pro-preview`).

### B. Workflows (The Routes)
The Visual Node-Flow Builder interfaces multi-agent orchestration dynamically.
- **Trigger Types:** Webhook payloads, Manual invocation, and Scheduled chron integrations.
- Nodes process linearly on a visual canvas canvas, handing context and JSON envelopes sequentially between attached Inline Agents.

### C. The Autonomous Swarm Engine
The Swarm is a real-time, LangChain-style orchestrator capable of chaining dynamic agent interactions autonomously.
- **Edge vs. Node Isolation:** Swarm orchestration strictly splits execution between runtimes. Real-time UI progress polling and logic queries (e.g., `getSwarmLogs`) run exclusively on the **Convex V8 Edge** to ensure millisecond reactivity and native Auth compatibility. The heavy LLM execution macro runs in **Node.js Actions** (`swarmActions.ts`) to support the heavy Google GenAI/Vertex SDK signature requirements.
- **Multi-Tenant Context Autonomy:** The orchestrator never relies on hardcoded domain knowledge. It intercepts the user's active `threadId`, extracts their `companyName`, `description`, and `systemPrompt` from the tenant database natively, and injects it into the root Swarm Memory Payload.
- **Strict RAG Security:** When the Swarm triggers the Internal Architect Agent, Vector Searches against the knowledge base are intensely restricted by injecting an explicit `.filter(q => q.eq("companyId", currentCompanyId))`. Cross-tenant data bleed within the Swarm is technically impossible.

---

## 5. The Knowledge Engine (RAG Pipeline)

The platform ingests multimodal documents and processes them into conversational memory chunks using high-fidelity Vector Embeddings.

- **Storage Pipeline:** User Auth -> Convex Storage `fileId` -> Backend ID Generation -> Background Heavy Action Execution -> Context chunks embedded via LLM -> Persisted into `knowledgeChunks` index.
- **Data Isolation Matrix:** Documents (and their child chunks) are strictly bound to one of four hierarchical contexts:
  1. **Global Base:** Defined by `companyId: undefined`. This context is accessible to all users platform-wide.
  2. **Company Tenant:** Linked to an explicit `companyId`. This knowledge is completely invisible and isolated from users outside that tenant.
  3. **Agent Local:** Explicitly linked to a functional `agentId`. This guarantees execution tool autonomy for that particular sandbox.
  4. **Ephemeral Thread:** Explicitly linked to a functional `threadId`. Designed for real-time background ingestion with a strict 50MB ceiling, physically walling off private user uploads from cross-thread hallucination risks.

---

## 6. Deployment Boundaries & Infrastructure

> [!CAUTION]
> Under no circumstances attempt to deploy this project via Vercel or utilize Vercel Edge infrastructure patterns.  

- **Host Env:** Deploys natively to **Google Cloud Run**.
- **Branching Protocol:** All active development/tickets are strictly executed on the `dev` branch as a safe workspace. The `main` branch is explicitly reserved for production. Merging `dev` into `main` is what triggers the automated rollout.
- **CI/CD Pipeline Sequence:** Governed strictly via **GitHub Actions** (`.github/workflows/deploy.yml`).
  1. **Testing Firewall:** The `test` job boots `vitest` to verify component integrity.
  2. **Deployment Block:** The `deploy` job is gated by `needs: test`. If any test fails, deployment halts immediately to protect production.
  3. **Convex Synchrony:** Executes `npx convex deploy` to push the database schema concurrently with the Github Actions flow.
  4. **Container Build:** Compiles the Next.js app via Docker and pushes directly to Cloud Run.

> [!IMPORTANT]
> **GitHub Secrets Matrix:** The automated deployment requires `CONVEX_DEPLOY_KEY` configured within the GitHub Account's "Actions Secrets" interface. Failure to supply this will result in a hard pipeline crash during the Convex synchrony step.

> [!WARNING]
> **Local Server Collision (Pre-Flight Hazard):** Executing `npm run build` or `npm install` actively deletes the `.next` development cache and reorganizes `node_modules`. If the Next.js local development server (`npm run dev`) is concurrently running, these commands will instantly hard-crash the active server, resulting in a persistent `ERR_CONNECTION_REFUSED` on localhost until the Next.js process is manually restarted. Always shut down `npm run dev` before running the Pre-Flight Sweep locally.

---

## 7. Automated Testing & Security Baselines

Sonae utilizes a strict dual-environment testing workspace to prove component integrity and backend security without polluting databases.

### A. Frontend UI Testing (Vitest + JSDOM)
- Located in `src/**/*.test.tsx` and run via the `ui` Vitest workspace.
- Components are rendered in a simulated headless browser structure.
- **Protocol:** The `convex/react` data layer (`useQuery`, `useMutation`) is globally mocked via `vitest.setup.ts` to instantly return default states. UI tests must *never* execute actual network requests to the database backend.

### B. Backend Security Testing (convex-test & OWASP Verification)
- Located in `convex/**/*.test.ts` and run inside a non-browser workspace.
- Boots an invisible, in-memory replica of the Convex environment natively.
- **Protocol (OWASP Broken Access Control):** Mutations and queries must be actively tested against unauthorized access by programmatically mapping fake identities (e.g., standard `USER`, foreign `ADMIN`) and asserting explicit `Error("Unauthorized")` or `Error("Unauthenticated")` rejections.
- **Coverage Map:** Critical infrastructure including Tenancy (users, invites, companies), Platform Settings (system config, AI model billing toggles), and Proprietary Data (workflows, agents, chat telemetry) operate under zero-trust constraints. This must be structurally proven within their respective test suites before deployment is permitted.

### C. CI/CD Exclusivity
- Automated tests are strictly sequestered to the development phase or CI/CD pipelines (GitHub Actions). No test runner logic or "Health Checks" mimicking test loops should ever be deployed via the production dashboard UI.

---

## 8. Data Pipelines & UI Integrity Mechanics

To secure downstream rendering performance and guard against edge cases, Sonae implements strict pipeline constraints across data querying and structural translation files.

### A. Strict Edge-Pagination (15-Row Constraints)
- **The Mega Array Threat:** Administrative feeds (e.g. `getAllUsers`) must NEVER aggregate entire database pools into UI memory via standard `.collect()` or `useQuery` commands.
- **Protocol:** All dynamic tables and data feeds must utilize Edge-constrained `.paginate()` hooks native to Convex. Front-end components invoke `usePaginatedQuery` tightly coupled with a `15-row` mapping threshold and an interactive "Load More" interface node.
- **Server-Side Searching:** Rather than iterating huge JS arrays locally, searches must be piped straight to the backend via `.withSearchIndex()` parameters to map directly against Convex vectors instantly.

### B. Internationalization (i18n) Parity Locking
- Sonae's structural localization framework runs dynamically off `/messages/en.json` and `/messages/it.json`.
- **Structural Integrity:** These JSON trees must perfectly map one another. Dropping keys or creating unmapped variables breaks the Next-Intl parser silently. 
- **The Parity Test:** Component integrity is proven mechanically via the `i18n.test.ts` loop to violently fail builds if keys ever orphan.

### C. Ring 3 LLM Defenses & Denial-of-Wallet
- Under no circumstances will Google GenAI/Vertex execution nodes (`generateSonaeResponse`) ingest unbounded text streams from the client.
- **Payload Truncation:** To defend against autonomous Resource Exhaustion ("Denial of Wallet") attacks, `ai.ts` actions strictly hard-cap structural lengths natively at `10,000` chars before transmission to paid APIs.
- **XSS Neutralization:** All AI-rendered markdown in the client must parse linearly utilizing `react-markdown` strictly stripping and rejecting `script` or foreign `html` hooks generated via prompt-injections natively.

### D. Chart Exporting & Tailwind v4 Constraints
- Components leveraging the `ChartExportWrapper` physically rasterize DOM nodes to PNGs using `html2canvas`.
- **The oklab Crash:** Tailwind CSS v4 auto-compiles all custom CSS variable opacity shorthands (e.g., `bg-card/20`, `text-muted/60`, `shadow-inner`) into `color-mix(in oklab, ...)` dynamically. `html2canvas` strictly fails to parse `oklab`, crashing the export workflow instantly.
- **The Mitigation Mandate:** Any components residing inside an exported border must exclusively use standard opacity styles (`opacity-60`) or explicit Hex strings with native alpha channels (`bg-[#ffffff05]`) for translucency to securely bypass the `oklab` renderer limitation.

---

## 9. Edge Interfaces & Telemetry Systems

Sonae operates several unauthenticated and automated tracking interfaces that require specific structural considerations when modifying data pipelines.

### A. Analytics & Financial Telemetry
- **Granular Cost Resolution:** Every single interaction hitting the `generateSonaeResponse` proxy natively pipes a detailed logging footprint to `agentTransactions`.
- **Scope:** Variables including `inputTokens`, `outputTokens`, `modelUsed`, and `costGBP` are mathematically calculated on the fly and aggregated into the Admin Dashboards. This allows Sonae to strictly bill and track AI usage separated intrinsically by `companyId` (Tenant) or `widgetId` (Anonymous Traffic).

### B. Encrypted Widget Architecture
- **Boundary Defenses:** Sonae extends AI functionality to external consumer websites via public Chat Widgets. Public ingestion points operate completely unauthenticated but are strictly hardened via `allowedDomains` cross-origin enforcement matrices.
- **Thread Sandboxing:** Anonymous requests hitting a generic `widgetId` spawn isolated conversational threads structurally decoupled from standard platform authorization tokens (`tokenIdentifier`), restricting prompt-injections from leaping into administrative logic.

### C. The AI Reporting Engine (Generation & Rasterization)
- **Structured Outputs:** Sonae goes beyond generic markdown generation by instructing Vertex AI to map insights directly to the `salesReports` schema. 
- **JSON Telemetry:** Reports orchestrate multi-tiered components natively (e.g., `pipelineHealth`, `riskRadar`, `closingWindows`) rather than vomiting flat text. This enforces strict UI mapping capability, allowing React to chart and rasterize complex analytical visualizations safely and beautifully.
