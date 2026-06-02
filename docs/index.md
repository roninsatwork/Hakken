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

---

> [!TIP]
> This documentation is intended for developers. For end-user guides, please refer to the internal help center.
