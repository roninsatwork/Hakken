type ConnectorCategory = "KNOWLEDGE" | "PROFILE" | "WORKFLOW" | "HTTP" | "EMAIL" | "CUSTOM";
type ConnectorAuthMode = "NONE" | "SECRET_REF" | "OAUTH";
type ToolSideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";

export type ConnectorToolDefinition = {
  name: string;
  description: string;
  handlerMapping: string;
  requiredRole: "ADMIN" | "SUPER_ADMIN";
  sideEffectLevel: ToolSideEffectLevel;
  confirmationRequired: boolean;
  inputSchema?: string;
  outputSchema?: string;
  secretRefKeys?: string[];
};

export type ToolConnectorDefinition = {
  key: string;
  name: string;
  description: string;
  category: ConnectorCategory;
  authMode: ConnectorAuthMode;
  oauthProvider?: string;
  tenantAvailability: "GLOBAL" | "TENANT_RESTRICTED";
  requiredScopes: string[];
  requiredSecretRefs: string[];
  toolDefinitions: ConnectorToolDefinition[];
};

export const BUILT_IN_TOOL_CONNECTORS: ToolConnectorDefinition[] = [
  {
    key: "sonae-knowledge",
    name: "Sonae Knowledge",
    description: "Search approved tenant knowledge and uploaded documents through the governed RAG path.",
    category: "KNOWLEDGE",
    authMode: "NONE",
    tenantAvailability: "GLOBAL",
    requiredScopes: ["knowledge:read"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Knowledge Search",
        description: "Search approved internal knowledge sources and return concise cited snippets.",
        handlerMapping: "knowledge.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
    ],
  },
  {
    key: "sonae-company-profile",
    name: "Sonae Company/Profile",
    description: "Read and maintain tenant company profile context used by agents and onboarding flows.",
    category: "PROFILE",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["company:read", "company:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Update Company Overview",
        description: "Update the active tenant company overview after explicit approval.",
        handlerMapping: "company.overview.update",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["overview"],
          properties: {
            overview: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "sonae-workflow-task",
    name: "Sonae Workflow/Task",
    description: "Reserved connector for creating and updating governed tasks from workflow runs.",
    category: "WORKFLOW",
    authMode: "NONE",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["workflow:read", "workflow:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Create Workflow Task",
        description: "Create a governed workflow task placeholder. Real task execution is not implemented yet.",
        handlerMapping: "workflow.task.create",
        requiredRole: "ADMIN",
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "http-rest",
    name: "HTTP REST",
    description: "Configure outbound REST actions with vault-backed secret references and explicit approval policy.",
    category: "HTTP",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["http:request"],
    requiredSecretRefs: ["base_url", "auth_header"],
    toolDefinitions: [
      {
        name: "HTTP Request",
        description: "Prepare an outbound HTTP request through the REST connector. Real outbound execution is not implemented yet.",
        handlerMapping: "http.request",
        requiredRole: "SUPER_ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        secretRefKeys: ["base_url", "auth_header"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["method", "path"],
          properties: {
            method: { type: "string" },
            path: { type: "string" },
            bodyJson: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "email-notification",
    name: "Email/Notification",
    description: "Configure notification delivery for workflow and agent follow-up actions.",
    category: "EMAIL",
    authMode: "SECRET_REF",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["notification:send"],
    requiredSecretRefs: ["provider_api_key", "from_address"],
    toolDefinitions: [
      {
        name: "Send Notification",
        description: "Prepare an email or notification dispatch. Real delivery is not implemented yet.",
        handlerMapping: "notification.send",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        secretRefKeys: ["provider_api_key", "from_address"],
        inputSchema: JSON.stringify({
          type: "object",
          required: ["to", "subject", "body"],
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "slack",
    name: "Slack",
    description: "OAuth scaffold for Slack workspace actions and notification workflows.",
    category: "CUSTOM",
    authMode: "OAUTH",
    oauthProvider: "slack",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["channels:read", "chat:write"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Send Slack Message",
        description: "Prepare a Slack message through an OAuth-backed Slack connector. Real Slack delivery is not implemented yet.",
        handlerMapping: "slack.message.send",
        requiredRole: "ADMIN",
        sideEffectLevel: "EXTERNAL",
        confirmationRequired: true,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["channel", "text"],
          properties: {
            channel: { type: "string" },
            text: { type: "string" },
          },
        }),
      },
    ],
  },
  {
    key: "google-drive",
    name: "Google Drive",
    description: "OAuth scaffold for tenant-scoped document search and file workflows.",
    category: "CUSTOM",
    authMode: "OAUTH",
    oauthProvider: "google",
    tenantAvailability: "TENANT_RESTRICTED",
    requiredScopes: ["drive.metadata.readonly", "drive.readonly"],
    requiredSecretRefs: [],
    toolDefinitions: [
      {
        name: "Search Google Drive",
        description: "Prepare a Google Drive search through an OAuth-backed connector. Real Drive access is not implemented yet.",
        handlerMapping: "google_drive.search",
        requiredRole: "ADMIN",
        sideEffectLevel: "READ",
        confirmationRequired: false,
        inputSchema: JSON.stringify({
          type: "object",
          required: ["query"],
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
          },
        }),
      },
    ],
  },
];

export function getBuiltInToolConnector(key: string) {
  return BUILT_IN_TOOL_CONNECTORS.find((connector) => connector.key === key);
}
