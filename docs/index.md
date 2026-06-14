# Sonae Documentation

Welcome to the Sonae Platform developer documentation. This guide is designed to help you understand the system architecture, design principles, and deployment workflows for the platform.

## 📚 Table of Contents

1.  **[Getting Started](./getting-started.md)**  
    Local environment setup, requirements, and development commands.
2.  **[System Architecture](./architecture.md)**  
    High-level design, tech stack overview, and security/tenancy model.
3.  **[Frontend Development](./frontend.md)**  
    Glassmorphism design system, Fluid Workspace layout, and the Sonae Modal Protocol.
4.  **[Backend & Data Layer](./backend.md)**  
    Convex schema, Mutations/Actions, Swarm Engine, and the Audit Ledger.
5.  **[Infrastructure & Deployment](./deployment.md)**  
    CI/CD pipeline with GitHub Actions, Google Cloud Run, and branching protocols.
6.  **[Roadmap & Technical Debt](./roadmap-and-debt.md)**  
    Known trade-offs and future implementation highlights.
7.  **[Future Agent Maintenance Plan](./future-agent-maintenance-plan.md)**
    Handoff rules and code-quality cleanup priorities for future agents.
8.  **[Auth And Login Hardening Plan](./auth-login-hardening-plan.md)**
    Locked phased plan for invite-only auth diagnostics, login UX, repair tooling, callback URL checks, and magic-link regression coverage.
9.  **[Platform Grade Refactor And Test Upgrade Plan](./code-quality-95-plan.md)**
    Deeper refactor roadmap for turning Sonae into a reusable product core with stronger contracts, naming, tests, and extension points.
10. **[Product Extension Guide](./product-extension-guide.md)**
    Extension points for adding admin sections, workflow nodes, AI tools, model providers, branding, navigation, and tenant settings.
11. **[Large Page Decomposition Plan](./large-page-decomposition-plan.md)**
    Follow-on plan for reducing page-level complexity in large non-movement product/admin pages.
12. **[Comprehensive Test Coverage Plan](./comprehensive-test-coverage-plan.md)**
    Phased plan for measurable frontend, backend, and browser coverage, including CI gates and authenticated e2e coverage.
13. **[Current Cleanup Checklist](./current-cleanup-checklist.md)**
    Completed 6-phase refactor checklist and verification record.
14. **[Housework Upgrade Checklist](./housework-upgrade-checklist.md)**
    Completed low-risk repo hygiene, handoff docs, package scripts, and CI/deploy sanity plan.
15. **[Analytics Scale Optimization Plan](./analytics-scale-optimization-plan.md)**
    Locked phased plan for scaling analytics, AI running costs, admin dashboards, and company dashboards without losing tenant isolation.
16. **[Platform Scale Hardening Plan](./platform-scale-hardening-plan.md)**
    Belt-and-braces plan for bounded admin inventory, knowledge, chat logs, workflows, inventory rollups, and legacy/debug cleanup.
17. **[Post Scale Hardening Plan](./post-scale-hardening-plan.md)**
    Follow-up plan for production smoke checks, inventory rollup backfill, workflow database-node contracts, scheduler optimization, and dependency cleanup.
18. **[Model Provider Agnostic Platform Plan](./model-provider-agnostic-plan.md)**
    Sitewide plan for Gemini, OpenAI, Anthropic, provider adapters, model defaults, runtime selection, telemetry, and analytics dashboards.
19. **[Final Scale Readiness Plan](./final-scale-readiness-plan.md)**
    Morning-ready checklist for clearing the remaining lint warnings, adding the System Settings maintenance scripts UI, production smoke, low-risk scale confidence review, and locking the repo before the next major refactor.
20. **[Movement Demo Refactor Plan](./movement-demo-refactor-plan.md)**
    Scoped plan for safely reopening the movement demo, stabilizing capture/playback/scoring, tightening data contracts, and making the demo maintainable.
21. **[Movement Demo Manual Smoke Checklist](./movement-demo-manual-smoke-checklist.md)**
    Repeatable signed-in browser checklist for camera, MediaPipe model loading, capture, save, detail playback, and match-play smoke before demos or pushes.
22. **[Movement Demo Whole-Body Tracking Accuracy Plan](./movement-demo-whole-body-tracking-plan.md)**
    Phased plan for calibration, debug overlays, head accuracy, arm/hand chains, lower-body constraints, avatar profiles, and whole-body tracking regression checks.
23. **[Movement Demo Client Pitch Excellence Plan](./movement-demo-client-pitch-excellence-plan.md)**
    Sales-critical plan for rewriting the avatar body-motion layer, tuning a primary pitch avatar, adding demo-safe fallbacks, and rehearsing a client-ready movement script.
24. **[Movement Demo Pitch Runbook](./movement-demo-pitch-runbook.md)**
    Presenter-facing runbook for positioning, setup, safe movements, fallback wording, and readiness checks before the premium posture client demo.
25. **[Movement Demo Live Rehearsal Notes Template](./movement-demo-live-rehearsal-notes-template.md)**
    Fill-in template for recording camera setup, debug overlay labels, movement issues, and live-vs-preview demo decisions.
26. **[Movement Demo Presenter Card](./movement-demo-presenter-card.md)**
    Short pre-call card for opening the guided preview, using premium posture language, and falling back cleanly.
27. **[AI Runtime Retry Hardening Plan](./ai-runtime-retry-hardening-plan.md)**
    Audited plan for making AI provider calls pause, retry, and continue safely after throttling, transient provider errors, and SDK/network failures.
28. **[Agent Scheduler Upgrade Plan](./agent-scheduler-upgrade-plan.md)**
    Plan for upgrading the admin schedule builder with recurring cadence, targeted times, timezone previews, structured configs, and agent dispatch support.
29. **[System Health Alerts Expansion Plan](./system-health-alerts-plan.md)**
    Plan for adding agent failures, schedule failures, stale runs, and overdue schedules to the daily platform alert path.
30. **[Local Real Auth E2E Plan](./local-real-auth-e2e-plan.md)**
    Plan for adding a local-only real Convex Auth browser testing lane alongside the existing mocked Playwright suite.
31. **[Ask Sonae Safety Hardening Plan](./ask-sonae-safety-hardening-plan.md)**
    Locked phased plan for jailbreak, prompt-injection, RAG, tool execution, and admin prompt guardrails across the Ask Sonae assistant.
32. **[Company Workspace AI Navigation Consolidation Plan](./company-workspace-ai-navigation-plan.md)**
    Planning document for moving company Knowledge, Prompt, AI Rules, AI Models, and Chat Logs under a single AI workspace tab with a third-level submenu.
33. **[True Agentic Platform Plan](./true-agentic-platform-plan.md)**
    Locked phased plan for turning configurable agents and AI workflows into a durable, tool-executing, approval-aware agentic automation platform.
34. **[Agent Learning And Improvement Plan](./agent-learning-improvement-plan.md)**
    Follow-on plan for making agents improve over time through governed memory, run feedback, replayed failures, evaluation fixtures, and approved behavior updates.
35. **[Movement Demo Retargeting Approach](./movement-demo-retargeting-approach.md)**
    Required direction for future movement-demo body-motion work: source skeleton proof, neutral calibration, vector retargeting, foot locking, and what not to patch.

---

> [!TIP]
> This documentation is intended for developers. For end-user guides, please refer to the internal help center.
