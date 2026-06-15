import { query, mutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdminCanAccessCompany, getActiveCompanyId, getCurrentUser, requireAdmin, requireCurrentUser, requireSuperAdmin } from "./authz";
import { normalizeToolExecutionPolicy, validateToolJsonSchemaString } from "./aiToolExecutionService";
import { BUILT_IN_TOOL_CONNECTORS, getBuiltInToolConnector } from "./toolConnectorDefinitions";

const TOOL_CATALOG_LIMIT = 250;
const AGENT_TOOL_BINDING_LIMIT = 250;
const CONNECTOR_INSTALL_LIMIT = 250;
const CONNECTOR_TEST_LOG_LIMIT = 25;
const CONNECTOR_OAUTH_CONNECTION_LIMIT = 25;

const toolSideEffectLevelValidator = v.union(
  v.literal("READ"),
  v.literal("WRITE"),
  v.literal("DESTRUCTIVE"),
  v.literal("EXTERNAL")
);

type ToolSideEffectLevel = "READ" | "WRITE" | "DESTRUCTIVE" | "EXTERNAL";
type ToolConnectorInstallStatus = "INSTALLED" | "DISABLED" | "ERROR";
type ToolConnectorTenantAvailability = "GLOBAL" | "TENANT_RESTRICTED";

function getOptionalTrimmedString(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function buildToolContractPatch(args: {
  requiredRole: "ADMIN" | "SUPER_ADMIN";
  inputSchema?: string;
  outputSchema?: string;
  sideEffectLevel?: ToolSideEffectLevel;
  confirmationRequired?: boolean;
}) {
  const inputSchema = getOptionalTrimmedString(args.inputSchema);
  const outputSchema = getOptionalTrimmedString(args.outputSchema);
  validateToolJsonSchemaString(inputSchema, "Tool input schema");
  validateToolJsonSchemaString(outputSchema, "Tool output schema");

  const policy = normalizeToolExecutionPolicy({
    requiredRole: args.requiredRole,
    sideEffectLevel: args.sideEffectLevel,
    confirmationRequired: args.confirmationRequired,
  });

  return {
    inputSchema,
    outputSchema,
    sideEffectLevel: policy.sideEffectLevel,
    confirmationRequired: policy.confirmationRequired,
  };
}

function normalizeSecretRefKeys(secretRefs: string[] | undefined) {
  return Array.from(new Set((secretRefs ?? []).map((secretRef) => secretRef.trim()).filter(Boolean)));
}

function assertSafeSecretRefs(secretRefs: string[]) {
  for (const secretRef of secretRefs) {
    if (!/^[A-Za-z0-9_.:/-]{2,128}$/.test(secretRef)) {
      throw new Error("Connector secret references must be opaque reference keys, not raw secret values.");
    }

    if (/^(sk-|xox[baprs]-|ghp_|-----BEGIN)/i.test(secretRef)) {
      throw new Error("Connector secret references must not contain raw secret values.");
    }
  }
}

function assertSafeReferenceValue(value: string, label: string) {
  if (!/^[A-Za-z0-9_.:/-]{2,160}$/.test(value)) {
    throw new Error(`${label} must be an opaque reference key.`);
  }

  if (/^(sk-|xox[baprs]-|ghp_|ya29\.|-----BEGIN)/i.test(value)) {
    throw new Error(`${label} must not contain a raw secret value.`);
  }
}

function getEnabledToolMappings(definition: NonNullable<ReturnType<typeof getBuiltInToolConnector>>, requestedMappings: string[] | undefined) {
  const availableMappings = new Set(definition.toolDefinitions.map((tool) => tool.handlerMapping));
  const requested = requestedMappings !== undefined
    ? Array.from(new Set(requestedMappings.map((mapping) => mapping.trim()).filter(Boolean)))
    : Array.from(availableMappings);

  for (const mapping of requested) {
    if (!availableMappings.has(mapping)) {
      throw new Error(`Connector tool mapping is not available for ${definition.name}: ${mapping}`);
    }
  }

  return requested;
}

async function findConnectorInstall(ctx: { db: MutationCtx["db"] | QueryCtx["db"] }, args: {
  key: string;
  companyId?: Id<"companies">;
}) {
  const installs = await ctx.db
    .query("toolConnectors")
    .withIndex("by_key", (q) => q.eq("key", args.key))
    .take(CONNECTOR_INSTALL_LIMIT);
  return installs.find((install) => install.companyId === args.companyId) ?? null;
}

async function syncConnectorTools(ctx: MutationCtx, args: {
  connector: Doc<"toolConnectors">;
  enabledToolMappings: string[];
  createdBy: Id<"users">;
  now: number;
}) {
  const definition = getBuiltInToolConnector(args.connector.key);
  if (!definition) throw new Error("Connector definition not found.");

  const existingTools = await ctx.db
    .query("aiTools")
    .withIndex("by_connector", (q) => q.eq("connectorId", args.connector._id))
    .take(TOOL_CATALOG_LIMIT);
  const existingByMapping = new Map(existingTools.map((tool) => [tool.handlerMapping, tool]));
  const enabledMappings = new Set(args.enabledToolMappings);

  for (const toolDefinition of definition.toolDefinitions) {
    const existingTool = existingByMapping.get(toolDefinition.handlerMapping);
    if (!enabledMappings.has(toolDefinition.handlerMapping)) {
      if (existingTool && existingTool.isActive !== false) {
        await ctx.db.patch(existingTool._id, {
          isActive: false,
          updatedAt: args.now,
          version: (existingTool.version ?? 1) + 1,
        });
      }
      continue;
    }

    const contract = buildToolContractPatch(toolDefinition);
    const toolPatch = {
      name: toolDefinition.name,
      description: toolDefinition.description,
      handlerMapping: toolDefinition.handlerMapping,
      connectorId: args.connector._id,
      connectorKey: args.connector.key,
      secretRefKeys: toolDefinition.secretRefKeys,
      requiredRole: toolDefinition.requiredRole,
      ...contract,
      isActive: args.connector.isActive,
      updatedAt: args.now,
    };

    if (existingTool) {
      await ctx.db.patch(existingTool._id, {
        ...toolPatch,
        version: (existingTool.version ?? 1) + 1,
      });
    } else {
      await ctx.db.insert("aiTools", {
        ...toolPatch,
        version: 1,
        createdAt: args.now,
        createdBy: args.createdBy,
      });
    }
  }
}

async function syncConnectorSecretRefs(ctx: MutationCtx, args: {
  connectorId: Id<"toolConnectors">;
  requiredSecretRefs: string[];
  configuredSecretRefs: string[];
  updatedBy: Id<"users">;
  now: number;
}) {
  const existingRefs = await ctx.db
    .query("toolConnectorSecretRefs")
    .withIndex("by_connector", (q) => q.eq("connectorId", args.connectorId))
    .take(CONNECTOR_INSTALL_LIMIT);
  const existingByKey = new Map(existingRefs.map((secretRef) => [secretRef.key, secretRef]));
  const allKeys = Array.from(new Set([...args.requiredSecretRefs, ...args.configuredSecretRefs]));
  const configured = new Set(args.configuredSecretRefs);
  const required = new Set(args.requiredSecretRefs);

  for (const key of allKeys) {
    const existing = existingByKey.get(key);
    const patch = {
      providerRef: key,
      status: configured.has(key) ? "CONFIGURED" as const : "MISSING" as const,
      required: required.has(key),
      updatedAt: args.now,
      updatedBy: args.updatedBy,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("toolConnectorSecretRefs", {
        connectorId: args.connectorId,
        key,
        ...patch,
        createdAt: args.now,
      });
    }
  }

  for (const existing of existingRefs) {
    if (!allKeys.includes(existing.key)) {
      await ctx.db.delete(existing._id);
    }
  }
}

function resolveConnectorTenantAvailability(args: {
  definitionAvailability: ToolConnectorTenantAvailability;
  companyId?: Id<"companies">;
  tenantAvailability?: ToolConnectorTenantAvailability;
}) {
  if (args.definitionAvailability === "GLOBAL" && args.companyId) {
    throw new Error("Global connectors cannot be restricted to a tenant.");
  }

  if (args.tenantAvailability === "GLOBAL" && args.companyId) {
    throw new Error("Global connector installs cannot include a company.");
  }

  return args.companyId ? "TENANT_RESTRICTED" : args.tenantAvailability ?? args.definitionAvailability;
}

function buildOAuthState(connectorId: Id<"toolConnectors">, now: number) {
  return `connector:${connectorId}:${now}`;
}

function buildOAuthAuthorizationUrl(args: { provider: string; connectorKey: string; state: string; scopes: string[] }) {
  const params = new URLSearchParams({
    connector: args.connectorKey,
    provider: args.provider,
    state: args.state,
    scope: args.scopes.join(" "),
  });
  return `/api/connectors/oauth/authorize?${params.toString()}`;
}

export const getConnectorMarketplace = query({
  args: {},
  handler: async (ctx) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const activeCompanyId = getActiveCompanyId(user);
    const installs = await ctx.db.query("toolConnectors").withIndex("by_createdAt").order("desc").take(CONNECTOR_INSTALL_LIMIT);
    const visibleInstalls = user.role === "SUPER_ADMIN"
      ? installs
      : installs.filter((install) => install.companyId === activeCompanyId || install.tenantAvailability === "GLOBAL");

    return BUILT_IN_TOOL_CONNECTORS.map((definition) => {
      const installation =
        visibleInstalls.find((install) => install.key === definition.key && install.companyId === activeCompanyId) ??
        visibleInstalls.find((install) => install.key === definition.key && install.companyId === undefined) ??
        null;

      return {
        ...definition,
        installation,
      };
    });
  },
});

export const installConnector = mutation({
  args: {
    key: v.string(),
    companyId: v.optional(v.id("companies")),
    tenantAvailability: v.optional(v.union(v.literal("GLOBAL"), v.literal("TENANT_RESTRICTED"))),
    configuredSecretRefs: v.optional(v.array(v.string())),
    enabledToolMappings: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(
      ctx,
      "Unauthorized: Only Super Admins can install connectors.",
      "Unauthenticated request"
    );
    const definition = getBuiltInToolConnector(args.key);
    if (!definition) throw new Error("Connector definition not found.");

    const configuredSecretRefs = normalizeSecretRefKeys(args.configuredSecretRefs);
    assertSafeSecretRefs(configuredSecretRefs);
    const enabledToolMappings = getEnabledToolMappings(definition, args.enabledToolMappings);
    const tenantAvailability = resolveConnectorTenantAvailability({
      definitionAvailability: definition.tenantAvailability,
      companyId: args.companyId,
      tenantAvailability: args.tenantAvailability,
    });
    const now = Date.now();
    const existing = await findConnectorInstall(ctx, { key: definition.key, companyId: args.companyId });
    const connectorPatch = {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      category: definition.category,
      authMode: definition.authMode,
      requiredScopes: definition.requiredScopes,
      requiredSecretRefs: definition.requiredSecretRefs,
      configuredSecretRefs,
      enabledToolMappings,
      tenantAvailability,
      companyId: args.companyId,
      installStatus: "INSTALLED" as ToolConnectorInstallStatus,
      testStatus: "UNTESTED" as const,
      authConnectionStatus: definition.authMode === "OAUTH" ? "NOT_CONNECTED" as const : undefined,
      isActive: args.isActive ?? true,
      updatedAt: now,
    };

    const connectorId = existing
      ? (await ctx.db.patch(existing._id, connectorPatch), existing._id)
      : await ctx.db.insert("toolConnectors", {
          ...connectorPatch,
          createdAt: now,
      createdBy: userId,
    });
    const connector = await ctx.db.get(connectorId);
    if (!connector) throw new Error("Connector install failed.");

    await syncConnectorSecretRefs(ctx, {
      connectorId,
      requiredSecretRefs: definition.requiredSecretRefs,
      configuredSecretRefs,
      updatedBy: userId,
      now,
    });
    await syncConnectorTools(ctx, {
      connector,
      enabledToolMappings,
      createdBy: userId,
      now,
    });

    return connectorId;
  },
});

export const getConnectorInstallDetails = query({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const connector = await ctx.db.get(args.connectorId);
    if (!connector) throw new Error("Connector not found.");
    assertAdminCanAccessCompany(user, connector.companyId, "Unauthorized");

    const tools = await ctx.db
      .query("aiTools")
      .withIndex("by_connector", (q) => q.eq("connectorId", connector._id))
      .take(TOOL_CATALOG_LIMIT);
    const testLogs = await ctx.db
      .query("toolConnectorTestLogs")
      .withIndex("by_connector_tested", (q) => q.eq("connectorId", connector._id))
      .order("desc")
      .take(CONNECTOR_TEST_LOG_LIMIT);
    const secretRefs = await ctx.db
      .query("toolConnectorSecretRefs")
      .withIndex("by_connector", (q) => q.eq("connectorId", connector._id))
      .take(CONNECTOR_INSTALL_LIMIT);
    const oauthConnections = await ctx.db
      .query("toolConnectorOAuthConnections")
      .withIndex("by_connector_updated", (q) => q.eq("connectorId", connector._id))
      .order("desc")
      .take(CONNECTOR_OAUTH_CONNECTION_LIMIT);
    const company = connector.companyId ? await ctx.db.get(connector.companyId) : null;

    return {
      connector,
      definition: getBuiltInToolConnector(connector.key) ?? null,
      company,
      canManageTenantScope: user.role === "SUPER_ADMIN",
      tools,
      secretRefs,
      oauthConnections,
      oauthConnection: oauthConnections[0] ?? null,
      testLogs,
    };
  },
});

export const beginConnectorOAuth = mutation({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args) => {
    const { user, userId } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const connector = await ctx.db.get(args.connectorId);
    if (!connector) throw new Error("Connector not found.");
    assertAdminCanAccessCompany(user, connector.companyId, "Unauthorized");

    const definition = getBuiltInToolConnector(connector.key);
    if (!definition) throw new Error("Connector definition not found.");
    if (definition.authMode !== "OAUTH") throw new Error("Connector does not use OAuth.");

    const now = Date.now();
    const state = buildOAuthState(connector._id, now);
    const provider = definition.oauthProvider ?? definition.key;
    const authorizationUrl = buildOAuthAuthorizationUrl({
      provider,
      connectorKey: connector.key,
      state,
      scopes: definition.requiredScopes,
    });

    const oauthConnectionId = await ctx.db.insert("toolConnectorOAuthConnections", {
      connectorId: connector._id,
      key: connector.key,
      companyId: connector.companyId,
      provider,
      status: "PENDING",
      state,
      authorizationUrl,
      scopes: definition.requiredScopes,
      message: "OAuth authorization started.",
      createdAt: now,
      updatedAt: now,
      initiatedBy: userId,
    });
    await ctx.db.patch(connector._id, {
      authConnectionStatus: "PENDING",
      lastTestMessage: "OAuth authorization pending.",
      updatedAt: now,
    });

    return {
      oauthConnectionId,
      authorizationUrl,
      state,
    };
  },
});

export const completeConnectorOAuth = mutation({
  args: {
    connectorId: v.id("toolConnectors"),
    state: v.string(),
    accountRef: v.string(),
    tokenRef: v.string(),
    scopes: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const connector = await ctx.db.get(args.connectorId);
    if (!connector) throw new Error("Connector not found.");
    assertAdminCanAccessCompany(user, connector.companyId, "Unauthorized");

    const definition = getBuiltInToolConnector(connector.key);
    if (!definition) throw new Error("Connector definition not found.");
    if (definition.authMode !== "OAUTH") throw new Error("Connector does not use OAuth.");
    assertSafeReferenceValue(args.accountRef, "OAuth account reference");
    assertSafeReferenceValue(args.tokenRef, "OAuth token reference");

    const oauthConnection = await ctx.db
      .query("toolConnectorOAuthConnections")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!oauthConnection || oauthConnection.connectorId !== connector._id || oauthConnection.status !== "PENDING") {
      throw new Error("OAuth session is not pending.");
    }

    const grantedScopes = args.scopes ?? definition.requiredScopes;
    const missingScopes = definition.requiredScopes.filter((scope) => !grantedScopes.includes(scope));
    if (missingScopes.length > 0) {
      throw new Error(`OAuth connection is missing required scopes: ${missingScopes.join(", ")}`);
    }

    const now = Date.now();
    await ctx.db.patch(oauthConnection._id, {
      status: "CONNECTED",
      accountRef: args.accountRef,
      tokenRef: args.tokenRef,
      scopes: grantedScopes,
      message: "OAuth connection completed.",
      connectedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(connector._id, {
      authConnectionStatus: "CONNECTED",
      authAccountRef: args.accountRef,
      tokenRef: args.tokenRef,
      oauthScopes: grantedScopes,
      oauthConnectedAt: now,
      testStatus: "UNTESTED",
      lastTestMessage: "OAuth connected; retest connector.",
      updatedAt: now,
    });

    return oauthConnection._id;
  },
});

export const disconnectConnectorOAuth = mutation({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args) => {
    const { user } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const connector = await ctx.db.get(args.connectorId);
    if (!connector) throw new Error("Connector not found.");
    assertAdminCanAccessCompany(user, connector.companyId, "Unauthorized");

    const now = Date.now();
    const oauthConnections = await ctx.db
      .query("toolConnectorOAuthConnections")
      .withIndex("by_connector_updated", (q) => q.eq("connectorId", connector._id))
      .order("desc")
      .take(CONNECTOR_OAUTH_CONNECTION_LIMIT);
    for (const oauthConnection of oauthConnections) {
      if (oauthConnection.status === "PENDING" || oauthConnection.status === "CONNECTED") {
        await ctx.db.patch(oauthConnection._id, {
          status: "DISCONNECTED",
          message: "OAuth connection disconnected.",
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(connector._id, {
      authConnectionStatus: "NOT_CONNECTED",
      authAccountRef: undefined,
      tokenRef: undefined,
      oauthScopes: undefined,
      oauthConnectedAt: undefined,
      testStatus: "UNTESTED",
      lastTestMessage: "OAuth disconnected; reconnect before testing.",
      updatedAt: now,
    });

    return true;
  },
});

export const updateConnectorInstall = mutation({
  args: {
    connectorId: v.id("toolConnectors"),
    configuredSecretRefs: v.optional(v.array(v.string())),
    enabledToolMappings: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    companyId: v.optional(v.id("companies")),
    tenantAvailability: v.optional(v.union(v.literal("GLOBAL"), v.literal("TENANT_RESTRICTED"))),
  },
  handler: async (ctx, args) => {
    const { user, userId } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const connector = await ctx.db.get(args.connectorId);
    if (!connector) throw new Error("Connector not found.");
    assertAdminCanAccessCompany(user, connector.companyId, "Unauthorized");

    const definition = getBuiltInToolConnector(connector.key);
    if (!definition) throw new Error("Connector definition not found.");

    const configuredSecretRefs =
      args.configuredSecretRefs === undefined
        ? connector.configuredSecretRefs ?? []
        : normalizeSecretRefKeys(args.configuredSecretRefs);
    assertSafeSecretRefs(configuredSecretRefs);
    const enabledToolMappings = getEnabledToolMappings(definition, args.enabledToolMappings ?? connector.enabledToolMappings);
    const isActive = args.isActive ?? connector.isActive;
    const companyId = user.role === "SUPER_ADMIN" && Object.prototype.hasOwnProperty.call(args, "companyId")
      ? args.companyId
      : connector.companyId;
    if (companyId && !(await ctx.db.get(companyId))) {
      throw new Error("Connector tenant not found.");
    }
    const tenantAvailability = user.role === "SUPER_ADMIN"
      ? resolveConnectorTenantAvailability({
          definitionAvailability: definition.tenantAvailability,
          companyId,
          tenantAvailability: args.tenantAvailability ?? connector.tenantAvailability,
        })
      : connector.tenantAvailability;
    const now = Date.now();

    await ctx.db.patch(connector._id, {
      configuredSecretRefs,
      enabledToolMappings,
      isActive,
      companyId,
      tenantAvailability,
      installStatus: isActive ? "INSTALLED" : "DISABLED",
      testStatus: "UNTESTED",
      lastTestMessage: "Configuration changed; retest connector.",
      updatedAt: now,
    });

    const updatedConnector = await ctx.db.get(connector._id);
    if (!updatedConnector) throw new Error("Connector not found.");
    await syncConnectorSecretRefs(ctx, {
      connectorId: connector._id,
      requiredSecretRefs: definition.requiredSecretRefs,
      configuredSecretRefs,
      updatedBy: userId,
      now,
    });
    await syncConnectorTools(ctx, {
      connector: updatedConnector,
      enabledToolMappings,
      createdBy: userId,
      now,
    });

    return connector._id;
  },
});

export const testConnectorConnection = mutation({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args) => {
    const { user, userId } = await requireAdmin(ctx, "Unauthorized", "Unauthenticated request");
    const connector = await ctx.db.get(args.connectorId);
    if (!connector) throw new Error("Connector not found.");
    assertAdminCanAccessCompany(user, connector.companyId, "Unauthorized");

    const configuredRefs = new Set(connector.configuredSecretRefs ?? []);
    const missingSecretRefs = (connector.requiredSecretRefs ?? []).filter((secretRef) => !configuredRefs.has(secretRef));
    const now = Date.now();
    const oauthMissing = connector.authMode === "OAUTH" && connector.authConnectionStatus !== "CONNECTED";
    const disabled = connector.isActive === false || connector.installStatus === "DISABLED";
    const success = !disabled && !oauthMissing && (connector.authMode === "NONE" || connector.authMode === "OAUTH" || missingSecretRefs.length === 0);
    const diagnosticCode = disabled
      ? "CONNECTOR_DISABLED"
      : oauthMissing
        ? "OAUTH_NOT_CONNECTED"
        : success
          ? "OK"
          : "MISSING_SECRET_REFS";
    const message = disabled
      ? "Connector is disabled."
      : oauthMissing
        ? "OAuth connection is not connected."
        : success
          ? "Connection test passed."
          : `Missing secret references: ${missingSecretRefs.join(", ")}`;
    const diagnosticDetails = {
      authMode: connector.authMode,
      connectorKey: connector.key,
      companyId: connector.companyId,
      installStatus: connector.installStatus,
      isActive: connector.isActive,
      missingSecretRefs,
      authConnectionStatus: connector.authConnectionStatus,
    };

    await ctx.db.patch(connector._id, {
      testStatus: success ? "SUCCESS" : "FAILURE",
      lastTestedAt: now,
      lastTestMessage: message,
      installStatus: success ? "INSTALLED" : "ERROR",
      updatedAt: now,
    });
    await ctx.db.insert("toolConnectorTestLogs", {
      connectorId: connector._id,
      key: connector.key,
      companyId: connector.companyId,
      status: success ? "SUCCESS" : "FAILURE",
      message,
      diagnosticCode,
      diagnosticDetailsJson: JSON.stringify(diagnosticDetails),
      missingSecretRefs,
      testedAt: now,
      testedBy: userId,
    });

    return {
      ok: success,
      message,
      diagnosticCode,
      diagnosticDetails,
      missingSecretRefs,
    };
  },
});

// Fetch all registered AI system tools
export const getTools = query({
  args: {},
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    
    // Tools are strictly globally configured by admins
    return await ctx.db.query("aiTools").order("desc").take(TOOL_CATALOG_LIMIT);
  },
});

export const getPaginatedTools = query({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const searchTerm = args.searchTerm?.trim();

    return searchTerm
      ? await ctx.db
        .query("aiTools")
        .withSearchIndex("search_name", (q) => q.search("name", searchTerm))
        .paginate(args.paginationOpts)
      : await ctx.db
        .query("aiTools")
        .withIndex("by_createdAt")
        .order("desc")
        .paginate(args.paginationOpts);
  },
});

export const getToolById = query({
  args: { id: v.id("aiTools") },
  handler: async (ctx, args) => {
    await requireCurrentUser(ctx, "Unauthenticated request");

    return await ctx.db.get(args.id);
  },
});

export const createTool = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    handlerMapping: v.string(),
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    inputSchema: v.optional(v.string()),
    outputSchema: v.optional(v.string()),
    sideEffectLevel: v.optional(toolSideEffectLevelValidator),
    confirmationRequired: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireSuperAdmin(
      ctx,
      "Unauthorized: Only Super Admins can register system execution hooks.",
      "Unauthenticated request"
    );

    const now = Date.now();
    const contract = buildToolContractPatch(args);

    return await ctx.db.insert("aiTools", {
      name: args.name,
      description: args.description,
      handlerMapping: args.handlerMapping,
      requiredRole: args.requiredRole,
      ...contract,
      isActive: args.isActive ?? true,
      version: 1,
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
  },
});

export const updateTool = mutation({
  args: {
    id: v.id("aiTools"),
    name: v.string(),
    description: v.string(),
    handlerMapping: v.string(),
    requiredRole: v.union(v.literal("ADMIN"), v.literal("SUPER_ADMIN")),
    inputSchema: v.optional(v.string()),
    outputSchema: v.optional(v.string()),
    sideEffectLevel: v.optional(toolSideEffectLevelValidator),
    confirmationRequired: v.optional(v.boolean()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(
      ctx,
      "Unauthorized: System modification requires supreme permissions.",
      "Unauthenticated request"
    );

    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Tool not found.");
    const contract = buildToolContractPatch(args);

    await ctx.db.patch(args.id, {
      name: args.name,
      description: args.description,
      handlerMapping: args.handlerMapping,
      requiredRole: args.requiredRole,
      ...contract,
      isActive: args.isActive ?? existing.isActive ?? true,
      version: (existing.version ?? 1) + 1,
      updatedAt: Date.now(),
    });
    
    return args.id;
  },
});

export const deleteTool = mutation({
  args: { id: v.id("aiTools") },
  handler: async (ctx, args) => {
    await requireSuperAdmin(
      ctx,
      "Unauthorized: Sonae architectural deletion prevented.",
      "Unauthenticated request"
    );

    // Must also cleanse all bindings to this tool in the junction table
    const bindings = await ctx.db
       .query("agentTools")
       .withIndex("by_tool", q => q.eq("toolId", args.id))
       .take(AGENT_TOOL_BINDING_LIMIT);
       
    for (const binding of bindings) {
        await ctx.db.delete(binding._id);
    }

    await ctx.db.delete(args.id);
    return true;
  },
});

// Fetch all tool bindings for a specific agent
export const getAgentTools = query({
  args: { agentId: v.id("agents") },
  handler: async (ctx, args) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];

    const bindings = await ctx.db
       .query("agentTools")
       .withIndex("by_agent", q => q.eq("agentId", args.agentId))
       .take(AGENT_TOOL_BINDING_LIMIT);

    // Map tools
    const tools = [];
    for (const binding of bindings) {
        const tool = await ctx.db.get(binding.toolId);
        if (tool) {
            tools.push({ bindingId: binding._id, ...tool });
        }
    }
    return tools;
  },
});

// Bind or unbind a global tool to an agent
export const toggleAgentTool = mutation({
  args: { 
    agentId: v.id("agents"), 
    toolId: v.id("aiTools"),
    action: v.union(v.literal("BIND"), v.literal("UNBIND"))
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx, "Unauthorized", "Unauthenticated request");

    const existingBinding = await ctx.db
       .query("agentTools")
       .withIndex("by_agent", q => q.eq("agentId", args.agentId))
       .filter(q => q.eq(q.field("toolId"), args.toolId))
       .first();

    if (args.action === "BIND" && !existingBinding) {
       await ctx.db.insert("agentTools", {
          agentId: args.agentId,
          toolId: args.toolId,
          assignedAt: Date.now()
       });
    } else if (args.action === "UNBIND" && existingBinding) {
       await ctx.db.delete(existingBinding._id);
    }
    
    return true;
  },
});

export const getToolInternal = internalQuery({
  args: { id: v.id("aiTools") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});
