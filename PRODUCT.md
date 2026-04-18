# Sonae: Product & Feature Specification

## 1. Platform Vision & Overview

Sonae is an enterprise-grade, multi-tenant AI orchestration and intelligence platform natively integrated with Google Cloud Vertex AI and Gemini architectures. It is designed to allow organizational administrators to deploy, configure, and monitor autonomous AI agents that possess deep contextual knowledge of the business, enforcing strict behavioral rules and interacting with both internal teams and external customers via secure web widgets.

The core value proposition of Sonae is blending extreme scalability (Convex edge-streaming, React Server Components) with militarized data isolation, allowing multiple distinct businesses (Tenants) to operate intelligence workflows on a single deployment without any possibility of cross-contamination.

---

## 2. Multi-Tenant Architecture & Governance

The platform's hierarchy ensures data and administrative capabilities are strictly mapped to operational boundries.

*   **Super Administrators (The Platform Owner):** Hold global oversight. Super Admins can onboard new client Workspaces, enforce global system prompts for the AI, view macro analytics, and impersonate any tenant to troubleshoot configurations.
*   **Workspace Tenants (Companies):** Distinct organizational clusters. Administrators within a Workspace are natively sandboxed; they can only view logs, configure agents, or upload knowledge base data specifically belonging to their `companyId`.
*   **End Users:** Standard permissions. Can interact with deployed internal agents, manage their own profiles, but cannot access administrative dashboards, billing telemetry, or agent configurations.

---

## 3. The Core Intelligence Orchestrator

Sonae does not rely on a single, massive prompt. It operates a dynamic assembly pipeline to ensure the AI behaves exclusively according to enterprise requirements.

*   **Dynamic Model Resolution:** Admins can effortlessly toggle which Vertex LLM model powers the platform globally (e.g., routing from a fast, cheap model to a highly cognitive model like `gemini-1.5-pro-preview`) without requiring code deployments.
*   **The Behavioral Rule Engine:** Workspaces can configure explicit "Rules" (e.g., `"IF USER ASKS ABOUT PRICING -> NEVER REVEAL THE COST, DIRECT TO SALES"`). During message processing, these active rules are dynamically aggregated and forcefully injected into the AI's system instruction, violently overriding its baseline training.
*   **Turing-Complete Workflow Orchestrator:** Allows the creation of expansive, visually structured Directed Acyclic Graphs (DAG) where internal AI agents natively interconnect with programmatic logic. The built-in runtime natively executes Javascript V8 Sandboxes, HTTP API boundaries, database mutations, and human-in-the-loop checkpoints asynchronously, allowing you to sequence thousands of dynamic computational loops without exhausting server limits.
*   **Generative Flow Configuration:** An integrated AI copilot completely removes the low-code barrier for executives. Rather than writing manual JSON array logic to link complex graph connections together, users simply instruct the nodes in plain English. Sonae algorithmically scrapes the visual acyclic structure and commands Vertex AI to securely compile and inject the computational state map automatically.

---

## 4. The Proprietary Knowledge Base (RAG)

Sonae features a fully integrated Retrieval-Augmented Generation (RAG) pipeline, ensuring the AI can answer granular questions based on private company PDFs, documents, or logs.

*   **Data Isolation Matrix:** Uploaded documents are parsed into 768-dimensional Vector Embeddings. Sonae algorithmically segregates "Global Baseline" knowledge (which all tenants can ask the AI about) from "Tenant Isolated" knowledge (which is only accessible if the user belongs to that exact Workspace).
*   **Ephemeral Thread RAG:** For large-scale data ingestion, Sonae provisions temporary, thread-scoped Vector pipelines. Files (up to 50MB) are ingested and vectorized strictly for the duration of a single conversation, physically shielding private conversational intelligence from broader generic agent access.
*   **Live Context Injection:** The AI autonomously queries the RAG database against every user message, extracts the top 50 highly relevant internal data points, and uses it to construct a tailored response, heavily limiting hallucination.

---

## 5. Quantitative AI Reporting & Structuring

Sonae's intelligence goes beyond text-based chat strings. It features a profound JSON-oracle mapping system for quantitative business optics.

*   **Advanced Visual Reports:** The AI is instructed to bypass conversational Markdown and generate multidimensional JSON telemetry natively reflecting `pipelineHealth`, `riskRadar`, `closingWindows`, and performance KPIs.
*   **Rasterization:** The React dashboard seamlessly intercepts this JSON to paint beautiful, interactive data charts and graphs for the end-user rather than forcing them to read a wall of text.

---

## 6. Financial Telemetry & AI Billing

Sonae calculates computing resources natively on the edge to support robust tenant billing or tracking models, structured strictly around a SaaS B2B subscription foundation.

*   **Subscription Usage & Limits:** The platform operates a dynamic, B2B "Subscription Plan" system. Workspaces are assigned explicit tiers (e.g., Enterprise, Unlimited) that dictate their core computing quotas (message limits).
*   **Value-Focused Dashboard Analytics:** Rather than exposing internal API fractional costs, the dashboard highlights structural automation value. Administrators can securely view Action interaction volumes (Internal AI Ops vs. External Widget interactions) alongside their proprietary "Knowledge Assets" utilization in real-time.
*   **Token & Operations Telemetry:** `inputTokens` and `outputTokens` are aggregated transparently to prove system load and efficiency without translating it into raw backend AWS/Google compute costs for the client.
*   **Telemetric Exporting:** Critical Sonae analytics (Traffic Pipelines, Interaction Feeds, Plan Usage) are structurally decoupled for corporate reporting. Authorized administrators can dynamically extract vector-perfect `.png` snapshots of live charts directly from the dashboard, natively syncing with the active Light/Dark OS theme.

---

## 7. Edge Interfaces (Public Widgets)

Sonae allows workspaces to extend their configured AI out from the internal dashboards into consumer-facing websites.

*   **The Widget Pipeline:** Clients can generate a highly customizable HTML tracking script (`widgetId`) to embed Sonae chatbots onto external websites natively inheriting brand colors and logos.
*   **Zero-Trust Security Framework:** Anonymous chat requests are inherently untrusted. They are structurally decoupled from Admin platform tokens and rely strictly on CORS `allowedDomains` cross-origin domain whitelisting to block scraping operations. Furthermore, the Vertex node is capped at 10,000-character payload limits to prevent Denial of Wallet exhaustion attacks on consumer fronts.

---

## 8. Internationalization (i18n)

*   **Locale Parity:** Built for the European enterprise market, the entire platform UI natively ships with dual-language support (English and Italian out-of-the-box). Dynamic structural tests automatically guarantee full translation parity before cloud deployments are authorized.
