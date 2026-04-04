# Sonae Platform Architecture

> [!IMPORTANT]
> **AI AGENT MANDATE:** This file is the structural ground-truth of the Sonae ecosystem. Read this document at the start of every session to establish the core operating parameters, tech stack boundaries, and aesthetic constraints. Do not deviate from these established patterns.

---

## 1. Core Technology Stack

- **Frontend Layer:** Next.js 15 (App Router), React 19.
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

---

## 5. The Knowledge Engine (RAG Pipeline)

The platform ingests multimodal documents and processes them into conversational memory chunks using high-fidelity Vector Embeddings.

- **Storage Pipeline:** User Auth -> Convex Storage `fileId` -> Backend ID Generation -> Background Heavy Action Execution -> Context chunks embedded via LLM -> Persisted into `knowledgeChunks` index.
- **Data Isolation Matrix:** Documents (and their child chunks) are strictly bound to one of three hierarchical contexts:
  1. **Global Base:** Defined by `companyId: undefined`. This context is accessible to all users platform-wide.
  2. **Company Tenant:** Linked to an explicit `companyId`. This knowledge is completely invisible and isolated from users outside that tenant.
  3. **Agent Local:** Explicitly linked to a functional `agentId`. This guarantees execution tool autonomy for that particular sandbox.

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
