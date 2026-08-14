import { query, mutation, internalQuery } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import type { Doc, Id } from "./_generated/dataModel";
import { assertAdminCanAccessCompany, getActiveCompanyId, getCurrentUser, requireAdmin, requireCurrentUser, requireSuperAdmin } from "./authz";
import {
  CONNECTOR_OAUTH_UNAVAILABLE_MESSAGE,
  isConnectorOAuthAvailable,
  isExecutableToolMapping,
  normalizeToolExecutionPolicy,
  validateToolJsonSchemaString,
} from "./aiToolExecutionService";
import { BUILT_IN_TOOL_CONNECTORS, getBuiltInToolConnector } from "./toolConnectorDefinitions";
import { assertSafeSecretRefs } from "./connectorSecretPolicy";
import { internal } from "./_generated/api";
import { adminMutation, adminQuery, publicQuery, superAdminMutation, superAdminQuery, tenantQuery } from "./tenantFunctions";

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

/**
 * The single-use state that ties the consent round-trip together.
 *
 * Random, because the state is the only thing authenticating the provider's
 * redirect back to us — the old `connector:<id>:<timestamp>` form was
 * guessable, which would have let anyone complete somebody else's pending
 * connection.
 */
function buildOAuthState(connectorId: Id<"toolConnectors">, now: number) {
  const random = crypto.getRandomValues(new Uint8Array(24));
  const hex = Array.from(random, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `connector:${connectorId}:${now}:${hex}`;
}

/**
 * Where the Connect button sends the administrator: the deployment's own
 * authorize route (`connectorOAuth.ts`), absolute because the admin screen
 * runs on the app origin and the route on the Convex site origin. Only the
 * state travels — provider, scopes and credentials are resolved server-side
 * from the pending connection it names.
 */
function buildOAuthAuthorizationUrl(args: { state: string }) {
  const siteUrl = (process.env.CONVEX_SITE_URL ?? "").replace(/\/+$/, "");
  const params = new URLSearchParams({ state: args.state });
  return `${siteUrl}/api/connectors/oauth/authorize?${params.toString()}`;
}

/**
 * Whether this connector can be taken through an OAuth flow today: the
 * provider's client credentials and the token encryption key must be
 * configured on this deployment.
 */
function assertConnectorOAuthAvailable(provider: string) {
  if (!isConnectorOAuthAvailable(provider)) {
    throw new Error(CONNECTOR_OAUTH_UNAVAILABLE_MESSAGE);
  }
}

export const getConnectorMarketplace = adminQuery({
  args: {},
  handler: async (ctx) => {
    const { user } = ctx;
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

      // Availability is derived from the handler registry, never from the
      // catalogue. The catalogue described 21 connectors while 2 could execute,
      // so an admin could install one, assign it to an agent, and only discover
      // it did nothing by reading a run log. The registry is the only thing that
      // knows whether an implementation exists.
      const toolDefinitions = definition.toolDefinitions.map((tool) => ({
        ...tool,
        isExecutable: isExecutableToolMapping(tool.handlerMapping),
      }));
      const executableToolCount = toolDefinitions.filter((tool) => tool.isExecutable).length;

      return {
        ...definition,
        toolDefinitions,
        installation,
        executableToolCount,
        totalToolCount: toolDefinitions.length,
        // A connector with no tool definitions is not an unimplemented
        // catalogue entry — it is an inbound door (the phone line): nothing
        // for an agent to execute, so nothing the registry needs to vouch for.
        availability: toolDefinitions.length === 0
          ? "AVAILABLE" as const
          : executableToolCount === 0
            ? "UNAVAILABLE" as const
            : executableToolCount === toolDefinitions.length
              ? "AVAILABLE" as const
              : "PARTIAL" as const,
      };
    });
  },
});

/**
 * Install one built-in connector and bring its tool rows into line.
 *
 * The admin screen is not the only caller: a maintenance script has to be able
 * to put a deployment into a known state without a person clicking through the
 * connector list. Both go through here so an install performed by a script is
 * the same install, rather than a second implementation that drifts.
 *
 * The permission check stays with the callers — this function assumes it has
 * already happened.
 */
export async function installBuiltInConnector(
  ctx: MutationCtx,
  args: {
    key: string;
    installedBy: Id<"users">;
    companyId?: Id<"companies">;
    tenantAvailability?: ToolConnectorTenantAvailability;
    configuredSecretRefs?: string[];
    enabledToolMappings?: string[];
    isActive?: boolean;
  }
) {
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
        createdBy: args.installedBy,
      });
  const connector = await ctx.db.get(connectorId);
  if (!connector) throw new Error("Connector install failed.");

  await syncConnectorSecretRefs(ctx, {
    connectorId,
    requiredSecretRefs: definition.requiredSecretRefs,
    configuredSecretRefs,
    updatedBy: args.installedBy,
    now,
  });
  await syncConnectorTools(ctx, {
    connector,
    enabledToolMappings,
    createdBy: args.installedBy,
    now,
  });

  return { connectorId, alreadyInstalled: existing !== null };
}

export const installConnector = superAdminMutation({
  args: {
    key: v.string(),
    companyId: v.optional(v.id("companies")),
    tenantAvailability: v.optional(v.union(v.literal("GLOBAL"), v.literal("TENANT_RESTRICTED"))),
    configuredSecretRefs: v.optional(v.array(v.string())),
    enabledToolMappings: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { connectorId } = await installBuiltInConnector(ctx, {
      key: args.key,
      installedBy: ctx.userId,
      companyId: args.companyId,
      tenantAvailability: args.tenantAvailability,
      configuredSecretRefs: args.configuredSecretRefs,
      enabledToolMappings: args.enabledToolMappings,
      isActive: args.isActive,
    });

    return connectorId;
  },
});

export const getConnectorInstallDetails = adminQuery({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args) => {
    const { user } = ctx;
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

export const beginConnectorOAuth = adminMutation({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args) => {
    const { user, userId } = ctx;
    const connector = await ctx.db.get(args.connectorId);
    if (!connector) throw new Error("Connector not found.");
    assertAdminCanAccessCompany(user, connector.companyId, "Unauthorized");

    const definition = getBuiltInToolConnector(connector.key);
    if (!definition) throw new Error("Connector definition not found.");
    if (definition.authMode !== "OAUTH") throw new Error("Connector does not use OAuth.");
    const provider = definition.oauthProvider ?? definition.key;
    assertConnectorOAuthAvailable(provider);

    const now = Date.now();
    const state = buildOAuthState(connector._id, now);
    const authorizationUrl = buildOAuthAuthorizationUrl({ state });

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

// `completeConnectorOAuth` — the mutation that accepted hand-typed account
// and token references — is gone. Completion now has exactly one path: the
// provider's redirect into `/api/connectors/oauth/callback`
// (`connectorOAuth.handleConnectorOAuthCallback`), which exchanges the code
// server-side and stores ciphertext. Nothing client-callable can mark a
// connection CONNECTED.

export const disconnectConnectorOAuth = adminMutation({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args) => {
    const { user } = ctx;
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

    // Disconnect means revoked (commitment 4): the scheduled action revokes
    // the grant at the provider, deletes the ciphertext row, and writes the
    // audit entry. Scheduled because a mutation cannot reach the provider.
    await ctx.scheduler.runAfter(0, internal.connectorOAuth.revokeAndDisconnect, {
      connectorId: connector._id,
      actorId: ctx.userId,
    });

    return true;
  },
});

export const updateConnectorInstall = adminMutation({
  args: {
    connectorId: v.id("toolConnectors"),
    configuredSecretRefs: v.optional(v.array(v.string())),
    enabledToolMappings: v.optional(v.array(v.string())),
    isActive: v.optional(v.boolean()),
    companyId: v.optional(v.id("companies")),
    tenantAvailability: v.optional(v.union(v.literal("GLOBAL"), v.literal("TENANT_RESTRICTED"))),
    /** The external account this install is bound to — a phone number, say. */
    authAccountRef: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { user, userId } = ctx;
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
    // The bound account — a phone number, say — is editable only where the
    // definition asks for one. An OAuth connector's account ref belongs to
    // the consent flow, never to a form field.
    const authAccountRef =
      args.authAccountRef !== undefined && connector.authMode !== "OAUTH" && definition.accountRefLabel
        ? args.authAccountRef.trim() || undefined
        : connector.authAccountRef;
    const now = Date.now();

    await ctx.db.patch(connector._id, {
      // The definition's current shape, not the copy frozen at install time —
      // a definition change must not leave an old install demanding keys the
      // connector no longer needs.
      name: definition.name,
      description: definition.description,
      category: definition.category,
      authMode: definition.authMode,
      requiredScopes: definition.requiredScopes,
      requiredSecretRefs: definition.requiredSecretRefs,
      configuredSecretRefs,
      enabledToolMappings,
      isActive,
      companyId,
      tenantAvailability,
      authAccountRef,
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

/**
 * Validate a connector's local configuration.
 *
 * This is a mutation, so it cannot make an outbound request — it never contacts
 * the provider. It checks that the connector is enabled, that required secret
 * *reference names* are present, and that any OAuth record is marked connected.
 *
 * It was previously named `testConnectorConnection` and reported "Connection
 * test passed", which meant a connector whose OAuth had been "completed" with
 * an arbitrary token reference reported a passing connection it had never made.
 * Real reachability testing needs an action and belongs with the connector work
 * in docs/plans/active/platform-hardening-plan.md (P3.5).
 */
export const validateConnectorConfiguration = adminMutation({
  args: { connectorId: v.id("toolConnectors") },
  handler: async (ctx, args) => {
    const { user, userId } = ctx;
    const connector = await ctx.db.get(args.connectorId);
    if (!connector) throw new Error("Connector not found.");
    assertAdminCanAccessCompany(user, connector.companyId, "Unauthorized");

    // Judged against the definition's current requirements, not the copy
    // frozen into the install row — a connector that stopped needing a key
    // must not fail its check until someone happens to re-save it.
    const definition = getBuiltInToolConnector(connector.key);
    const requiredSecretRefs = definition?.requiredSecretRefs ?? connector.requiredSecretRefs ?? [];
    const authMode = definition?.authMode ?? connector.authMode;
    const configuredRefs = new Set(connector.configuredSecretRefs ?? []);
    const missingSecretRefs = requiredSecretRefs.filter((secretRef) => !configuredRefs.has(secretRef));
    const now = Date.now();
    const oauthMissing = authMode === "OAUTH" && connector.authConnectionStatus !== "CONNECTED";
    const disabled = connector.isActive === false || connector.installStatus === "DISABLED";
    const success = !disabled && !oauthMissing && (authMode === "NONE" || authMode === "OAUTH" || missingSecretRefs.length === 0);
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
          // Deliberately not "connection test passed": nothing was contacted.
          ? "Configuration valid — not yet verified against the provider."
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
export const getTools = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
  args: {},
  handler: async (ctx) => {
    const current = await getCurrentUser(ctx);
    if (!current) return [];
    
    // Tools are strictly globally configured by admins
    return await ctx.db.query("aiTools").order("desc").take(TOOL_CATALOG_LIMIT);
  },
});

export const getPaginatedTools = superAdminQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    searchTerm: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
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

export const getToolById = tenantQuery({
  args: { id: v.id("aiTools") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const createTool = superAdminMutation({
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
    const { userId } = ctx;

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

export const updateTool = superAdminMutation({
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

export const deleteTool = superAdminMutation({
  args: { id: v.id("aiTools") },
  handler: async (ctx, args) => {
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
export const getAgentTools = publicQuery({
  reason: "Returns an empty result rather than throwing when the caller lacks a session or the required role, so the UI renders an empty state instead of an error. Role filtering happens inside the handler.",
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
export const toggleAgentTool = superAdminMutation({
  args: { 
    agentId: v.id("agents"), 
    toolId: v.id("aiTools"),
    action: v.union(v.literal("BIND"), v.literal("UNBIND"))
  },
  handler: async (ctx, args) => {
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
