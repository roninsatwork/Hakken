import { describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import {
  assertCanExecuteTool,
  buildProviderToolDeclaration,
  buildToolFailureResult,
  buildToolResultPayload,
  canExecuteTool,
  executeRegisteredTool,
  getRegisteredToolHandlerMappings,
  isNotImplementedToolResult,
  normalizeToolFunctionName,
  normalizeToolExecutionPolicy,
  normalizeAiRuntimeError,
  parseToolCallPayload,
  parseToolInputSchema,
  validateToolCallArgsAgainstSchema,
  validateToolJsonSchemaString,
} from "./aiToolExecutionService";

describe("ai tool execution service", () => {
  test("normalizes provider function names", () => {
    expect(normalizeToolFunctionName("crm.lookup-account")).toBe("crm_lookup_account");
    expect(normalizeToolFunctionName("123-start")).toBe("_123_start");
    expect(normalizeToolFunctionName("")).toBe("tool");
  });

  test("parses tool input schemas as JSON objects", () => {
    expect(parseToolInputSchema(undefined)).toBeUndefined();
    expect(parseToolInputSchema('{"type":"object","properties":{"id":{"type":"string"}}}')).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(parseToolInputSchema({ type: "object" })).toEqual({ type: "object" });

    expect(() => parseToolInputSchema("[]")).toThrow("Tool input schema must be a JSON object.");
    expect(() => parseToolInputSchema("not json")).toThrow();
  });

  test("validates tool schema contracts before saving", () => {
    expect(validateToolJsonSchemaString('{"type":"object","properties":{"id":{"type":"string"}}}')).toEqual({
      type: "object",
      properties: { id: { type: "string" } },
    });
    expect(validateToolJsonSchemaString(undefined)).toBeUndefined();

    expect(() => validateToolJsonSchemaString('{"type":"array"}')).toThrow('root type "object"');
    expect(() => validateToolJsonSchemaString('{"type":"object","properties":[]}')).toThrow("properties must be a JSON object");
    expect(() => validateToolJsonSchemaString('{"type":"object","required":[1]}')).toThrow("required must be an array of strings");
  });

  test("validates model tool arguments against the saved schema subset", () => {
    const schema = {
      type: "object",
      required: ["accountId", "limit"],
      properties: {
        accountId: { type: "string" },
        limit: { type: "integer" },
        includeClosed: { type: "boolean" },
      },
    };

    expect(
      validateToolCallArgsAgainstSchema({
        schema,
        callArgs: { accountId: "acc_1", limit: 10, includeClosed: false },
      })
    ).toEqual({ ok: true, errors: [] });

    expect(
      validateToolCallArgsAgainstSchema({
        schema,
        callArgs: { accountId: 123, limit: 1.5 },
      })
    ).toEqual({
      ok: false,
      errors: [
        "Tool argument 'accountId' must be a string.",
        "Tool argument 'limit' must be an integer.",
      ],
    });

    expect(
      validateToolCallArgsAgainstSchema({
        schema,
        callArgs: { accountId: "acc_1" },
      })
    ).toEqual({
      ok: false,
      errors: ["Missing required tool argument 'limit'."],
    });
  });

  test("builds provider-neutral tool declarations", () => {
    expect(
      buildProviderToolDeclaration({
        name: "CRM Lookup",
        description: "Look up CRM data.",
        handlerMapping: "crm.lookup-account",
        requiredRole: "ADMIN",
        inputSchema: '{"type":"object"}',
      })
    ).toEqual({
      name: "crm_lookup_account",
      description: "Look up CRM data.",
      parametersJsonSchema: { type: "object" },
    });
  });

  test("guards model tool call payloads", () => {
    expect(parseToolCallPayload({ name: "crm.lookup", callArgs: { id: "abc" } })).toEqual({
      name: "crm_lookup",
      args: { id: "abc" },
    });
    expect(parseToolCallPayload({ name: "crm.lookup" })).toEqual({
      name: "crm_lookup",
      args: {},
    });

    expect(() => parseToolCallPayload({ name: "", callArgs: {} })).toThrow("non-empty string name");
    expect(() => parseToolCallPayload({ name: "crm.lookup", callArgs: [] })).toThrow("args must be a JSON object");
  });

  test("builds normalized tool result payloads", () => {
    expect(buildToolResultPayload({ status: "success", data: { ok: true } })).toEqual({
      status: "success",
      data: { ok: true },
    });

    expect(buildToolResultPayload({ status: "error" })).toEqual({
      status: "error",
      error: "Tool execution failed.",
    });

    expect(buildToolFailureResult(new Error("External connector timed out"))).toEqual({
      status: "error",
      error: "External connector timed out",
    });
  });

  test("enforces tool execution role and tenant boundaries", () => {
    expect(canExecuteTool({ requiredRole: "ADMIN" })).toEqual({
      allowed: false,
      reason: "Tool execution requires an authenticated user.",
    });
    expect(canExecuteTool({ requiredRole: "ADMIN", userRole: "USER" })).toEqual({
      allowed: false,
      reason: "Tool execution requires administrator privileges.",
    });
    /**
     * The oversight roles must be refused here, and this is the test that says
     * so. The check used to name `USER` as the only role it turned away, so the
     * moment a fourth role existed it would have fallen through to the
     * administrator path and been allowed to run tools — including destructive
     * ones — despite existing precisely so its holder could change nothing.
     */
    expect(canExecuteTool({ requiredRole: "ADMIN", userRole: "READ_ONLY", userCompanyId: "a", targetCompanyId: "a" })).toEqual({
      allowed: false,
      reason: "Tool execution requires administrator privileges.",
    });
    expect(canExecuteTool({ requiredRole: "ADMIN", userRole: "AUDITOR", userCompanyId: "a", targetCompanyId: "a" })).toEqual({
      allowed: false,
      reason: "Tool execution requires administrator privileges.",
    });
    expect(canExecuteTool({ requiredRole: "SUPER_ADMIN", userRole: "ADMIN", userCompanyId: "a" })).toEqual({
      allowed: false,
      reason: "Tool execution requires super-admin privileges.",
    });
    expect(canExecuteTool({ requiredRole: "ADMIN", userRole: "ADMIN", userCompanyId: "a", targetCompanyId: "b" })).toEqual({
      allowed: false,
      reason: "Tool execution is not allowed across tenant boundaries.",
    });
    expect(canExecuteTool({ requiredRole: "ADMIN", userRole: "ADMIN", userCompanyId: "a", targetCompanyId: "a" })).toEqual({
      allowed: true,
    });
    expect(canExecuteTool({ requiredRole: "SUPER_ADMIN", userRole: "SUPER_ADMIN", targetCompanyId: "b" })).toEqual({
      allowed: true,
    });

    expect(() => assertCanExecuteTool({ requiredRole: "ADMIN", userRole: "USER" })).toThrow(
      "Tool execution requires administrator privileges."
    );
  });

  test("normalizes tool side-effect policy and requires confirmation for risky tools", () => {
    expect(normalizeToolExecutionPolicy({ requiredRole: "ADMIN" })).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "READ",
      confirmationRequired: false,
    });
    expect(normalizeToolExecutionPolicy({ requiredRole: "ADMIN", sideEffectLevel: "WRITE" })).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "WRITE",
      confirmationRequired: true,
    });
    expect(normalizeToolExecutionPolicy({ requiredRole: "ADMIN", sideEffectLevel: "WRITE", confirmationRequired: false })).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "WRITE",
      confirmationRequired: true,
    });
    expect(normalizeToolExecutionPolicy({ requiredRole: "ADMIN", sideEffectLevel: "DESTRUCTIVE" })).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "DESTRUCTIVE",
      confirmationRequired: true,
    });
    expect(normalizeToolExecutionPolicy({ requiredRole: "SUPER_ADMIN", sideEffectLevel: "EXTERNAL" })).toEqual({
      requiredRole: "SUPER_ADMIN",
      sideEffectLevel: "EXTERNAL",
      confirmationRequired: true,
    });

    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "a",
        sideEffectLevel: "DESTRUCTIVE",
      })
    ).toEqual({
      allowed: false,
      reason: "Tool execution requires explicit user confirmation.",
    });
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "b",
        sideEffectLevel: "DESTRUCTIVE",
      })
    ).toEqual({
      allowed: false,
      reason: "Tool execution is not allowed across tenant boundaries.",
    });
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "a",
        sideEffectLevel: "DESTRUCTIVE",
        confirmationGranted: true,
      })
    ).toEqual({ allowed: true });
  });

  test("an autonomous agent waives confirmation but keeps every other restriction", () => {
    // The normalizer forces confirmationRequired true for anything that is not a
    // plain read and ignores a passed-in false, so autonomy cannot be expressed
    // that way — it would be overruled and an unattended agent would still park
    // on every write.
    expect(
      normalizeToolExecutionPolicy({ requiredRole: "ADMIN", sideEffectLevel: "DESTRUCTIVE", confirmationRequired: false })
    ).toEqual({
      requiredRole: "ADMIN",
      sideEffectLevel: "DESTRUCTIVE",
      confirmationRequired: true,
    });

    // Waived for an admin in their own tenant...
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "a",
        sideEffectLevel: "DESTRUCTIVE",
        autonomous: true,
      })
    ).toEqual({ allowed: true });

    // ...and for a super admin.
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "SUPER_ADMIN",
        sideEffectLevel: "DESTRUCTIVE",
        autonomous: true,
      })
    ).toEqual({ allowed: true });

    // Autonomy removes the human, not the permissions. A tenant boundary still
    // holds, a role requirement still holds, and an unauthenticated caller is
    // still refused — each checked before confirmation is considered.
    expect(
      canExecuteTool({
        requiredRole: "ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        targetCompanyId: "b",
        sideEffectLevel: "DESTRUCTIVE",
        autonomous: true,
      })
    ).toEqual({
      allowed: false,
      reason: "Tool execution is not allowed across tenant boundaries.",
    });
    expect(
      canExecuteTool({
        requiredRole: "SUPER_ADMIN",
        userRole: "ADMIN",
        userCompanyId: "a",
        sideEffectLevel: "DESTRUCTIVE",
        autonomous: true,
      })
    ).toEqual({
      allowed: false,
      reason: "Tool execution requires super-admin privileges.",
    });
    expect(
      canExecuteTool({ requiredRole: "ADMIN", userRole: "USER", autonomous: true })
    ).toEqual({
      allowed: false,
      reason: "Tool execution requires administrator privileges.",
    });
    expect(
      canExecuteTool({ requiredRole: "ADMIN", autonomous: true })
    ).toEqual({
      allowed: false,
      reason: "Tool execution requires an authenticated user.",
    });
  });

  test("normalizes AI runtime errors into stable UI-safe shapes", () => {
    expect(normalizeAiRuntimeError(new Error("Provider unavailable"))).toEqual({
      ok: false,
      error: "Provider unavailable",
    });

    expect(normalizeAiRuntimeError("bad")).toEqual({
      ok: false,
      error: "AI runtime request failed.",
    });

    expect(normalizeAiRuntimeError("bad", "Provider call failed.")).toEqual({
      ok: false,
      error: "Provider call failed.",
    });
  });

  test("the registry lists only handlers that actually do something", () => {
    // It used to include five stubs that returned a "not implemented" payload,
    // so the registry could not be used to answer "does this connector work?".
    // Everything unbuilt is now absent from it, which is what lets the
    // marketplace derive availability instead of keeping a parallel list.
    expect(getRegisteredToolHandlerMappings()).toEqual([
      // Reads the Apify catalogue so a job's settings never have to be typed
      // into an agent's instructions by hand.
      "apify.actor.describe",
      // Runs an Apify job the admin has configured.
      "apify.actor.run",
      "company.overview.update",
      "http.request",
      "knowledge.search",
      "marketDiscovery.groups.record",
      "marketDiscovery.groups.review",
      "marketDiscovery.job.next",
      "marketDiscovery.locations.read",
      "marketDiscovery.locations.record",
      "notification.send",
      // The opportunity report's three passes, in their fixed order: price the
      // prospects, find the chain gaps, then save the agent's summary — which
      // is refused if it names a figure the computed sections do not hold.
      "opportunityReport.findGroupGaps",
      "opportunityReport.matchProspects",
      "opportunityReport.saveSummary",
      // Hands a run its next piece of work from the research job's queue, and
      // closes off the last one. The only tool that knows a job exists.
      "salesCustomers.job.next",
      // Reads a group and the sites in it already supplied, so the prospecting
      // half does not re-report the customers it was told about.
      "salesCustomers.prospects.read",
      // Files a site found in a group. It can only write a prospect, and a site
      // that is already a customer is refused rather than merged.
      "salesCustomers.prospects.record",
      // Reads one customer and says which of their details are still missing.
      "salesCustomers.research.read",
      // Records one detail the research agent found, with the page it came
      // from. Whether that detail reaches the customer record is decided in
      // code, not by the agent.
      "salesCustomers.research.record",
      // Writes the board report from the agent's own knowledge and memory —
      // the one way a scheduled agent run ends in a saved report.
      "salesReports.generate",
      // Hands a job to a person, so a finding does not die in a run log
      // nobody returns to. A WRITE, so it needs approval unless the agent
      // has been given autonomy deliberately.
      "task.create",
      // Reads a web page. The first handler here that reaches outside the
      // platform rather than into our own database.
      "web.scrape",
    ]);
  });

  describe("reading a page", () => {
    /**
     * The setting had been read as a string only, so a model that sent the
     * boolean `false` — which is what a boolean field in the schema invites —
     * silently got the default back. It was found against the Care Quality
     * Commission register, where the list of a provider's homes sits outside
     * the main article and is dropped unless this is off. The tool reported
     * success and returned a page with no homes on it.
     */
    const scrapeWith = async (args: Record<string, unknown>) => {
      const runAction = vi.fn().mockResolvedValue({ status: "success" });
      await executeRegisteredTool({
        ctx: { runQuery: vi.fn(), runMutation: vi.fn(), runAction },
        handlerMapping: "web.scrape",
        args: { url: "https://www.cqc.org.uk/provider/1-101657781/services", ...args },
        companyId: "company_1" as never,
        userId: "user_1" as never,
      });
      return runAction.mock.calls[0]?.[1] as Record<string, unknown>;
    };

    test("a boolean false reaches the fetcher", async () => {
      expect(await scrapeWith({ mainContentOnly: false })).toMatchObject({
        mainContentOnly: false,
      });
    });

    test("the string form still works", async () => {
      expect(await scrapeWith({ mainContentOnly: "false" })).toMatchObject({
        mainContentOnly: false,
      });
      expect(await scrapeWith({ mainContentOnly: "true" })).toMatchObject({
        mainContentOnly: true,
      });
    });

    test("leaving it out leaves the default alone", async () => {
      expect(await scrapeWith({})).not.toHaveProperty("mainContentOnly");
    });

    test("something unreadable is treated as not asked for", async () => {
      expect(await scrapeWith({ mainContentOnly: "perhaps" })).not.toHaveProperty(
        "mainContentOnly"
      );
    });
  });

  test("an agent can look a job up instead of being told its settings", async () => {
    const runAction = vi.fn().mockResolvedValue({ matches: [] });

    await executeRegisteredTool({
      ctx: { runQuery: vi.fn(), runMutation: vi.fn(), runAction },
      handlerMapping: "apify.actor.describe",
      args: { search: "rightmove property listings" },
      companyId: "company_1" as never,
      userId: "user_1" as never,
    });

    // Searching by name, because an agent asked to collect from Rightmove has
    // a name and not an id.
    expect(runAction).toHaveBeenCalledWith(
      expect.anything(),
      { search: "rightmove property listings" }
    );

    runAction.mockClear();
    await executeRegisteredTool({
      ctx: { runQuery: vi.fn(), runMutation: vi.fn(), runAction },
      handlerMapping: "apify.actor.describe",
      args: { job: "apify/web-scraper" },
      companyId: "company_1" as never,
      userId: "user_1" as never,
    });

    expect(runAction).toHaveBeenCalledWith(
      expect.anything(),
      { actorId: "apify/web-scraper" }
    );
  });

  test("an Apify job runs whichever job the agent names, with its settings", async () => {
    const runAction = vi.fn().mockResolvedValue("apify_run_1");

    await executeRegisteredTool({
      ctx: { runQuery: vi.fn(), runMutation: vi.fn(), runAction },
      handlerMapping: "apify.actor.run",
      args: { job: "apify/website-content-crawler", settings: '{"startUrls":["https://example.com"]}' },
      companyId: "company_1" as never,
      userId: "user_1" as never,
    });

    // One installed tool, any job on Apify. The account token never travels
    // through the model — it is read where the job is started.
    expect(runAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actorId: "apify/website-content-crawler",
        inputJson: '{"startUrls":["https://example.com"]}',
        startedBy: "user_1",
      })
    );
  });

  test("an Apify job says it has only started, not finished", async () => {
    const runAction = vi.fn().mockResolvedValue("apify_run_2");

    const result = await executeRegisteredTool({
      ctx: { runQuery: vi.fn(), runMutation: vi.fn(), runAction },
      handlerMapping: "apify.actor.run",
      args: { job: "apify/web-scraper", settings: "{}" },
      companyId: "company_1" as never,
      userId: "user_1" as never,
    });

    // Results arrive by webhook minutes later. An agent told "done" would go on
    // to summarise items that do not exist yet.
    expect(result).toMatchObject({ started: true, runId: "apify_run_2" });
    expect(JSON.stringify(result)).toContain("not available in this reply");
  });

  test("an Apify job refuses to run with nobody to trace it to", async () => {
    const runAction = vi.fn();

    await expect(
      executeRegisteredTool({
        ctx: { runQuery: vi.fn(), runMutation: vi.fn(), runAction },
        handlerMapping: "apify.actor.run",
        args: { job: "apify/web-scraper", settings: "{}" },
        companyId: "company_1" as never,
      })
    ).rejects.toThrow("started by a person");

    expect(runAction).not.toHaveBeenCalled();
  });

  test("dispatches knowledge search through the registered read handler", async () => {
    const result = { matches: [], query: "pipeline risk" };
    const runQuery = vi.fn().mockResolvedValue(result);
    const runMutation = vi.fn();

    await expect(
      executeRegisteredTool({
        ctx: { runQuery, runMutation, runAction: vi.fn() },
        handlerMapping: "knowledge.search",
        args: { query: " pipeline risk ", limit: 3 },
        agentId: "agent_1" as never,
        companyId: "company_1" as never,
        fallbackQuery: "fallback query",
      })
    ).resolves.toBe(result);

    expect(runQuery).toHaveBeenCalledWith(internal.aiToolReadTools.searchKnowledge, {
      query: "pipeline risk",
      agentId: "agent_1",
      companyId: "company_1",
      limit: 3,
    });
    expect(runMutation).not.toHaveBeenCalled();
  });

  test("dispatches company overview updates through the registered write handler", async () => {
    const result = { changed: true, overview: "New overview" };
    const runQuery = vi.fn();
    const runMutation = vi.fn().mockResolvedValue(result);

    await expect(
      executeRegisteredTool({
        ctx: { runQuery, runMutation, runAction: vi.fn() },
        handlerMapping: "company.overview.update",
        args: { overview: " New overview ", idempotencyKey: "run-1:overview" },
        companyId: "company_1" as never,
        userId: "user_1" as never,
        runId: "run_1" as never,
        toolCallId: "tool_call_1" as never,
      })
    ).resolves.toBe(result);

    expect(runMutation).toHaveBeenCalledWith(internal.aiToolWriteTools.updateCompanyOverview, {
      companyId: "company_1",
      actorId: "user_1",
      overview: "New overview",
      runId: "run_1",
      toolCallId: "tool_call_1",
      idempotencyKey: "run-1:overview",
    });
    expect(runQuery).not.toHaveBeenCalled();
  });

  /**
   * A typo or a hand-written tool row pointing nowhere used to throw, while a
   * declared-but-unbuilt connector reported itself. The distinction was not
   * worth the risk: it meant removing something from the catalogue turned every
   * tool already installed from it into a hard failure. Both now report, and the
   * message names whatever it can.
   */
  test("a handler mapping nothing declares reports rather than throwing", async () => {
    const result = await executeRegisteredTool({
      ctx: { runQuery: vi.fn(), runMutation: vi.fn(), runAction: vi.fn() },
      handlerMapping: "crm.lookup",
      args: {},
    });

    expect(isNotImplementedToolResult(result)).toBe(true);
    expect(result).toMatchObject({
      handlerMapping: "crm.lookup",
      message: "crm.lookup cannot run: nothing implements it on this deployment.",
    });
  });

  test("a tool nothing implements reports itself, without throwing", async () => {
    // Reported rather than thrown so the runtime can record it as
    // NOT_IMPLEMENTED and tell the model plainly, instead of it looking like a
    // runtime fault the agent might sensibly retry.
    const runQuery = vi.fn();
    const runMutation = vi.fn();

    const result = await executeRegisteredTool({
      ctx: { runQuery, runMutation, runAction: vi.fn() },
      handlerMapping: "jira.issues.search",
      args: { query: "open bugs" },
    });

    expect(isNotImplementedToolResult(result)).toBe(true);
    expect(runQuery).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });

  /**
   * A tool row can outlive the thing that declared it — seventeen connectors
   * nobody had built were removed from the catalogue, and any tool already
   * installed from one of them is still in the database and still bindable. It
   * has to fail the same safe way, not throw.
   */
  test("a tool left behind by a removed connector fails safely without side effects", async () => {
    const runQuery = vi.fn();
    const runMutation = vi.fn();

    await expect(
      executeRegisteredTool({
        ctx: { runQuery, runMutation, runAction: vi.fn() },
        handlerMapping: "slack.message.send",
        args: { channel: "sales", text: "hello" },
        companyId: "company_1" as never,
      })
    ).resolves.toEqual({
      ok: false,
      status: "not_implemented",
      connectorName: undefined,
      handlerMapping: "slack.message.send",
      companyId: "company_1",
      message: "slack.message.send cannot run: nothing implements it on this deployment.",
    });
    expect(runQuery).not.toHaveBeenCalled();
    expect(runMutation).not.toHaveBeenCalled();
  });
});
