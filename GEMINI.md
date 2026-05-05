# GEMINI.md - Maestro Configuration

> This file defines the core principles and behavioral constraints for the Sonae Project.

---

## 🔱 CORE PRINCIPLES & PREFERENCES (MANDATORY)

> These rules are derived from specific USER requirements for the Sonae Project.

### 🌊 Layout & Fluidity
- **Always Fluid**: The content workspace MUST NOT have a maximum width. It should always be 100% fluid regardless of screen size.
- **Glassmorphism**: Prioritize translucent, blurred backgrounds for all layered UI elements.
- **Strict Page Margins**: ALL new frontend pages MUST render the standard `<Header />` component at the absolute top of their content flow. Do not forget to import it. immediately following the `<Header />`, you must wrap the main content in `<div className="flex flex-col gap-5">` (or `gap-6`). Do NOT use arbitrary `mt-*` or `h-screen` classes on inner wrappers. `Header` natively controls top spacing via `-mb-8` against the `FluidWorkspace` parent padding.

### 🛡️ UI & Feedback
- **Modal Policy**: NEVER use system/native modals (alert/confirm/prompt).
- **Sonae Modals Only**: All dialogs must be custom-built "Sonae Modals" using Framer Motion for premium animations and consistent visual styling (dark mode, glass textures, brand accents).
  - **Elegant Atmosphere**: No hard internal divider lines or headers. The entire modal must be a unified "glass object".
  - **Dynamic Lighting**: Use subtle top-left inner glow (radial gradients) and a deep shadow-pulse for tactical depth.
  - **Fidelity**: `backdrop-blur-3xl`, `bg-sidebar/40`, and a soft `32px` corner radius.
  - **Typography**: Titles must use `font-light` with wider `tracking-[0.12em]` for an editorial feel.
  
### 🗣️ Terminology & Localization
- **Friendly SaaS Language**: Avoid overly technical or "sci-fi" jargon in the UI. Use clear, accessible, standard SaaS terminology to keep the administrative environments approachable.
- **Strict Locale Parity**: Always maintain full parity between English (`en.json`) and Italian (`it.json`) dictionaries. Any new UI label, tooltip, or description must be localized simultaneously.
- **AI Page Footers**: Ensure AI workspaces or chatbot interfaces always display a standardized footer containing liability/verification disclaimers (e.g., instructing users to double-check AI generations).

### 📊 Tables & Data Feeds
- **Standardized Pagination**: All administrative table views, log lists, and dashboard feeds MUST enforce a strict **15-row limit** per page for ecosystem consistency.
- **Server-Side Priorities**: For large datasets, always prioritize robust backend indexing and server-side filtering logic rather than purely client-side implementations.

### 🔌 Agents & Scrapers
- **Rate Limit Defenses**: Any external platform intelligence integrations (Vertex AI, Twitter, Facebook) MUST implement robust queueing and progressive exponential backoff to safely handle API throttling or `429` errors.
- **Dispatch Staggering**: Space out concurrent Convex scheduled jobs or autonomous agent invocations to avoid burst traffic ceilings and ensure reliable ingestion flow.
- **Vector Bulk limits**: NEVER loop through and delete or load multiple heavy vector chunks (`knowledgeChunks`) inside a single linear mutation context. The massive 768-dimensional float arrays will rapidly breach Convex's strict 16MB function transaction limit. Always cleanly delegate bulk chunk operations to a staggered `ctx.scheduler` scheduled mutation queue to execute iteratively.
- **Dynamic AI Models**: NEVER hardcode model literal strings (e.g., `gemini-3.1-pro-preview`) into backend server actions when orchestrating Agents or processing Generations. ALWAYS extract and resolve the assigned LLM dynamically from the user's configuration in the database (e.g., `agent.modelId`). This ensures any Model adjustments made via the Admin Dashboard seamlessly flow into the workflow.

### 🔒 Security & Authorization (Zero-Trust)
- **Strict Tenant Isolation (BOLA Prevention)**: ALL backend database queries (especially `collect()`, `filter()`, and aggregation loops) MUST enforce `companyId` validation. Never rely solely on UI filtering. If a user is not a `SUPER_ADMIN`, you must implicitly scope their read/write boundaries to `user.companyId === entity.companyId`.
- **Privilege Escalation Traps**: Any mutation that creates, modifies, or deletes user accounts MUST include mathematical traps against privilege escalation. A standard `ADMIN` must NEVER be able to assign the `"SUPER_ADMIN"` role, nor should they be allowed to modify or delete an existing `SUPER_ADMIN` profile, even if they share the same `companyId`.
- **Global Actions**: System-wide configuration mutations or Google Cloud infrastructure actions (like Vertex Model syncing or Global Agent management) MUST be protected by a strict `if (user?.role !== "SUPER_ADMIN") throw new Error("Unauthorized");` check at the very top of the function.

---

## 🛑 SOCRATIC GATE (TIER 0)
- **MANDATORY**: Before starting any feature, ask at least 2 strategic questions about trade-offs or edge cases.

## 📱 Project Type Routing
- **WEB**: Next.js 16, React 19, Tailwind 4.
- **BACKEND**: Convex.
- **INFRASTRUCTURE & DEPLOYMENT**: 
  - **MANDATORY**: NEVER use or mention the word "Vercel". Sonae is NOT hosted on Vercel.
  - Sonae deploys to **Google Cloud Run** via **GitHub Actions** (`.github/workflows/deploy.yml`).
  - Convex deploys natively alongside the Github Actions pipeline.
  - **BRANCHING PROTOCOL**: All daily coding and new features MUST be written on the `dev` branch. `main` is strictly protected for production deployments only. Over time, AI agents naturally forget their branch context. 
    - **CRITICAL VERIFICATION**: Before mapping out architecture, modifying files, or creating new features, YOU MUST explicitly use a terminal tool to run `git branch --show-current` and strictly verify you are on `dev`. If you are on `main`, stop and checkout `dev` immediately.
    - **MERGE & BOUNCE**: When completing a task and deploying via `git merge dev` onto `main`, you MUST follow it immediately with `git checkout dev`. Never linger on `main` to build new features.
  - **PRE-FLIGHT SWEEP (CRITICAL)**: Because Google Cloud CI operates with strict production TypeScript bounds, you MUST intercept compiler errors locally before pushing to `main` by executing: `source ~/.zshrc && npm run build`. Ensure a `100%` clean output to prevent consecutive broken pipeline loops.

## 🚀 Local Development
- **Starting the App**: The local shell environment requires the RC file to be sourced before running Node commands in a non-interactive shell. To start the local application, you must use persistent terminals and explicit source commands:
  - Frontend: `source ~/.zshrc && npm run dev`
  - Backend: `source ~/.zshrc && npm run convex:dev`
- **MANDATORY - SERVER CRASH PREVENTION**: **NEVER** autonomously execute `npm run build` or `npm install` if the Next.js local development server (`npm run dev` on port 3000) is actively running. 
  - *Why?* Running a build clears the `.next` cache directory, and `npm install` aggressively manipulates `node_modules` while the running server is actively pointing to them in memory. This instantly kills the user's localhost connection with an `ERR_CONNECTION_REFUSED` hard crash.
  - *Action:* If you need to install standard module updates or run the pre-flight sweep (`npm run build`), you MUST first formally verify that `npm run dev` is shut down, or explicitly warn the user that they must restart their server afterwards.
