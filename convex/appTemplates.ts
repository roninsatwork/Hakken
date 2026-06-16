import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSuperAdmin } from "./authz";
import type { Id } from "./_generated/dataModel";
import { SYSTEM_FAILSAFE_MODEL_ID } from "./aiModelService";
import { buildGlobalAgentRecord } from "./agentService";
import { getAgentTemplateById, type AgentTemplateId } from "./agentTemplates";
import { seedFixturesForTemplate } from "./agentEvalFixtures";
import { buildCompanyRecord } from "./companyService";
import { incrementGlobalInventoryTotals } from "./utils/inventoryRollupService";

type TemplateCategory =
  | "Customer Support"
  | "Sales"
  | "Operations"
  | "Compliance"
  | "Finance"
  | "Product"
  | "Industry"
  | "Platform";

export type AppTemplate = {
  id: string;
  category: TemplateCategory;
  name: string;
  tagline: string;
  description: string;
  riskProfile: "LOW" | "MEDIUM" | "HIGH";
  primaryUsers: string[];
  recommendedConnectorKeys: string[];
  agents: string[];
  knowledgeScopes: string[];
  workflows: string[];
  evalFixtures: string[];
  dashboardCards: string[];
  publishTargets: string[];
  readinessChecks: string[];
  developerFollowUps: string[];
  extensionPoints: string[];
  implementationPointers: ImplementationPointer[];
};

type ImplementationPointer = {
  label: string;
  filePath: string;
  notes: string;
};

type BaseAppTemplate = Omit<AppTemplate, "developerFollowUps" | "extensionPoints" | "implementationPointers">;

const APP_TEMPLATES: BaseAppTemplate[] = [
  {
    id: "support-desk-ai",
    category: "Customer Support",
    name: "Support Desk AI",
    tagline: "Triage tickets, draft replies, and escalate risky cases.",
    description: "A governed support starter for teams that need fast ticket summaries, knowledge-backed answers, and human approval before sensitive customer actions.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Support leads", "Support agents", "Customer success"],
    recommendedConnectorKeys: ["zendesk", "gmail", "slack", "sonae-knowledge"],
    agents: ["Support Triage Agent", "Reply Drafting Agent", "Escalation Classifier"],
    knowledgeScopes: ["Help center", "Refund policy", "Escalation SOP", "Product known issues"],
    workflows: ["New ticket triage", "High-risk escalation", "Daily support digest"],
    evalFixtures: ["Refund promise blocked", "Prompt injection in ticket body", "Correct priority classification"],
    dashboardCards: ["Open high-risk cases", "Drafts awaiting approval", "Top issue themes"],
    publishTargets: ["Internal app", "Webhook trigger", "Support widget"],
    readinessChecks: ["Knowledge uploaded", "Zendesk or email connector installed", "Approval policy enabled", "Support release gate passed"],
  },
  {
    id: "customer-success-qbr",
    category: "Customer Support",
    name: "Customer Success QBR Assistant",
    tagline: "Prepare renewal-ready account briefs from scattered context.",
    description: "Summarizes account health, support history, risks, wins, product feedback, and next-step recommendations before customer reviews.",
    riskProfile: "MEDIUM",
    primaryUsers: ["CSMs", "Account managers", "Leadership"],
    recommendedConnectorKeys: ["hubspot", "salesforce", "notion", "gmail", "sonae-knowledge"],
    agents: ["Account Briefing Agent", "Risk Signal Analyst"],
    knowledgeScopes: ["Account notes", "Success playbooks", "Product usage summaries", "Support history"],
    workflows: ["Weekly QBR prep", "Renewal risk alert", "Post-meeting follow-up draft"],
    evalFixtures: ["Missing data caveat", "No fabricated metrics", "Risk summary with evidence"],
    dashboardCards: ["Upcoming QBRs", "Accounts with risk", "Follow-ups drafted"],
    publishTargets: ["Internal app", "Scheduled digest"],
    readinessChecks: ["CRM connector chosen", "Success playbook uploaded", "Meeting follow-up approval policy set"],
  },
  {
    id: "sales-research-copilot",
    category: "Sales",
    name: "Sales Research Copilot",
    tagline: "Turn account research into safe prospect briefs and outreach angles.",
    description: "Researches target accounts, prepares concise briefs, identifies likely pains, and creates approval-gated outreach drafts.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Sales reps", "BDRs", "Sales leadership"],
    recommendedConnectorKeys: ["hubspot", "salesforce", "gmail", "google-drive", "sonae-knowledge"],
    agents: ["Prospect Research Agent", "Qualification Agent", "Outreach Draft Agent"],
    knowledgeScopes: ["ICP", "Case studies", "Pricing rules", "Competitor notes"],
    workflows: ["Inbound lead qualification", "Target account brief", "Outbound draft review"],
    evalFixtures: ["Separates facts from assumptions", "Outbound requires approval", "No invented contact claims"],
    dashboardCards: ["Qualified leads", "Briefs created", "Outreach awaiting review"],
    publishTargets: ["Internal app", "Webhook trigger"],
    readinessChecks: ["ICP uploaded", "CRM connector selected", "Outbound approval enabled", "Sales eval suite passed"],
  },
  {
    id: "proposal-rfp-assistant",
    category: "Sales",
    name: "Proposal And RFP Assistant",
    tagline: "Answer RFP questions from approved evidence.",
    description: "Drafts compliant RFP answers, flags missing proof, maps answers to source documents, and keeps unsupported claims out of proposals.",
    riskProfile: "HIGH",
    primaryUsers: ["Sales engineers", "Proposal teams", "Legal reviewers"],
    recommendedConnectorKeys: ["google-drive", "notion", "github", "sonae-knowledge"],
    agents: ["RFP Answer Agent", "Evidence Gap Reviewer"],
    knowledgeScopes: ["Security docs", "Product docs", "Case studies", "Legal boilerplate"],
    workflows: ["RFP response draft", "Evidence gap review", "Final approval pack"],
    evalFixtures: ["Unsupported claim flagged", "Security answer cites evidence", "Legal language requires review"],
    dashboardCards: ["Questions answered", "Evidence gaps", "Approvals pending"],
    publishTargets: ["Internal app"],
    readinessChecks: ["Evidence library uploaded", "Legal approval rule configured", "Release gate requires model grading"],
  },
  {
    id: "internal-knowledge-portal",
    category: "Operations",
    name: "Internal Knowledge Portal",
    tagline: "Give teams a safe answer layer over company knowledge.",
    description: "Answers employee questions from approved tenant knowledge and routes low-confidence answers to owners for review.",
    riskProfile: "LOW",
    primaryUsers: ["Employees", "Operations", "HR", "IT"],
    recommendedConnectorKeys: ["sonae-knowledge", "notion", "google-drive", "slack"],
    agents: ["Knowledge Assistant", "Low Confidence Router"],
    knowledgeScopes: ["Policies", "SOPs", "FAQs", "Internal docs"],
    workflows: ["Unanswered question review", "Weekly knowledge gap digest"],
    evalFixtures: ["Cites approved knowledge", "Refuses missing policy answer", "Ignores document prompt injection"],
    dashboardCards: ["Top questions", "Knowledge gaps", "Low-confidence answers"],
    publishTargets: ["Internal app", "Website widget"],
    readinessChecks: ["Core docs uploaded", "Knowledge retrieval test passed", "Low confidence routing owner selected"],
  },
  {
    id: "meeting-briefing-assistant",
    category: "Operations",
    name: "Meeting Briefing Assistant",
    tagline: "Prepare agendas, context, and follow-up drafts.",
    description: "Combines calendar context, CRM notes, internal docs, and prior emails into meeting briefs and post-meeting follow-up drafts.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Executives", "CSMs", "Sales", "Operations"],
    recommendedConnectorKeys: ["google-calendar", "gmail", "microsoft-outlook", "hubspot", "sonae-knowledge"],
    agents: ["Meeting Brief Agent", "Follow-up Draft Agent"],
    knowledgeScopes: ["Account notes", "Meeting templates", "Follow-up guidelines"],
    workflows: ["Morning meeting brief", "Post-meeting follow-up draft"],
    evalFixtures: ["Missing context caveat", "Follow-up draft requires approval", "No fabricated attendees"],
    dashboardCards: ["Briefs generated", "Follow-ups pending", "Missing context alerts"],
    publishTargets: ["Internal app", "Scheduled digest"],
    readinessChecks: ["Calendar or mail connector selected", "Follow-up approval enabled", "Brief template reviewed"],
  },
  {
    id: "compliance-review-assistant",
    category: "Compliance",
    name: "Compliance Review Assistant",
    tagline: "Check documents and actions against approved policy.",
    description: "Reviews proposed responses, documents, and actions against compliance policies, producing evidence-backed review notes for human sign-off.",
    riskProfile: "HIGH",
    primaryUsers: ["Compliance teams", "Legal", "Operations leaders"],
    recommendedConnectorKeys: ["sonae-knowledge", "google-drive", "notion", "jira"],
    agents: ["Compliance Reviewer", "Policy Evidence Agent"],
    knowledgeScopes: ["Policies", "Regulatory guidance", "Approval matrix", "Audit controls"],
    workflows: ["Policy review request", "High-risk exception escalation", "Audit evidence pack"],
    evalFixtures: ["Regulated advice avoided", "Policy source cited", "Exception requires approval"],
    dashboardCards: ["Reviews pending", "High-risk exceptions", "Evidence gaps"],
    publishTargets: ["Internal app", "Webhook trigger"],
    readinessChecks: ["Policy knowledge uploaded", "High-risk approval policy enabled", "Compliance release gate passed"],
  },
  {
    id: "invoice-billing-analyst",
    category: "Finance",
    name: "Invoice And Billing Analyst",
    tagline: "Answer billing questions without exposing risky financial actions.",
    description: "Reviews invoice questions, payment status context, subscription notes, and billing policy to prepare safe customer or internal responses.",
    riskProfile: "HIGH",
    primaryUsers: ["Finance", "Support", "Customer success"],
    recommendedConnectorKeys: ["stripe", "hubspot", "gmail", "sonae-knowledge"],
    agents: ["Billing Question Analyst", "Invoice Response Draft Agent"],
    knowledgeScopes: ["Billing policy", "Refund policy", "Plan rules", "Invoice templates"],
    workflows: ["Billing question triage", "Refund exception escalation", "Overdue invoice digest"],
    evalFixtures: ["No unauthorized refund promise", "Sensitive data redacted", "Payment status caveat"],
    dashboardCards: ["Billing drafts", "Refund approvals", "Overdue account questions"],
    publishTargets: ["Internal app", "Webhook trigger"],
    readinessChecks: ["Billing policy uploaded", "Stripe connector selected", "Refund approval policy enabled"],
  },
  {
    id: "product-feedback-triage",
    category: "Product",
    name: "Product Feedback Triage Agent",
    tagline: "Turn feedback noise into product signals.",
    description: "Clusters feature requests, bugs, support themes, sales notes, and roadmap context into product opportunities and triage recommendations.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Product managers", "Support leads", "Engineering"],
    recommendedConnectorKeys: ["zendesk", "linear", "jira", "github", "slack"],
    agents: ["Feedback Clustering Agent", "Bug Triage Agent"],
    knowledgeScopes: ["Roadmap", "Known issues", "Product principles", "Customer segments"],
    workflows: ["Weekly feedback digest", "Bug escalation", "Roadmap evidence pack"],
    evalFixtures: ["Feature request grouped correctly", "Bug vs request separated", "No roadmap promise"],
    dashboardCards: ["Top themes", "Escalated bugs", "Roadmap evidence"],
    publishTargets: ["Internal app", "Scheduled digest"],
    readinessChecks: ["Issue tracker connector selected", "Roadmap knowledge uploaded", "No-promise rule active"],
  },
  {
    id: "release-notes-assistant",
    category: "Product",
    name: "Release Notes Assistant",
    tagline: "Draft release notes from product and engineering evidence.",
    description: "Turns commits, issues, pull requests, and product notes into internal and customer-facing release summaries with review controls.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Product marketing", "Engineering", "Customer success"],
    recommendedConnectorKeys: ["github", "linear", "jira", "notion"],
    agents: ["Release Summary Agent", "Customer Copy Reviewer"],
    knowledgeScopes: ["Release style guide", "Product positioning", "Known limitations"],
    workflows: ["Weekly release note draft", "Customer impact review"],
    evalFixtures: ["No unreleased feature claim", "Internal vs external tone separated", "Known limitation preserved"],
    dashboardCards: ["Draft releases", "Customer-impacting changes", "Review blockers"],
    publishTargets: ["Internal app", "Scheduled digest"],
    readinessChecks: ["Repository connector selected", "Style guide uploaded", "External copy approval enabled"],
  },
  {
    id: "property-lead-research",
    category: "Industry",
    name: "Property Or Lead Research Bot",
    tagline: "Research properties, owners, agents, and lead quality signals.",
    description: "A vertical starter for property and lead intelligence that prepares research briefs, surfaces gaps, and routes promising opportunities.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Property teams", "Sales teams", "Analysts"],
    recommendedConnectorKeys: ["http-rest", "google-drive", "airtable", "sonae-knowledge"],
    agents: ["Property Research Agent", "Lead Quality Analyst"],
    knowledgeScopes: ["Research criteria", "Area notes", "Compliance rules", "Lead scoring policy"],
    workflows: ["New lead research", "Daily opportunity digest", "Missing data review"],
    evalFixtures: ["No unsupported ownership claim", "Lead score explains evidence", "Missing data flagged"],
    dashboardCards: ["New opportunities", "High-fit leads", "Research gaps"],
    publishTargets: ["Internal app", "Webhook trigger"],
    readinessChecks: ["Lead criteria uploaded", "Data source selected", "Compliance review rule active"],
  },
  {
    id: "api-support-agent",
    category: "Platform",
    name: "API Support Agent",
    tagline: "Help developers integrate without hallucinating API behavior.",
    description: "Answers developer questions from approved API docs, searches known issues, drafts reproducible support responses, and flags doc gaps.",
    riskProfile: "MEDIUM",
    primaryUsers: ["Developer support", "Solutions engineers", "Platform teams"],
    recommendedConnectorKeys: ["github", "notion", "zendesk", "sonae-knowledge"],
    agents: ["API Docs Agent", "Integration Troubleshooter"],
    knowledgeScopes: ["API docs", "SDK examples", "Known issues", "Integration guides"],
    workflows: ["Integration support triage", "Doc gap digest", "Known issue escalation"],
    evalFixtures: ["Uses documented endpoint only", "Asks for missing repro details", "No secret exposure"],
    dashboardCards: ["Doc gaps", "Integration issues", "Escalations"],
    publishTargets: ["Internal app", "Developer widget", "Webhook trigger"],
    readinessChecks: ["API docs uploaded", "Known issue source connected", "Secret-handling rule active"],
  },
];

const DEFAULT_EXTENSION_POINTS = [
  "Register product-specific tool handlers in convex/aiToolExecutionService.ts.",
  "Add tenant/domain schema fields in convex/schema.ts only when the product needs durable custom data.",
  "Build product-specific screens under src/app/(dashboard) instead of overloading generic admin pages.",
  "Add eval fixtures for the customer's real policies, edge cases, and failure modes.",
];

const DEFAULT_IMPLEMENTATION_POINTERS: ImplementationPointer[] = [
  {
    label: "Domain data model",
    filePath: "convex/schema.ts",
    notes: "Add product-specific tenant fields only when the starter needs durable structured data.",
  },
  {
    label: "Tool execution",
    filePath: "convex/aiToolExecutionService.ts",
    notes: "Register read-only handlers first, then add approval-gated write handlers after review.",
  },
  {
    label: "Product surfaces",
    filePath: "src/app/(dashboard)",
    notes: "Build customer-specific screens outside the generic admin flow.",
  },
  {
    label: "Evaluation fixtures",
    filePath: "convex/agentEvalFixtures.ts",
    notes: "Add product policy, failure-mode, and safety fixtures before activation.",
  },
];

const TEMPLATE_DEVELOPER_FOLLOW_UPS: Record<string, string[]> = {
  "support-desk-ai": [
    "Map ticket fields, priority rules, and escalation policy to the selected support system.",
    "Implement write-safe ticket update handlers only after approval paths are reviewed.",
    "Add customer-specific macros, refund policy examples, and support SLAs to knowledge.",
  ],
  "customer-success-qbr": [
    "Connect account health, usage, renewal, and support data into a single tenant-scoped account model.",
    "Define QBR output sections and evidence requirements with the CS team.",
    "Add workflow steps for human review before any customer-facing summary is sent.",
  ],
  "sales-research-copilot": [
    "Implement approved enrichment sources and separate factual evidence from inferred sales hypotheses.",
    "Map CRM fields, lead stages, ownership, and outbound approval policy.",
    "Create product-specific objection, ICP, and pricing knowledge before outreach drafts are enabled.",
  ],
  "proposal-rfp-assistant": [
    "Model the customer's evidence library, security questionnaire format, and legal review states.",
    "Add citation and unsupported-claim checks to the RFP eval suite.",
    "Keep export/publish actions manual until legal approval workflow is complete.",
  ],
  "internal-knowledge-portal": [
    "Define source-of-truth ownership for each knowledge area.",
    "Add low-confidence routing and knowledge-gap review flows for the customer's operating model.",
    "Build the employee-facing answer surface only after retrieval tests pass.",
  ],
  "meeting-briefing-assistant": [
    "Map calendar, CRM, and mail permissions around the customer's privacy policy.",
    "Define which meeting types can generate briefs and which require human confirmation.",
    "Build follow-up draft surfaces separately from generic admin views.",
  ],
  "compliance-review-assistant": [
    "Encode regulated policy boundaries and escalation rules with compliance owners.",
    "Add evidence retention, audit export, and exception review states before production use.",
    "Require model-graded evals for high-risk policy scenarios.",
  ],
  "invoice-billing-analyst": [
    "Map billing objects, invoice states, refund permissions, and redaction requirements.",
    "Implement read-only finance handlers before considering approval-gated write actions.",
    "Add customer-specific billing policy examples and sensitive-data eval cases.",
  ],
  "product-feedback-triage": [
    "Define taxonomy, severity, customer segment, and roadmap evidence fields.",
    "Wire issue tracker updates as approval-gated actions.",
    "Create product-specific evals for no-promise and bug/request classification behavior.",
  ],
  "release-notes-assistant": [
    "Map repository, issue tracker, and product status fields to internal/external release note sections.",
    "Add a human approval step before customer-facing release copy is published.",
    "Define known-limitations and unreleased-feature rules for the product.",
  ],
  "property-lead-research": [
    "Implement approved property, lead, and ownership data sources for the target market.",
    "Create domain-specific scoring rules, evidence requirements, and compliance checks.",
    "Build the analyst review UI around the customer's real pipeline stages.",
  ],
  "api-support-agent": [
    "Connect source-of-truth API docs, SDK examples, changelog, and known issue data.",
    "Add secret-handling and unsupported-endpoint evals before exposing a developer widget.",
    "Implement product-specific diagnostic tools as read-only handlers first.",
  ],
};

const TEMPLATE_EXTENSION_POINTS: Record<string, string[]> = {
  "support-desk-ai": ["Ticket domain model", "Support tool handlers", "Agent/customer-facing support UI"],
  "customer-success-qbr": ["Account health model", "QBR report renderer", "CRM/usage adapters"],
  "sales-research-copilot": ["Lead/account model", "Enrichment handlers", "Outbound review UI"],
  "proposal-rfp-assistant": ["Evidence library model", "RFP export renderer", "Legal review workflow"],
  "internal-knowledge-portal": ["Employee answer UI", "Knowledge ownership model", "Gap review workflow"],
  "meeting-briefing-assistant": ["Calendar/mail adapters", "Brief renderer", "Follow-up approval UI"],
  "compliance-review-assistant": ["Policy/control model", "Audit evidence export", "Exception review workflow"],
  "invoice-billing-analyst": ["Billing object model", "Finance read handlers", "Sensitive-data redaction checks"],
  "product-feedback-triage": ["Feedback taxonomy model", "Issue tracker handlers", "Product dashboard cards"],
  "release-notes-assistant": ["Release note renderer", "Repo/issue adapters", "External-copy approval flow"],
  "property-lead-research": ["Property/lead model", "Research data handlers", "Pipeline review UI"],
  "api-support-agent": ["API docs index", "Diagnostic tool handlers", "Developer support widget"],
};

const TEMPLATE_IMPLEMENTATION_POINTERS: Record<string, ImplementationPointer[]> = {
  "support-desk-ai": [
    {
      label: "Support data model",
      filePath: "convex/schema.ts",
      notes: "Model ticket priority, requester context, escalation state, and approval outcomes if the support system does not remain the source of truth.",
    },
    {
      label: "Ticket handlers",
      filePath: "convex/aiToolExecutionService.ts",
      notes: "Start with read-only ticket lookup and only add write handlers after approval policy is wired.",
    },
    {
      label: "Support workbench",
      filePath: "src/app/(dashboard)/admin",
      notes: "Create the customer-specific triage, draft-review, and escalation screens here.",
    },
  ],
  "customer-success-qbr": [
    {
      label: "Account health model",
      filePath: "convex/schema.ts",
      notes: "Add tenant-scoped health, renewal, usage, and risk evidence tables if CRM data is not enough.",
    },
    {
      label: "QBR renderer",
      filePath: "src/app/(dashboard)",
      notes: "Build the product-specific account brief and evidence review surface.",
    },
  ],
  "sales-research-copilot": [
    {
      label: "Lead enrichment handlers",
      filePath: "convex/aiToolExecutionService.ts",
      notes: "Keep enrichment read-only and separate sourced facts from inferred hypotheses.",
    },
    {
      label: "Outbound review UI",
      filePath: "src/app/(dashboard)",
      notes: "Build approval queues for outreach copy before sending anything externally.",
    },
  ],
  "proposal-rfp-assistant": [
    {
      label: "Evidence library",
      filePath: "convex/schema.ts",
      notes: "Model source documents, answer provenance, legal review state, and unsupported claims.",
    },
    {
      label: "RFP export",
      filePath: "src/app/(dashboard)",
      notes: "Build export and reviewer workflows around the customer's document format.",
    },
  ],
  "internal-knowledge-portal": [
    {
      label: "Knowledge ownership",
      filePath: "convex/knowledge.ts",
      notes: "Map owners, review cadence, stale content rules, and low-confidence routing.",
    },
    {
      label: "Employee answer surface",
      filePath: "src/app/(dashboard)",
      notes: "Build the end-user answer UI separately from platform administration.",
    },
  ],
  "meeting-briefing-assistant": [
    {
      label: "Brief generation adapters",
      filePath: "convex/aiToolExecutionService.ts",
      notes: "Connect calendar, mail, CRM, and account context with clear missing-data caveats.",
    },
    {
      label: "Brief review surface",
      filePath: "src/app/(dashboard)",
      notes: "Build agenda, evidence, and follow-up review screens for the target team.",
    },
  ],
  "compliance-review-assistant": [
    {
      label: "Policy controls",
      filePath: "convex/schema.ts",
      notes: "Model policies, controls, exceptions, evidence, and reviewer sign-off states.",
    },
    {
      label: "Compliance evals",
      filePath: "convex/agentEvalFixtures.ts",
      notes: "Add regulated-advice, source-citation, exception, and refusal fixtures.",
    },
  ],
  "invoice-billing-analyst": [
    {
      label: "Billing read handlers",
      filePath: "convex/aiToolExecutionService.ts",
      notes: "Keep payment, invoice, subscription, and refund lookups read-only until finance approvals are in place.",
    },
    {
      label: "Sensitive data checks",
      filePath: "convex/agentEvalFixtures.ts",
      notes: "Add fixtures for redaction, refund promises, account verification, and payment-state caveats.",
    },
  ],
  "product-feedback-triage": [
    {
      label: "Feedback taxonomy",
      filePath: "convex/schema.ts",
      notes: "Model themes, severity, customer segments, linked evidence, and product decision state.",
    },
    {
      label: "Product dashboard",
      filePath: "src/app/(dashboard)",
      notes: "Build triage queues and roadmap evidence cards for product managers.",
    },
  ],
  "release-notes-assistant": [
    {
      label: "Release source adapters",
      filePath: "convex/aiToolExecutionService.ts",
      notes: "Read commits, issues, pull requests, and product status without publishing externally.",
    },
    {
      label: "Release copy review",
      filePath: "src/app/(dashboard)",
      notes: "Build internal vs external copy review and approval screens.",
    },
  ],
  "property-lead-research": [
    {
      label: "Lead research model",
      filePath: "convex/schema.ts",
      notes: "Model property, owner, source evidence, scoring, compliance flags, and pipeline stage.",
    },
    {
      label: "Research data handlers",
      filePath: "convex/aiToolExecutionService.ts",
      notes: "Implement approved data-source lookups with evidence and missing-data handling.",
    },
  ],
  "api-support-agent": [
    {
      label: "API docs index",
      filePath: "convex/knowledge.ts",
      notes: "Separate API docs, SDK examples, changelog, and known issues into traceable knowledge scopes.",
    },
    {
      label: "Diagnostic handlers",
      filePath: "convex/aiToolExecutionService.ts",
      notes: "Implement product-specific diagnostics as read-only tools and block secret exposure.",
    },
  ],
};

function withDeveloperGuidance(template: BaseAppTemplate): AppTemplate {
  return {
    ...template,
    developerFollowUps: TEMPLATE_DEVELOPER_FOLLOW_UPS[template.id] ?? [
      "Map the customer's domain model, permissions, and data sources before production use.",
      "Implement product-specific tool handlers and UI surfaces outside the generic platform core.",
      "Add customer-specific eval fixtures before activating agents or workflows.",
    ],
    extensionPoints: [
      ...(TEMPLATE_EXTENSION_POINTS[template.id] ?? []),
      ...DEFAULT_EXTENSION_POINTS,
    ],
    implementationPointers: [
      ...(TEMPLATE_IMPLEMENTATION_POINTERS[template.id] ?? []),
      ...DEFAULT_IMPLEMENTATION_POINTERS,
    ],
  };
}

export function getAppTemplates() {
  return APP_TEMPLATES.map(withDeveloperGuidance);
}

export function getAppTemplateById(id: string) {
  const template = APP_TEMPLATES.find((entry) => entry.id === id);
  return template ? withDeveloperGuidance(template) : undefined;
}

type CreatedLaunchResources = {
  agentIds: Id<"agents">[];
  workflowIds: Id<"workflows">[];
  fixtureIds: Id<"agentEvalFixtures">[];
  sourceRunIds: Id<"agentRuns">[];
};

type CreatedLaunchResourceDetails = {
  agents: Array<{
    id: Id<"agents">;
    name: string;
    isActive: boolean;
    fixtureCount: number;
  }>;
  workflows: Array<{
    id: Id<"workflows">;
    name: string;
    isActive: boolean;
    triggerType: "MANUAL" | "WEBHOOK" | "SCHEDULE";
  }>;
  evalFixtureCount: number;
  missingResourceCount: number;
};

type LaunchConnectorReadiness = {
  key: string;
  label: string;
  installed: boolean;
  installStatus?: "INSTALLED" | "DISABLED" | "ERROR";
  testStatus?: "UNTESTED" | "SUCCESS" | "FAILURE";
  authMode?: "NONE" | "SECRET_REF" | "OAUTH";
  authConnectionStatus?: "NOT_CONNECTED" | "PENDING" | "CONNECTED" | "ERROR";
  isActive?: boolean;
  tenantScoped: boolean;
  connectorId?: Id<"toolConnectors">;
};

type LaunchPlanReadinessSummary = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_REVIEW";
  plannedAgentCount: number;
  createdAgentCount: number;
  plannedWorkflowCount: number;
  createdWorkflowCount: number;
  connectorReadyCount: number;
  connectorTotalCount: number;
  blockerCount: number;
  blockers: string[];
  nextActions: string[];
};

type DeveloperHandoffSummary = {
  status: "NEEDS_SCAFFOLDING" | "READY_FOR_DEVELOPER_REVIEW";
  followUpCount: number;
  extensionPointCount: number;
  implementationPointerCount: number;
  publishTargetCount: number;
  checklist: string[];
};

type DeveloperTask = {
  category: "Workspace" | "Resources" | "Connectors" | "Knowledge" | "Code" | "Release";
  title: string;
  status: "BLOCKED" | "PENDING" | "READY";
  detail: string;
  actionLabel?: string;
  actionHref?: string;
};

type DeveloperTaskSummary = {
  blockedCount: number;
  pendingCount: number;
  readyCount: number;
  nextTaskTitle?: string;
  nextTaskCategory?: DeveloperTask["category"];
  nextTaskStatus?: DeveloperTask["status"];
};

type LaunchWorkspaceSummary = {
  id: Id<"companies">;
  name: string;
  createdAt: number;
};

const APP_TEMPLATE_AGENT_ARCHETYPE: Record<string, AgentTemplateId> = {
  "support-desk-ai": "support-triage-agent",
  "customer-success-qbr": "sales-research-agent",
  "sales-research-copilot": "sales-research-agent",
  "proposal-rfp-assistant": "document-review-agent",
  "internal-knowledge-portal": "internal-knowledge-assistant",
  "meeting-briefing-assistant": "reporting-analyst-agent",
  "compliance-review-assistant": "document-review-agent",
  "invoice-billing-analyst": "support-triage-agent",
  "product-feedback-triage": "reporting-analyst-agent",
  "release-notes-assistant": "reporting-analyst-agent",
  "property-lead-research": "sales-research-agent",
  "api-support-agent": "internal-knowledge-assistant",
};

function formatConnectorLabel(key: string) {
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function isConnectorReady(connector: LaunchConnectorReadiness) {
  return connector.installed
    && connector.installStatus === "INSTALLED"
    && connector.testStatus === "SUCCESS"
    && connector.isActive !== false
    && (connector.authMode !== "OAUTH" || connector.authConnectionStatus === "CONNECTED");
}

function buildReadinessSummary(args: {
  parsedPlan: unknown;
  createdResourceDetails: CreatedLaunchResourceDetails | null;
  connectorReadiness: LaunchConnectorReadiness[];
}): LaunchPlanReadinessSummary {
  const draftResources = args.parsedPlan && typeof args.parsedPlan === "object" && "draftResources" in args.parsedPlan
    ? (args.parsedPlan as { draftResources?: Record<string, unknown> }).draftResources
    : undefined;
  const plannedAgents = getStringArray(draftResources?.agents);
  const plannedWorkflows = getStringArray(draftResources?.workflows);
  const createdAgentCount = args.createdResourceDetails?.agents.length ?? 0;
  const createdWorkflowCount = args.createdResourceDetails?.workflows.length ?? 0;
  const connectorReadyCount = args.connectorReadiness.filter(isConnectorReady).length;
  const blockers: string[] = [];
  const nextActions: string[] = [];

  if (!args.createdResourceDetails) {
    blockers.push("Draft resources have not been created.");
    nextActions.push("Create draft agents and workflows from this launch plan.");
  } else {
    if (createdAgentCount < plannedAgents.length) {
      blockers.push(`${plannedAgents.length - createdAgentCount} planned agent${plannedAgents.length - createdAgentCount === 1 ? "" : "s"} still missing.`);
    }
    if (createdWorkflowCount < plannedWorkflows.length) {
      blockers.push(`${plannedWorkflows.length - createdWorkflowCount} planned workflow${plannedWorkflows.length - createdWorkflowCount === 1 ? "" : "s"} still missing.`);
    }
    if (args.createdResourceDetails.missingResourceCount > 0) {
      blockers.push(`${args.createdResourceDetails.missingResourceCount} created resource link${args.createdResourceDetails.missingResourceCount === 1 ? "" : "s"} could not be resolved.`);
    }
  }

  const notReadyConnectors = args.connectorReadiness.filter((connector) => !isConnectorReady(connector));
  if (notReadyConnectors.length > 0) {
    blockers.push(`${notReadyConnectors.length} connector${notReadyConnectors.length === 1 ? "" : "s"} need setup or testing.`);
    nextActions.push("Install, connect, or retest recommended connectors in Marketplace.");
  }
  if (args.connectorReadiness.length === 0) {
    nextActions.push("Review connector requirements for this starter.");
  }
  nextActions.push("Upload or map the planned knowledge scopes.");
  nextActions.push("Run smoke evals before activating agents or workflows.");

  const status = blockers.length === 0 && args.createdResourceDetails
    ? "READY_FOR_REVIEW"
    : args.createdResourceDetails || connectorReadyCount > 0
      ? "IN_PROGRESS"
      : "NOT_STARTED";

  return {
    status,
    plannedAgentCount: plannedAgents.length,
    createdAgentCount,
    plannedWorkflowCount: plannedWorkflows.length,
    createdWorkflowCount,
    connectorReadyCount,
    connectorTotalCount: args.connectorReadiness.length,
    blockerCount: blockers.length,
    blockers,
    nextActions: Array.from(new Set(nextActions)).slice(0, 6),
  };
}

function buildDeveloperHandoffSummary(args: {
  parsedPlan: unknown;
  hasWorkspace: boolean;
  hasDraftResources: boolean;
}): DeveloperHandoffSummary {
  const plan = args.parsedPlan && typeof args.parsedPlan === "object"
    ? args.parsedPlan as {
        developerFollowUps?: unknown;
        extensionPoints?: unknown;
        implementationPointers?: unknown;
        draftResources?: Record<string, unknown>;
      }
    : {};
  const developerFollowUps = getStringArray(plan.developerFollowUps);
  const extensionPoints = getStringArray(plan.extensionPoints);
  const implementationPointers = Array.isArray(plan.implementationPointers)
    ? plan.implementationPointers.filter((entry): entry is ImplementationPointer => {
        if (!entry || typeof entry !== "object") return false;
        const pointer = entry as Record<string, unknown>;
        return typeof pointer.label === "string" && typeof pointer.filePath === "string" && typeof pointer.notes === "string";
      })
    : [];
  const publishTargets = getStringArray(plan.draftResources?.publishTargets);
  const checklist: string[] = [];

  if (!args.hasWorkspace) {
    checklist.push("Create or link the tenant workspace for this build plan.");
  }
  if (!args.hasDraftResources) {
    checklist.push("Create draft agents, workflows, and smoke-test fixtures before product-specific coding starts.");
  }
  checklist.push(...developerFollowUps.slice(0, 3));
  if (extensionPoints.length > 0) {
    checklist.push(`Implement extension points: ${extensionPoints.slice(0, 3).join(", ")}.`);
  }
  if (implementationPointers.length > 0) {
    checklist.push(`Start in code: ${implementationPointers.slice(0, 3).map((pointer) => pointer.filePath).join(", ")}.`);
  }
  if (publishTargets.length > 0) {
    checklist.push(`Review target surfaces before shipping: ${publishTargets.join(", ")}.`);
  }

  return {
    status: args.hasWorkspace && args.hasDraftResources ? "READY_FOR_DEVELOPER_REVIEW" : "NEEDS_SCAFFOLDING",
    followUpCount: developerFollowUps.length,
    extensionPointCount: extensionPoints.length,
    implementationPointerCount: implementationPointers.length,
    publishTargetCount: publishTargets.length,
    checklist: Array.from(new Set(checklist)).slice(0, 8),
  };
}

function buildDeveloperTasks(args: {
  parsedPlan: unknown;
  hasWorkspace: boolean;
  hasDraftResources: boolean;
  workspaceId?: Id<"companies">;
  connectorReadiness: LaunchConnectorReadiness[];
  readinessSummary: LaunchPlanReadinessSummary;
}): DeveloperTask[] {
  const plan = args.parsedPlan && typeof args.parsedPlan === "object"
    ? args.parsedPlan as {
        developerFollowUps?: unknown;
        implementationPointers?: unknown;
        draftResources?: Record<string, unknown>;
        readinessChecks?: unknown;
      }
    : {};
  const knowledgeScopes = getStringArray(plan.draftResources?.knowledgeScopes);
  const evalFixtures = getStringArray(plan.draftResources?.evalFixtures);
  const developerFollowUps = getStringArray(plan.developerFollowUps);
  const implementationPointerCount = Array.isArray(plan.implementationPointers) ? plan.implementationPointers.length : 0;
  const notReadyConnectors = args.connectorReadiness.filter((connector) => !isConnectorReady(connector));
  const tasks: DeveloperTask[] = [
    {
      category: "Workspace",
      title: args.hasWorkspace ? "Workspace linked" : "Create or link workspace",
      status: args.hasWorkspace ? "READY" : "PENDING",
      detail: args.hasWorkspace
        ? "This build plan has a tenant workspace for product-specific data and review."
        : "Create a workspace before wiring tenant data, users, or customer-specific surfaces.",
      actionLabel: args.workspaceId ? "Open workspace" : "Create workspace below",
      actionHref: args.workspaceId ? `/admin/companies/${args.workspaceId}` : undefined,
    },
    {
      category: "Resources",
      title: args.hasDraftResources ? "Draft resources created" : "Create draft resources",
      status: args.hasDraftResources ? "READY" : "PENDING",
      detail: args.hasDraftResources
        ? "Inactive draft agents, workflows, and smoke-test fixtures exist for developer review."
        : "Create inactive agents, workflows, and eval fixtures before implementation work is treated as shippable.",
      actionLabel: args.hasDraftResources ? "Review agents" : "Create resources above",
      actionHref: args.hasDraftResources ? "/admin/agents" : undefined,
    },
    {
      category: "Connectors",
      title: notReadyConnectors.length === 0 ? "Recommended connectors ready" : "Set up recommended connectors",
      status: notReadyConnectors.length === 0 ? "READY" : "BLOCKED",
      detail: notReadyConnectors.length === 0
        ? "All recommended connectors are installed, active, tested, and connected where required."
        : `${notReadyConnectors.length} recommended connector${notReadyConnectors.length === 1 ? "" : "s"} still need installation, auth, activation, or testing.`,
      actionLabel: "Open Marketplace",
      actionHref: "/admin/ai/tools",
    },
    {
      category: "Knowledge",
      title: "Map knowledge scopes",
      status: knowledgeScopes.length > 0 ? "PENDING" : "READY",
      detail: knowledgeScopes.length > 0
        ? `Map or upload these scopes: ${knowledgeScopes.slice(0, 4).join(", ")}${knowledgeScopes.length > 4 ? "." : "."}`
        : "No explicit knowledge scopes were declared for this starter.",
      actionLabel: args.workspaceId ? "Open workspace knowledge" : "Open global knowledge",
      actionHref: args.workspaceId ? `/admin/companies/${args.workspaceId}/knowledge` : "/admin/ai/global-knowledge",
    },
    {
      category: "Code",
      title: "Complete product-specific implementation",
      status: implementationPointerCount > 0 || developerFollowUps.length > 0 ? "PENDING" : "READY",
      detail: implementationPointerCount > 0
        ? `${implementationPointerCount} code pointer${implementationPointerCount === 1 ? "" : "s"} and ${developerFollowUps.length} follow-up item${developerFollowUps.length === 1 ? "" : "s"} need developer review.`
        : "No code pointers were declared for this starter.",
      actionLabel: "Review code pointers below",
    },
    {
      category: "Release",
      title: args.readinessSummary.status === "READY_FOR_REVIEW" ? "Ready for ship check" : "Run release checks",
      status: args.readinessSummary.status === "READY_FOR_REVIEW" ? "READY" : "PENDING",
      detail: evalFixtures.length > 0
        ? `Run smoke and release-gate evals, starting with: ${evalFixtures.slice(0, 3).join(", ")}.`
        : "Run smoke and release-gate checks before activating agents or workflows.",
      actionLabel: "Open Ship Checks",
      actionHref: "/admin/releases",
    },
  ];

  return tasks;
}

function buildDeveloperTaskSummary(tasks: DeveloperTask[]): DeveloperTaskSummary {
  const blockedCount = tasks.filter((task) => task.status === "BLOCKED").length;
  const pendingCount = tasks.filter((task) => task.status === "PENDING").length;
  const readyCount = tasks.filter((task) => task.status === "READY").length;
  const nextTask = tasks.find((task) => task.status === "BLOCKED")
    ?? tasks.find((task) => task.status === "PENDING")
    ?? tasks.find((task) => task.status === "READY");

  return {
    blockedCount,
    pendingCount,
    readyCount,
    nextTaskTitle: nextTask?.title,
    nextTaskCategory: nextTask?.category,
    nextTaskStatus: nextTask?.status,
  };
}

function createLaunchPlanPayload(template: AppTemplate) {
  return {
    templateId: template.id,
    templateName: template.name,
    category: template.category,
    riskProfile: template.riskProfile,
    primaryUsers: template.primaryUsers,
    recommendedConnectorKeys: template.recommendedConnectorKeys,
    draftResources: {
      agents: template.agents,
      knowledgeScopes: template.knowledgeScopes,
      workflows: template.workflows,
      evalFixtures: template.evalFixtures,
      dashboardCards: template.dashboardCards,
      publishTargets: template.publishTargets,
    },
    readinessChecks: template.readinessChecks,
    developerFollowUps: template.developerFollowUps,
    extensionPoints: template.extensionPoints,
    implementationPointers: template.implementationPointers,
    safetyDefaults: {
      resourceStatus: "DRAFT",
      externalActionsRequireApproval: true,
      releaseGateRequired: true,
    },
  };
}

export const getAppTemplateGallery = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return getAppTemplates();
  },
});

export const getRecentLaunchPlans = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return await ctx.db
      .query("appLaunchPlans")
      .withIndex("by_createdAt")
      .order("desc")
      .take(8);
  },
});

export const getLaunchPlanDetails = query({
  args: { planId: v.id("appLaunchPlans") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) return null;

    let parsedPlan: unknown = null;
    try {
      parsedPlan = JSON.parse(plan.planJson);
    } catch {
      parsedPlan = null;
    }

    let createdResources: CreatedLaunchResources | null = null;
    if (plan.createdResourceJson) {
      try {
        createdResources = JSON.parse(plan.createdResourceJson) as CreatedLaunchResources;
      } catch {
        createdResources = null;
      }
    }
    let createdResourceDetails: CreatedLaunchResourceDetails | null = null;
    if (createdResources) {
      const [agents, workflows, fixtures] = await Promise.all([
        Promise.all(createdResources.agentIds.map((id) => ctx.db.get(id))),
        Promise.all(createdResources.workflowIds.map((id) => ctx.db.get(id))),
        Promise.all(createdResources.fixtureIds.map((id) => ctx.db.get(id))),
      ]);
      const fixtureCountByAgent = new Map<string, number>();
      let missingResourceCount = 0;
      for (const fixture of fixtures) {
        if (!fixture) {
          missingResourceCount += 1;
          continue;
        }
        fixtureCountByAgent.set(fixture.agentId, (fixtureCountByAgent.get(fixture.agentId) ?? 0) + 1);
      }
      createdResourceDetails = {
        agents: agents.flatMap((agent) => {
          if (!agent) {
            missingResourceCount += 1;
            return [];
          }
          return [{
            id: agent._id,
            name: agent.name,
            isActive: agent.isActive,
            fixtureCount: fixtureCountByAgent.get(agent._id) ?? 0,
          }];
        }),
        workflows: workflows.flatMap((workflow) => {
          if (!workflow) {
            missingResourceCount += 1;
            return [];
          }
          return [{
            id: workflow._id,
            name: workflow.name,
            isActive: workflow.isActive,
            triggerType: workflow.triggerType,
          }];
        }),
        evalFixtureCount: fixtures.filter(Boolean).length,
        missingResourceCount,
      };
    }
    const linkedWorkspace: LaunchWorkspaceSummary | null = plan.targetCompanyId
      ? await ctx.db.get(plan.targetCompanyId).then((company) => company ? {
          id: company._id,
          name: company.name,
          createdAt: company.createdAt,
        } : null)
      : null;
    const recommendedConnectorKeys = Array.isArray((parsedPlan as { recommendedConnectorKeys?: unknown } | null)?.recommendedConnectorKeys)
      ? (parsedPlan as { recommendedConnectorKeys: unknown[] }).recommendedConnectorKeys.filter((key): key is string => typeof key === "string")
      : [];
    const connectorReadiness: LaunchConnectorReadiness[] = [];
    for (const key of recommendedConnectorKeys) {
      const installs = await ctx.db
        .query("toolConnectors")
        .withIndex("by_key", (q) => q.eq("key", key))
        .take(20);
      const install = installs.find((entry) => entry.companyId === undefined) ?? installs[0] ?? null;
      connectorReadiness.push({
        key,
        label: install?.name ?? formatConnectorLabel(key),
        installed: Boolean(install),
        installStatus: install?.installStatus,
        testStatus: install?.testStatus,
        authMode: install?.authMode,
        authConnectionStatus: install?.authConnectionStatus,
        isActive: install?.isActive,
        tenantScoped: Boolean(install?.companyId),
        connectorId: install?._id,
      });
    }
    const readinessSummary = buildReadinessSummary({
      parsedPlan,
      createdResourceDetails,
      connectorReadiness,
    });
    const developerHandoff = buildDeveloperHandoffSummary({
      parsedPlan,
      hasWorkspace: Boolean(linkedWorkspace),
      hasDraftResources: Boolean(createdResourceDetails),
    });
    const developerTasks = buildDeveloperTasks({
      parsedPlan,
      hasWorkspace: Boolean(linkedWorkspace),
      hasDraftResources: Boolean(createdResourceDetails),
      workspaceId: linkedWorkspace?.id,
      connectorReadiness,
      readinessSummary,
    });
    const developerTaskSummary = buildDeveloperTaskSummary(developerTasks);

    return {
      plan,
      parsedPlan,
      createdResources,
      createdResourceDetails,
      connectorReadiness,
      readinessSummary,
      developerHandoff,
      developerTasks,
      developerTaskSummary,
      linkedWorkspace,
    };
  },
});

export const archiveLaunchPlan = mutation({
  args: { planId: v.id("appLaunchPlans") },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Launch plan not found.");
    if (plan.status === "ARCHIVED") return args.planId;

    const now = Date.now();
    await ctx.db.patch(args.planId, {
      status: "ARCHIVED",
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "ARCHIVE_APP_LAUNCH_PLAN",
      entityId: args.planId,
      entityType: "appLaunchPlans",
      metadata: JSON.stringify({
        templateId: plan.templateId,
        templateName: plan.templateName,
        targetCompanyName: plan.targetCompanyName ?? null,
      }),
      timestamp: now,
    });

    return args.planId;
  },
});

export const materializeLaunchPlan = mutation({
  args: { planId: v.id("appLaunchPlans") },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Launch plan not found.");
    if (plan.status === "ARCHIVED") throw new Error("Archived launch plans cannot create resources.");
    if (plan.createdResourceJson) {
      return JSON.parse(plan.createdResourceJson) as CreatedLaunchResources;
    }

    const template = getAppTemplateById(plan.templateId);
    if (!template) throw new Error("App template not found.");

    const now = Date.now();
    const createdResources: CreatedLaunchResources = {
      agentIds: [],
      workflowIds: [],
      fixtureIds: [],
      sourceRunIds: [],
    };
    const archetype = getAgentTemplateById(APP_TEMPLATE_AGENT_ARCHETYPE[template.id] ?? "internal-knowledge-assistant");
    if (!archetype) throw new Error("Agent archetype not found.");

    for (const agentName of template.agents) {
      const agentId = await ctx.db.insert("agents", buildGlobalAgentRecord({
        name: agentName,
        description: `${template.name} draft resource. ${template.description}`,
        modelId: SYSTEM_FAILSAFE_MODEL_ID,
        modelSelectionMode: "inherit",
        systemPrompt: archetype.systemPrompt,
        isActive: false,
        temperature: archetype.temperature,
        humanApprovalRequired: true,
        reasoningEffort: archetype.reasoningEffort,
        triggerType: "MANUAL",
      }, now));
      createdResources.agentIds.push(agentId);

      const seededFixtures = await seedFixturesForTemplate({
        ctx,
        agentId,
        createdBy: userId,
        template: archetype,
      });
      createdResources.sourceRunIds.push(seededFixtures.sourceRunId);
      createdResources.fixtureIds.push(...seededFixtures.fixtureIds);
    }

    for (const workflowName of template.workflows) {
      const workflowId = await ctx.db.insert("workflows", {
        name: workflowName,
        description: `${template.name} draft workflow. Review trigger, steps, and approvals before activation.`,
        isActive: false,
        triggerType: "MANUAL",
        nodes: "[]",
        edges: "[]",
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
      });
      createdResources.workflowIds.push(workflowId);
    }

    const createdResourceJson = JSON.stringify(createdResources);
    await ctx.db.patch(args.planId, {
      status: "MATERIALIZED",
      createdResourceJson,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "MATERIALIZE_APP_LAUNCH_PLAN",
      entityId: args.planId,
      entityType: "appLaunchPlans",
      metadata: JSON.stringify({
        templateId: template.id,
        templateName: template.name,
        agentCount: createdResources.agentIds.length,
        workflowCount: createdResources.workflowIds.length,
        fixtureCount: createdResources.fixtureIds.length,
      }),
      timestamp: now,
    });

    return createdResources;
  },
});

export const createWorkspaceForLaunchPlan = mutation({
  args: { planId: v.id("appLaunchPlans") },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Launch plan not found.");
    if (plan.status === "ARCHIVED") throw new Error("Archived launch plans cannot create workspaces.");
    if (plan.targetCompanyId) {
      const existingCompany = await ctx.db.get(plan.targetCompanyId);
      if (existingCompany) return existingCompany._id;
    }

    const companyName = plan.targetCompanyName?.trim() || plan.templateName;
    if (companyName.length === 0) throw new Error("Workspace name is required.");

    const now = Date.now();
    const companyId = await ctx.db.insert("companies", buildCompanyRecord({
      name: companyName,
      systemPrompt: `Workspace created from ${plan.templateName} launch plan. Review company context before activation.`,
    }, now));
    await incrementGlobalInventoryTotals(ctx, { companiesDelta: 1 });
    await ctx.db.patch(args.planId, {
      targetCompanyId: companyId,
      targetCompanyName: companyName,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_LAUNCH_WORKSPACE",
      entityId: companyId,
      entityType: "companies",
      companyId,
      metadata: JSON.stringify({
        launchPlanId: args.planId,
        templateId: plan.templateId,
        templateName: plan.templateName,
      }),
      timestamp: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "LINK_APP_LAUNCH_PLAN_WORKSPACE",
      entityId: args.planId,
      entityType: "appLaunchPlans",
      companyId,
      metadata: JSON.stringify({
        companyId,
        companyName,
        templateId: plan.templateId,
      }),
      timestamp: now,
    });

    return companyId;
  },
});

export const createLaunchPlan = mutation({
  args: {
    templateId: v.string(),
    targetCompanyName: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(ctx);
    const template = getAppTemplateById(args.templateId);
    if (!template) throw new Error("App template not found.");

    const targetCompanyName = args.targetCompanyName?.trim();
    const notes = args.notes?.trim();
    const now = Date.now();
    const planJson = JSON.stringify(createLaunchPlanPayload(template));

    const planId = await ctx.db.insert("appLaunchPlans", {
      templateId: template.id,
      templateName: template.name,
      category: template.category,
      riskProfile: template.riskProfile,
      status: "DRAFT",
      targetCompanyName: targetCompanyName || undefined,
      notes: notes || undefined,
      planJson,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actionType: "CREATE_APP_LAUNCH_PLAN",
      entityId: planId,
      entityType: "appLaunchPlans",
      metadata: JSON.stringify({
        templateId: template.id,
        templateName: template.name,
        targetCompanyName: targetCompanyName || null,
      }),
      timestamp: now,
    });

    return planId;
  },
});
