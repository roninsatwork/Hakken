import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const toolInput = {
  name: "CRM Lookup",
  description: "Look up CRM data for an agent.",
  handlerMapping: "crm.lookup",
  requiredRole: "ADMIN" as const,
  inputSchema: '{"type":"object","required":["accountId"],"properties":{"accountId":{"type":"string"}}}',
  sideEffectLevel: "READ" as const,
  confirmationRequired: false,
  isActive: true,
};

describe("AI Tools Authorization", () => {
  test("standard users cannot manage tools but super admins can", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });

      return { userId, superAdminId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(userClient.mutation(api.aiTools.createTool, toolInput)).rejects.toThrow("Unauthorized");

    const toolId = await superAdminClient.mutation(api.aiTools.createTool, toolInput);
    const tool = await t.run(async (ctx) => await ctx.db.get(toolId));

    expect(tool?.name).toBe(toolInput.name);
    expect(tool?.createdBy).toBe(superAdminId);
    expect(tool).toMatchObject({
      inputSchema: toolInput.inputSchema,
      sideEffectLevel: "READ",
      confirmationRequired: false,
      isActive: true,
      version: 1,
    });
  });

  test("super admins cannot save invalid tool schemas", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      superAdminClient.mutation(api.aiTools.createTool, {
        ...toolInput,
        inputSchema: '{"type":"array"}',
      })
    ).rejects.toThrow('Tool input schema must use root type "object".');

    await expect(
      superAdminClient.mutation(api.aiTools.createTool, {
        ...toolInput,
        inputSchema: '{"type":"object","properties":[]}',
      })
    ).rejects.toThrow("Tool input schema properties must be a JSON object.");
  });

  test("authenticated users can read tools while anonymous clients receive an empty catalog", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, toolId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const toolId = await ctx.db.insert("aiTools", {
        ...toolInput,
        createdAt: Date.now(),
        createdBy: superAdminId,
      });

      return { userId, toolId };
    });

    const userClient = t.withIdentity({ subject: userId });

    await expect(t.query(api.aiTools.getToolById, { id: toolId })).rejects.toThrow("Unauthenticated");
    expect(await t.query(api.aiTools.getTools, {})).toEqual([]);

    const tools = await userClient.query(api.aiTools.getTools, {});
    const tool = await userClient.query(api.aiTools.getToolById, { id: toolId });
    const internalTool = await t.run(async (ctx) => ctx.runQuery(internal.aiTools.getToolInternal, { id: toolId }));

    expect(tools.map((entry) => entry.name)).toEqual([toolInput.name]);
    expect(tool?.handlerMapping).toBe(toolInput.handlerMapping);
    expect(internalTool?.name).toBe(toolInput.name);
  });

  test("super admins can install built-in connectors and sync approved tool definitions", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Acme",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });

      return { superAdminId, adminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });

    await expect(adminClient.mutation(api.aiTools.installConnector, { key: "sonae-knowledge" })).rejects.toThrow("Unauthorized");

    const connectorId = await superAdminClient.mutation(api.aiTools.installConnector, { key: "sonae-knowledge" });
    const connectionTest = await superAdminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId });
    const { connector, tools } = await t.run(async (ctx) => ({
      connector: await ctx.db.get(connectorId),
      tools: await ctx.db
        .query("aiTools")
        .withIndex("by_connector", (q) => q.eq("connectorId", connectorId))
        .collect(),
    }));
    const marketplace = await adminClient.query(api.aiTools.getConnectorMarketplace, {});
    const knowledgeConnector = marketplace.find((entry) => entry.key === "sonae-knowledge");
    const details = await superAdminClient.query(api.aiTools.getConnectorInstallDetails, { connectorId });

    expect(connectionTest).toMatchObject({
      ok: true,
      message: "Configuration valid — not yet verified against the provider.",
      // Nothing was contacted: this asserts local configuration only.,
      missingSecretRefs: [],
    });
    expect(connector).toMatchObject({
      key: "sonae-knowledge",
      installStatus: "INSTALLED",
      testStatus: "SUCCESS",
      enabledToolMappings: ["knowledge.search"],
      configuredSecretRefs: [],
    });
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "Knowledge Search",
      handlerMapping: "knowledge.search",
      connectorId,
      connectorKey: "sonae-knowledge",
      sideEffectLevel: "READ",
      confirmationRequired: false,
      isActive: true,
      version: 1,
    });
    expect(knowledgeConnector?.installation?._id).toBe(connectorId);
    expect(details.tools.map((tool) => tool.handlerMapping)).toEqual(["knowledge.search"]);
    expect(details.testLogs).toHaveLength(1);
    expect(details.testLogs[0]).toMatchObject({
      status: "SUCCESS",
      message: "Configuration valid — not yet verified against the provider.",
      // Nothing was contacted: this asserts local configuration only.,
    });
  });

  test("connector updates resync generated tools and require a fresh connection test", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const connectorId = await superAdminClient.mutation(api.aiTools.installConnector, { key: "sonae-knowledge" });
    await superAdminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId });
    await expect(
      superAdminClient.mutation(api.aiTools.updateConnectorInstall, {
        connectorId,
        enabledToolMappings: [],
        isActive: false,
      })
    ).resolves.toBe(connectorId);

    const details = await superAdminClient.query(api.aiTools.getConnectorInstallDetails, { connectorId });
    const tools = await t.run(async (ctx) =>
      ctx.db.query("aiTools").withIndex("by_connector", (q) => q.eq("connectorId", connectorId)).collect()
    );

    expect(details.connector).toMatchObject({
      installStatus: "DISABLED",
      testStatus: "UNTESTED",
      lastTestMessage: "Configuration changed; retest connector.",
      isActive: false,
      enabledToolMappings: [],
    });
    expect(details.testLogs).toHaveLength(1);
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      handlerMapping: "knowledge.search",
      isActive: false,
      version: 2,
    });
  });

  test("tenant connector tests are limited to admins for the matching company", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, superAdminId, adminId, otherAdminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Acme",
        createdAt: Date.now(),
      });
      const otherCompanyId = await ctx.db.insert("companies", {
        name: "Globex",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const otherAdminId = await ctx.db.insert("users", {
        email: "other@example.com",
        role: "ADMIN",
        companyId: otherCompanyId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });

      return { companyId, superAdminId, adminId, otherAdminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });
    const otherAdminClient = t.withIdentity({ subject: otherAdminId });

    const connectorId = await superAdminClient.mutation(api.aiTools.installConnector, {
      key: "sonae-company-profile",
      companyId,
    });

    await expect(otherAdminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId })).rejects.toThrow(
      "Unauthorized"
    );
    await expect(adminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId })).resolves.toMatchObject({
      ok: true,
    });

    const visibleMarketplace = await adminClient.query(api.aiTools.getConnectorMarketplace, {});
    const otherMarketplace = await otherAdminClient.query(api.aiTools.getConnectorMarketplace, {});

    expect(visibleMarketplace.find((entry) => entry.key === "sonae-company-profile")?.installation?._id).toBe(connectorId);
    expect(otherMarketplace.find((entry) => entry.key === "sonae-company-profile")?.installation).toBeNull();
  });

  test("super admins can move tenant-capable connector installs between global and tenant scopes", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { companyId, superAdminId, adminId } = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Acme",
        createdAt: Date.now(),
      });
      const adminId = await ctx.db.insert("users", {
        email: "admin@example.com",
        role: "ADMIN",
        companyId,
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });

      return { companyId, superAdminId, adminId };
    });

    const superAdminClient = t.withIdentity({ subject: superAdminId });
    const adminClient = t.withIdentity({ subject: adminId });
    const connectorId = await superAdminClient.mutation(api.aiTools.installConnector, {
      key: "sonae-company-profile",
      tenantAvailability: "GLOBAL",
    });

    await expect(adminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId })).rejects.toThrow("Unauthorized");
    await expect(
      superAdminClient.mutation(api.aiTools.updateConnectorInstall, {
        connectorId,
        tenantAvailability: "TENANT_RESTRICTED",
        companyId,
      })
    ).resolves.toBe(connectorId);
    await expect(adminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId })).resolves.toMatchObject({
      ok: true,
    });

    const details = await superAdminClient.query(api.aiTools.getConnectorInstallDetails, { connectorId });

    expect(details.company?._id).toBe(companyId);
    expect(details.connector).toMatchObject({
      companyId,
      tenantAvailability: "TENANT_RESTRICTED",
      testStatus: "SUCCESS",
    });
  });

  test("connector installs store secret references only and report missing secret refs", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      superAdminClient.mutation(api.aiTools.installConnector, {
        key: "http-rest",
        configuredSecretRefs: ["sk-real-secret-value"],
      })
    ).rejects.toThrow("Connector secret references must not contain raw secret values.");

    const connectorId = await superAdminClient.mutation(api.aiTools.installConnector, { key: "http-rest" });
    await expect(superAdminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId })).resolves.toMatchObject({
      ok: false,
      diagnosticCode: "MISSING_SECRET_REFS",
      missingSecretRefs: ["base_url", "auth_header"],
    });
    const missingDetails = await superAdminClient.query(api.aiTools.getConnectorInstallDetails, { connectorId });

    expect(missingDetails.secretRefs.map((secretRef) => ({
      key: secretRef.key,
      status: secretRef.status,
      required: secretRef.required,
    })).sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: "auth_header", status: "MISSING", required: true },
      { key: "base_url", status: "MISSING", required: true },
    ]);
    expect(missingDetails.tools.map((tool) => tool.handlerMapping)).toEqual(["http.request"]);
    expect(missingDetails.tools[0]).toMatchObject({
      connectorKey: "http-rest",
      sideEffectLevel: "EXTERNAL",
      confirmationRequired: true,
      secretRefKeys: ["base_url", "auth_header"],
    });
    expect(missingDetails.testLogs[0]).toMatchObject({
      diagnosticCode: "MISSING_SECRET_REFS",
      missingSecretRefs: ["base_url", "auth_header"],
    });
    expect(JSON.parse(missingDetails.testLogs[0].diagnosticDetailsJson || "{}")).toMatchObject({
      authMode: "SECRET_REF",
      connectorKey: "http-rest",
      missingSecretRefs: ["base_url", "auth_header"],
    });

    await expect(
      superAdminClient.mutation(api.aiTools.installConnector, {
        key: "http-rest",
        configuredSecretRefs: ["base_url", "auth_header"],
      })
    ).resolves.toBe(connectorId);
    await expect(superAdminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId })).resolves.toMatchObject({
      ok: true,
      diagnosticCode: "OK",
      missingSecretRefs: [],
    });
    const configuredDetails = await superAdminClient.query(api.aiTools.getConnectorInstallDetails, { connectorId });
    expect(configuredDetails.secretRefs.every((secretRef) => secretRef.status === "CONFIGURED")).toBe(true);
  });

  test("refuses to start an OAuth connection it cannot carry out", async () => {
    // `beginConnectorOAuth` used to mint a link to /api/connectors/oauth/authorize
    // — a route that does not exist — and mark the connector PENDING for ever.
    // The administrator got a 404 and a connector stuck mid-flow.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const connectorId = await superAdminClient.mutation(api.aiTools.installConnector, {
      key: "slack",
      tenantAvailability: "GLOBAL",
    });

    await expect(
      superAdminClient.mutation(api.aiTools.beginConnectorOAuth, { connectorId })
    ).rejects.toThrow("OAuth connections are not available on this deployment.");

    // Completion is gated too. It can only finish a session that begin created,
    // so leaving it open would offer a door into a room with no entrance.
    await expect(
      superAdminClient.mutation(api.aiTools.completeConnectorOAuth, {
        connectorId,
        state: "connector:fabricated:0",
        accountRef: "workspace/acme",
        tokenRef: "vault/slack/acme/bot",
      })
    ).rejects.toThrow("OAuth connections are not available on this deployment.");

    // And nothing claims to be connected as a result.
    await expect(
      superAdminClient.mutation(api.aiTools.validateConnectorConfiguration, { connectorId })
    ).resolves.toMatchObject({
      ok: false,
      diagnosticCode: "OAUTH_NOT_CONNECTED",
    });

    const details = await superAdminClient.query(api.aiTools.getConnectorInstallDetails, { connectorId });
    expect(details.connector.authConnectionStatus).not.toBe("CONNECTED");
    expect(details.oauthConnection).toBeNull();
  });

  test("super admins can page and search tool inventory", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const superAdminId = await t.run(async (ctx) => {
      return await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
    });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    const crmToolId = await superAdminClient.mutation(api.aiTools.createTool, toolInput);
    await superAdminClient.mutation(api.aiTools.createTool, {
      name: "Calendar Connector",
      description: "Book meetings.",
      handlerMapping: "calendar.book",
      requiredRole: "ADMIN",
    });

    const firstPage = await superAdminClient.query(api.aiTools.getPaginatedTools, {
      paginationOpts: { numItems: 1, cursor: null },
    });
    const searchPage = await superAdminClient.query(api.aiTools.getPaginatedTools, {
      searchTerm: "CRM",
      paginationOpts: { numItems: 15, cursor: null },
    });

    expect(firstPage.page).toHaveLength(1);
    expect(firstPage.isDone).toBe(false);
    expect(searchPage.page.map((tool) => tool._id)).toEqual([crmToolId]);
  });

  test("super admins can update tools and standard users cannot", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId, toolId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const toolId = await ctx.db.insert("aiTools", {
        ...toolInput,
        createdAt: Date.now(),
        createdBy: superAdminId,
      });

      return { userId, superAdminId, toolId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      userClient.mutation(api.aiTools.updateTool, {
        id: toolId,
        name: "Blocked Update",
        description: "Should fail",
        handlerMapping: "blocked.update",
        requiredRole: "ADMIN",
      })
    ).rejects.toThrow("Unauthorized");

    await expect(
      superAdminClient.mutation(api.aiTools.updateTool, {
        id: toolId,
        name: "Updated CRM Lookup",
        description: "Updated description.",
        handlerMapping: "crm.updatedLookup",
        requiredRole: "SUPER_ADMIN",
        inputSchema: '{"type":"object","properties":{"id":{"type":"string"}}}',
        outputSchema: '{"type":"object","properties":{"ok":{"type":"boolean"}}}',
        sideEffectLevel: "WRITE",
        confirmationRequired: true,
        isActive: false,
      })
    ).resolves.toBe(toolId);

    const tool = await t.run(async (ctx) => await ctx.db.get(toolId));

    expect(tool).toMatchObject({
      name: "Updated CRM Lookup",
      description: "Updated description.",
      handlerMapping: "crm.updatedLookup",
      requiredRole: "SUPER_ADMIN",
      inputSchema: '{"type":"object","properties":{"id":{"type":"string"}}}',
      outputSchema: '{"type":"object","properties":{"ok":{"type":"boolean"}}}',
      sideEffectLevel: "WRITE",
      confirmationRequired: true,
      isActive: false,
      version: 2,
    });
  });

  test("super admins can bind, unbind, and delete tools while cleaning agent bindings", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));

    const { userId, superAdminId, agentId, toolId } = await t.run(async (ctx) => {
      const userId = await ctx.db.insert("users", {
        email: "user@example.com",
        role: "USER",
      });
      const superAdminId = await ctx.db.insert("users", {
        email: "super@example.com",
        role: "SUPER_ADMIN",
      });
      const agentId = await ctx.db.insert("agents", {
        name: "Workflow Agent",
        modelId: "safe-model",
        thinkingMode: false,
        isActive: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const toolId = await ctx.db.insert("aiTools", {
        ...toolInput,
        createdAt: Date.now(),
        createdBy: superAdminId,
      });

      return { userId, superAdminId, agentId, toolId };
    });

    const userClient = t.withIdentity({ subject: userId });
    const superAdminClient = t.withIdentity({ subject: superAdminId });

    await expect(
      userClient.mutation(api.aiTools.toggleAgentTool, {
        agentId,
        toolId,
        action: "BIND",
      })
    ).rejects.toThrow("Unauthorized");

    await superAdminClient.mutation(api.aiTools.toggleAgentTool, {
      agentId,
      toolId,
      action: "BIND",
    });
    await superAdminClient.mutation(api.aiTools.toggleAgentTool, {
      agentId,
      toolId,
      action: "BIND",
    });

    const boundTools = await userClient.query(api.aiTools.getAgentTools, { agentId });
    const bindingsAfterDuplicateBind = await t.run(async (ctx) =>
      ctx.db.query("agentTools").withIndex("by_agent", (q) => q.eq("agentId", agentId)).collect()
    );

    expect(boundTools.map((tool) => tool.name)).toEqual([toolInput.name]);
    expect(bindingsAfterDuplicateBind).toHaveLength(1);

    await superAdminClient.mutation(api.aiTools.toggleAgentTool, {
      agentId,
      toolId,
      action: "UNBIND",
    });

    expect(await userClient.query(api.aiTools.getAgentTools, { agentId })).toEqual([]);

    await superAdminClient.mutation(api.aiTools.toggleAgentTool, {
      agentId,
      toolId,
      action: "BIND",
    });

    await expect(userClient.mutation(api.aiTools.deleteTool, { id: toolId })).rejects.toThrow("Unauthorized");
    await expect(superAdminClient.mutation(api.aiTools.deleteTool, { id: toolId })).resolves.toBe(true);

    const { deletedTool, remainingBindings } = await t.run(async (ctx) => ({
      deletedTool: await ctx.db.get(toolId),
      remainingBindings: await ctx.db.query("agentTools").withIndex("by_tool", (q) => q.eq("toolId", toolId)).collect(),
    }));

    expect(deletedTool).toBeNull();
    expect(remainingBindings).toEqual([]);
  });
});

describe("connector marketplace honesty", () => {
  async function seedAdmin(t: ReturnType<typeof convexTest>) {
    const adminId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
      return await ctx.db.insert("users", {
        email: "admin@acme.test",
        role: "ADMIN",
        companyId,
      });
    });
    return t.withIdentity({ subject: adminId });
  }

  test("reports availability from the handler registry, not the catalogue", async () => {
    // The catalogue advertised 21 connectors while 2 could execute. Availability
    // has to come from whether an implementation exists, because that is the
    // only thing that decides whether a call does anything.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminClient = await seedAdmin(t);

    const marketplace = await adminClient.query(api.aiTools.getConnectorMarketplace, {});
    expect(marketplace.length).toBeGreaterThan(0);

    const knowledge = marketplace.find((connector) => connector.key === "sonae-knowledge");
    expect(knowledge?.availability).toBe("AVAILABLE");
    expect(knowledge?.toolDefinitions.every((tool) => tool.isExecutable)).toBe(true);

    // Something the catalogue declares with nothing behind it must say so.
    const unavailable = marketplace.filter((connector) => connector.availability === "UNAVAILABLE");
    expect(unavailable.length).toBeGreaterThan(0);
    for (const connector of unavailable) {
      expect(connector.executableToolCount).toBe(0);
      expect(connector.toolDefinitions.every((tool) => !tool.isExecutable)).toBe(true);
    }
  });

  test("counts are consistent with the per-tool flags", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminClient = await seedAdmin(t);

    const marketplace = await adminClient.query(api.aiTools.getConnectorMarketplace, {});
    for (const connector of marketplace) {
      const executable = connector.toolDefinitions.filter((tool) => tool.isExecutable).length;
      expect(connector.executableToolCount).toBe(executable);
      expect(connector.totalToolCount).toBe(connector.toolDefinitions.length);
      expect(connector.availability).toBe(
        executable === 0 ? "UNAVAILABLE" : executable === connector.totalToolCount ? "AVAILABLE" : "PARTIAL",
      );
    }
  });

  test("does not claim every declared connector works", async () => {
    // The specific failure this item exists to remove: a catalogue describing
    // capability the code does not have.
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const adminClient = await seedAdmin(t);

    const marketplace = await adminClient.query(api.aiTools.getConnectorMarketplace, {});
    const available = marketplace.filter((connector) => connector.availability === "AVAILABLE");
    expect(available.length).toBeLessThan(marketplace.length);
  });
});
