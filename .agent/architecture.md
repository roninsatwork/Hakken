# Project Architecture

> **Version 1.0** - Tailored Agent & Skill Configuration for Next.js + Convex

---

## 📋 Overview

This project uses a specialized AI agent system to maintain high coding standards and architectural consistency:
- **2 Specialist Agents** - Role-based AI personas (Frontend & Backend)
- **5 Active Skills** - Domain-specific knowledge modules
- **Global Rules** - Standards for the Gemini model

---

## 🏗️ Directory Structure

```
.agent/
├── architecture.md          # This file
├── mission.md               # Project goals and source of truth
├── agents/                  # Specialist Agents (Frontend, Backend)
├── skills/                  # Domain-specific Skills
└── rules/                   # Model-specific Rules (Gemini)
```

---

## 🤖 Agents (2)

| Agent | Focus | Skills Used |
|-------|-------|-------------|
| `frontend-specialist` | Next.js App Router, Tailwind, UI/UX | nextjs-rules, tailwind, i18n-localization |
| `backend-specialist` | Convex Backend, Data Modeling, Security | convex-rules, clean-code |

---

## 🧠 Skills (5)

### Core Stack
| Skill | Description |
|-------|-------------|
| `nextjs-rules` | App Router principles, Server Components priority, Routing |
| `convex-rules` | Real-time backend, Schema design, Query/Mutation/Action patterns |
| `tailwind` | Tailwind CSS v4 utility patterns, geometry, and visual depth |

### Quality & Localization
| Skill | Description |
|-------|-------------|
| `clean-code` | Pragmatic coding standards (SRP, DRY, KISS, Naming) |
| `i18n-localization` | Internationalization and translation management using next-intl |

---

## 🎯 Protocol

1. **Server-First**: Frontend development prioritizes React Server Components (RSC). Use `use client` only when strictly necessary.
2. **Schema-First**: Backend development starts with Convex schema definitions and index planning.
3. **Type-Safety**: End-to-end TypeScript from Convex backend to the Next.js frontend components.
4. **Constraint-Aware**: Every design or architectural decision starts with a Phase 1 Analysis (Timeline, Tech, Audience).

---

## 📊 Statistics

| Metric | Value |
|--------|-------|
| **Total Agents** | 2 |
| **Total Skills** | 5 |
| **Active Rules** | 1 (Gemini) |
| **Core Tech** | Next.js 16, React 19, Tailwind 4, Convex |
