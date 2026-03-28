# Next.js + Convex Template

A high-performance Next.js starter template integrated with Convex for a real-time, type-safe backend.

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
Once you run `convex dev`, it will automatically create or update your `.env.local` file with the necessary credentials. If you are setting this up manually or for production, ensure you have:

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

This project follows strict engineering standards managed by an **Agentic System** located in the `.agent/` directory.

### Core Principles
- **Server-First (RSC)**: We prioritize React Server Components. `'use client'` is used exclusively for interactivity and browser APIs.
- **Real-time Backend**: Powered by Convex for reactive data fetching and transactional mutations.
- **Type-Safety**: End-to-end TypeScript from the database schema to the UI components.
- **i18n**: Localization handled via `next-intl`.

### Specialist Agents
The project is maintained by two primary agent personas:
- **Frontend Specialist**: Focuses on performance, accessibility, and modern UI/UX using Tailwind CSS v4.
- **Backend Specialist**: Focuses on Convex schema integrity, indexing, and security.

Refer to [.agent/architecture.md](.agent/architecture.md) for more technical details.

---

## 📂 Project Structure

- `src/app/`: Next.js App Router (Pages, Layouts).
- `src/ui/`: Atomic design components (Atoms, Components).
- `src/context/`: Client-side providers (Convex, UI State).
- `convex/`: Backend schema, queries, mutations, and actions.
- `messages/`: Translation files for `next-intl`.
- `.agent/`: Standards, skills, and persona definitions for AI pair programming.

---

## 📜 Scripts

- `npm run dev`: Starts the Next.js development server.
- `npm run build`: Builds the production application.
- `npm run lint`: Runs ESLint for code quality checks.
- `npm run convex:dev`: Starts the Convex development environment.
