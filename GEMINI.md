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
