# Roadmap & Technical Debt

This document serves as a guide for future architectural decisions and highlights known trade-offs or remaining tasks.

## 🛠️ Known Technical Debt & Trade-offs

- **Concurrent Runtimes**: The divide between Convex V8 (Edge) and Node.js (Actions) creates a slight latency gap during Swarm execution. While necessary for SDK compatibility, optimizations in state polling are ongoing.
- **Deprecated Schema Fields**:
    - `systemSettings.fontFamily` is deprecated in favor of `headingFontFamily` and `bodyFontFamily`. Avoid using it in new components.
- **Manual RAG Indexing**: Currently, knowledge indexing is triggered via background actions. A more robust "Watcher" pattern for real-time document syncing is planned.

## 🚀 Future Roadmap

### 1. Advanced Swarm Intelligence
- Implementing "Long-term Memory" for agents using partitioned vector search across threads.
- Multi-agent collaboration protocols for complex multi-step workflows.

### 2. Enhanced UI/UX
- Implementation of "Glass-Pulse" interactive feedback for long-running AI actions.
- Full support for interactive React Flow node manipulation for non-admin users.

### 3. Enterprise Features
- Saml/SSO integration module.
- Fine-grained RBAC (Role-Based Access Control) for custom tool groups.

---

> [!NOTE]
> If you encounter undocumented patterns or "magic" behavior, please consult with the lead architect or update this file to assist future developers.
