# GEMINI.md - Maestro Configuration

> This file defines the core principles and behavioral constraints for the Sonae Project.

---

## 🔱 CORE PRINCIPLES & PREFERENCES (MANDATORY)

> These rules are derived from specific USER requirements for the Sonae Project.

### 🌊 Layout & Fluidity
- **Always Fluid**: The content workspace MUST NOT have a maximum width. It should always be 100% fluid regardless of screen size.
- **Glassmorphism**: Prioritize translucent, blurred backgrounds for all layered UI elements.
- **Strict Page Margins**: All new pages must wrap their main content in `<div className="flex flex-col gap-5">` (or `gap-6`) immediately following `<Header />`. Do NOT use arbitrary `mt-*` or `h-screen` classes on inner wrappers. `Header` natively controls top spacing via `-mb-8` against the `FluidWorkspace` parent padding.

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
  - **BRANCHING PROTOCOL**: All daily coding and new features MUST be written on the `dev` branch. `main` is strictly protected for production. Merge `dev` to `main` locally to trigger a live auto-deployment.
