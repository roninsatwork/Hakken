# Sonae Workflows: Visual Orchestration Guide

Welcome to the Sonae Workflow Orchestrator. Workflows allow you to build deeply complex automation pipelines, routing data between AI Agents, databases, custom code, and external APIs without writing a single line of backend infrastructure code.

Sonae's workflow uses a visual **Node Graph** to execute tasks asynchronously.

---

## 1. Core Concepts

A Workflow is constructed by connecting **Nodes** together using wires (edges). Every workflow operates sequentially based on how you connect them:

1. **Trigger Node:** Every workflow must start mathematically from a Trigger.
2. **Logic/Action Nodes:** These manipulate the data or take action (e.g., asking an AI Agent).
3. **Execution Edge:** Data flows left to right. When one node finishes, it passes its `output` to the next connected node.

---

## 2. Navigating the Canvas

When you open a Workflow in the Sonae Admin Dashboard, you will see the **Canvas**:

*   **Left Sidebar (The Palette):** Contains all the available Nodes (Triggers, Agents, Logic, Outputs). You drag and drop these onto the Canvas.
*   **The Grid:** Where you connect nodes together.
*   **Right Config Drawer:** Double-clicking any Node on the Canvas opens its configuration properties.

> **Important:** Workflows run sequentially. Sonae's engine will mathematically prevent you from creating "loops" (connecting a downstream node back to an upstream node) to prevent infinite loops and runaway billing.

---

## 3. Configuring Nodes (Dual-Mode UX)

When you double-click a node to configure what it actually *does*, you are presented with our Dual-Mode Interface:

### 🪄 Standard Mode (The Magic Wand)
This mode is designed for speed and simplicity. You simply type what you want the node to do in plain English.

**Example scenario:** You have a Trigger Node named "Receive Email". You drag an AI Agent onto the screen and connect them. 
1. Open the AI Agent Config.
2. In the AI prompt box, type: *"Take the body of the email we just received and summarize it into 3 bullet points."*
3. Click **✨ Auto-Configure Mapping**.

Sonae will automatically scan your graph, identify the Email trigger, and write the mathematical routing code for you in the background!

### ⚡️ Developer Mode
If you click over to Developer Mode, you can see the raw JSON data. Technical users can manually adjust the JSON bindings.
Sonae uses a bracket syntax to pass data between nodes.
*   Format: `{{nodes.[upstream-node-id].output.[field-name]}}`
*   Example: `{ "content": "Analyze this text: {{nodes.trigger-123.output.body}}" }`

---

## 4. Node Types Dictionary

### Triggers (The Spark)
*   **Webhook Trigger:** Generates a secure POST endpoint URL for external systems (like Stripe or Shopify) to ping.
*   **Manual Trigger:** Allows you (the Admin) to push a button to run the flow instantly.

### Logic (The Brain)
*   **Code Transform:** Reshapes data using `{{node.output.field}}` placeholders. This substitutes variables into a string or JSON structure — it does **not** run Javascript, and there is no script sandbox. To transform data with real logic, use an AI Agent or an API Action.
*   **Condition (If/Else):** Splits the workflow path depending on if a variable passes a rule (e.g. `If confidence_score > 80`).
*   **Web Request:** Makes a REST API (`GET`, `POST`) call to an external service like Slack.

### Agents (The Intelligence)
*   **AI Agent:** Mounts one of your autonomous LLM Agents mid-flow to analyze data. An agent with the knowledge-search tool bound to it can query your knowledge base as part of its run — there is no separate RAG node.

### Control & UI (The Breaks)
*   **Requires Approval:** Freezes the entire workflow dead in its tracks. A human administrator must log in and click "Approve" before the next node executes. Perfect for large financial transactions.
*   **Delay/Timer:** Halts execution for a specified duration (e.g., "Wait 2 Hours").

---

## 5. Walkthrough: Building an Email Summarizer

**Goal:** Receive a Webhook from an email client, analyze it with AI, and save it to the database.

1.  **Drag a Webhook Trigger** to the canvas.
2.  **Drag an AI Agent** to the canvas. Wire the Trigger to the Agent.
3.  **Drag a Database Module** to the canvas. Wire the Agent to the Database.
4.  Double-click the **AI Agent**, type in the Standard mode: *"Read the data from the webhook and output a priority level based on customer anger."* Click Auto-Configure.
5.  Double-click the **Database Module**, type in Standard mode: *"Save the AI anger analysis into my CRM table."* Click Auto-Configure.
6.  Click **Save & Deploy Workflow** in the top right.

You have now built a hyper-intelligent, serverless analytics pipeline!
