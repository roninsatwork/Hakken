import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import type { Doc } from "../_generated/dataModel";
import schema from "../schema";
import { connectorAuthModeValidator, toolConnectorDefinitionValidator, connectorToolDefinitionValidator } from "../toolConnectorDefinitions";
import { rowShape } from "./rowShape";

/**
 * What the tools and connectors surfaces hand back.
 *
 * `oauthConnections` is narrowed rather than declared whole. Each row carries
 * `state`, the unguessable value that completes a pending OAuth connection —
 * `buildOAuthState` exists to make it unguessable precisely because knowing it
 * lets someone finish somebody else's connection. Nothing on the connector
 * screen reads it. It stays on the server, and this shape is what keeps that
 * true.
 */

const connectorFields = schema.tables.toolConnectors.validator.fields;
const oauthFields = schema.tables.toolConnectorOAuthConnections.validator.fields;

export const clientOAuthConnectionShape = v.object({
  _id: v.id("toolConnectorOAuthConnections"),
  _creationTime: v.number(),
  connectorId: oauthFields.connectorId,
  key: oauthFields.key,
  companyId: oauthFields.companyId,
  provider: oauthFields.provider,
  status: oauthFields.status,
  authorizationUrl: oauthFields.authorizationUrl,
  scopes: oauthFields.scopes,
  accountRef: oauthFields.accountRef,
  tokenRef: oauthFields.tokenRef,
  message: oauthFields.message,
  createdAt: oauthFields.createdAt,
  updatedAt: oauthFields.updatedAt,
  connectedAt: oauthFields.connectedAt,
  initiatedBy: oauthFields.initiatedBy,
});

/** The narrowing the shape above describes. Kept beside it so neither drifts. */
export const toClientOAuthConnection = (connection: Doc<"toolConnectorOAuthConnections">) => {
  const { state: _state, ...rest } = connection;
  return rest;
};

const connectorRowShape = v.object({
  ...connectorFields,
  _id: v.id("toolConnectors"),
  _creationTime: v.number(),
});

export const connectorMarketplaceShape = v.array(v.object({
  ...toolConnectorDefinitionValidator.fields,
  toolDefinitions: v.array(v.object({
    ...connectorToolDefinitionValidator.fields,
    isExecutable: v.boolean(),
  })),
  installation: v.union(connectorRowShape, v.null()),
  executableToolCount: v.number(),
  totalToolCount: v.number(),
  availability: v.union(v.literal("AVAILABLE"), v.literal("UNAVAILABLE"), v.literal("PARTIAL")),
}));

export const connectorInstallDetailsShape = v.object({
  connector: connectorRowShape,
  definition: v.union(toolConnectorDefinitionValidator, v.null()),
  company: v.union(rowShape.companies, v.null()),
  canManageTenantScope: v.boolean(),
  tools: v.array(rowShape.aiTools),
  secretRefs: v.array(v.object({
    ...schema.tables.toolConnectorSecretRefs.validator.fields,
    _id: v.id("toolConnectorSecretRefs"),
    _creationTime: v.number(),
  })),
  oauthConnections: v.array(clientOAuthConnectionShape),
  oauthConnection: v.union(clientOAuthConnectionShape, v.null()),
  testLogs: v.array(v.object({
    ...schema.tables.toolConnectorTestLogs.validator.fields,
    _id: v.id("toolConnectorTestLogs"),
    _creationTime: v.number(),
  })),
});

export const connectorOAuthStartShape = v.object({
  oauthConnectionId: v.id("toolConnectorOAuthConnections"),
  authorizationUrl: v.string(),
});

export const connectorDiagnosticCodeShape = v.union(
  v.literal("OK"),
  v.literal("CONNECTOR_DISABLED"),
  v.literal("OAUTH_NOT_CONNECTED"),
  v.literal("MISSING_SECRET_REFS"),
);

export const connectorValidationShape = v.object({
  ok: v.boolean(),
  message: v.string(),
  diagnosticCode: connectorDiagnosticCodeShape,
  diagnosticDetails: v.object({
    authMode: connectorAuthModeValidator,
    connectorKey: connectorFields.key,
    companyId: connectorFields.companyId,
    installStatus: connectorFields.installStatus,
    isActive: connectorFields.isActive,
    missingSecretRefs: v.array(v.string()),
    authConnectionStatus: connectorFields.authConnectionStatus,
  }),
  missingSecretRefs: v.array(v.string()),
});

export const toolPageShape = paginationResultValidator(rowShape.aiTools);

export const agentToolListShape = v.array(v.object({
  bindingId: v.id("agentTools"),
  ...rowShape.aiTools.fields,
}));

export const toolShelfShape = v.object({
  counts: v.record(v.string(), v.number()),
  total: v.number(),
  isCapped: v.boolean(),
});
