# Sonae

A Next.js and Convex application for real-time AI orchestration, administration, chat, workflows, and tenant-scoped knowledge.

## 📚 Internal Documentation

A comprehensive guide for developers is available in the **[/docs](./docs/index.md)** folder. It covers:

- **[Getting Started](./docs/getting-started.md)**: Local setup and environment.
- **[System Architecture](./docs/architecture.md)**: Tech stack and system design.
- **[Frontend Development](./docs/frontend.md)**: Design system and Sonae Modal Protocol.
- **[Backend & Data Layer](./docs/backend.md)**: Convex and AI orchestration.
- **[Deployment](./docs/deployment.md)**: CI/CD and hosting.
- **[Agentic Starter Framework Overview](./docs/agentic-starter-framework-overview.md)**: Start-here guide for building governed agentic apps on this foundation.
- **[New Agentic App Setup Checklist](./docs/new-agentic-app-setup-checklist.md)**: Tenant/customer setup checklist for model defaults, knowledge, tools, draft agents, evals, and activation.
- **[Agent Handoff](./AGENTS.md)**: branch rules, quality gates, and future-agent guardrails.

---

## 🚀 Getting Started

### 1. Prerequisites
Ensure you have [Node.js](https://nodejs.org/) installed.

### 2. Install Dependencies
```bash
npm install
```

### 3. Setup Convex Backend
You'll need a Convex account. The first time you run this, it will prompt you to log in and create a project.

```bash
npm run convex:dev
```
*This command starts the Convex development server, generates type definitions in `convex/_generated/`, and keeps your schema in sync.*

### 4. Environment Variables
Once you run `npm run convex:dev`, it will automatically create or update your `.env.local` file with the necessary credentials. If you are setting this up manually or for production, ensure you have:

```bash
NEXT_PUBLIC_CONVEX_URL=https://your-deployment-name.convex.cloud
```

### 5. Run Next.js Development Server
In a separate terminal, run:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

---

## 🏗️ Architecture & Standards

This project follows strict engineering standards documented in [AGENTS.md](./AGENTS.md) and the docs folder.

### Core Principles
- **Server-First (RSC)**: We prioritize React Server Components. `'use client'` is used exclusively for interactivity and browser APIs.
- **Real-time Backend**: Powered by Convex for reactive data fetching and transactional mutations.
- **Type-Safety**: End-to-end TypeScript from the database schema to the UI components.
- **i18n**: Localization handled via `next-intl`.

Future coding agents should read [AGENTS.md](./AGENTS.md) first. `GEMINI.md` is retained only as a legacy pointer.

---

## 📂 Project Structure

- `src/app/`: Next.js App Router (Pages, Layouts).
- `src/ui/`: Atomic design components (Atoms, Components).
- `src/context/`: Client-side providers (Convex, UI State).
- `convex/`: Backend schema, queries, mutations, and actions.
- `messages/`: Translation files for `next-intl`.
- `docs/`: Developer documentation and cleanup plans.

---

## 📜 Scripts

- `npm run dev`: Starts the Next.js development server.
- `npm run convex:dev`: Starts the Convex development environment.
- `npm run check`: Runs lint, typecheck, and the Vitest suite.
- `npm run lint:all`: Runs the full lint suite, including warning visibility.
- `npm run build`: Builds the production application.
- `npm run lint`: Runs ESLint for code quality checks.
- `npm run typecheck`: Runs TypeScript without emitting files.
- `npm run test:run`: Runs the Vitest suite once.
- `npm run demo:local:seed`: Seeds a local demo tenant, demo users, model defaults, knowledge tool, draft agent, starter knowledge, and eval fixtures when `LOCAL_DEMO_SEED_ENABLED=1` and `LOCAL_DEMO_SEED_SECRET` are configured for Convex.
