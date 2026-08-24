import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

/**
 * Connections that are really checked (seven-gaps plan, phase 2; test debt
 * paid under foundation-quality plan, phase 1.3). The probes contact the
 * other side for real, so every verdict here is about honest reporting: a
 * mailbox that cannot answer is recorded broken with its reason, a phone
 * account's suspension is not read as health, and a connection nothing has
 * checked never wears a green light it has not earned. Networks are stubbed
 * at the fetch boundary, the way the gmail connector tests do.
 */

function setup() {
  return convexTest(schema, import.meta.glob("./**/*.*s"));
}

type ConnectorOverrides = Partial<{
  key: string;
  name: string;
  category: "EMAIL" | "VOICE" | "KNOWLEDGE";
  isActive: boolean;
  authConnectionStatus: "NOT_CONNECTED" | "PENDING" | "CONNECTED" | "ERROR";
  authAccountRef: string;
}>;

async function seedConnector(t: ReturnType<typeof setup>, overrides: ConnectorOverrides = {}) {
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("toolConnectors", {
      key: overrides.key ?? "google-gmail",
      name: overrides.name ?? "Gmail",
      description: "seeded for probe tests",
      category: overrides.category ?? "EMAIL",
      authMode: "OAUTH",
      tenantAvailability: "TENANT_RESTRICTED",
      installStatus: "INSTALLED",
      isActive: overrides.isActive ?? true,
      authConnectionStatus: overrides.authConnectionStatus,
      authAccountRef: overrides.authAccountRef,
      createdAt: now,
      updatedAt: now,
    })
  );
}

async function seedSuperAdmin(t: ReturnType<typeof setup>, email = "super@probes.test") {
  return await t.run(async (ctx) => ctx.db.insert("users", { email, role: "SUPER_ADMIN" }));
}

async function readConnector(t: ReturnType<typeof setup>, id: Id<"toolConnectors">) {
  return await t.run(async (ctx) => ctx.db.get(id));
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("choosing what to probe", () => {
  test("only active connected mailboxes, active phone lines, and enabled providers are targets", async () => {
    const t = setup();
    const now = Date.now();
    const connected = await seedConnector(t, {
      name: "Working inbox",
      authConnectionStatus: "CONNECTED",
    });
    // Active but never connected: there is no mailbox to ask.
    await seedConnector(t, { name: "Unconnected inbox", authConnectionStatus: "NOT_CONNECTED" });
    // Connected but switched off: probing it would report on a thing nobody uses.
    await seedConnector(t, {
      name: "Disabled inbox",
      authConnectionStatus: "CONNECTED",
      isActive: false,
    });
    const phone = await seedConnector(t, {
      key: "twilio-voice",
      name: "Phone line",
      category: "VOICE",
      authAccountRef: "+441onenumber",
    });
    await t.run(async (ctx) => {
      await ctx.db.insert("aiProviders", {
        providerKey: "anthropic",
        displayName: "Anthropic",
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "openai",
        displayName: "OpenAI",
        isEnabled: false,
        createdAt: now,
        updatedAt: now,
      });
    });

    const targets = await t.query(internal.connectionProbes.listProbeTargetsInternal, {});
    expect(targets.mailboxes).toEqual([{ connectorId: connected, name: "Working inbox" }]);
    expect(targets.phoneLines).toEqual([
      { connectorId: phone, name: "Phone line", number: "+441onenumber" },
    ]);
    expect(targets.providerKeys).toEqual(["anthropic"]);
  });
});

describe("recording a probe", () => {
  test("stamps the verdict and truncates a runaway message to 300 characters", async () => {
    const t = setup();
    const connectorId = await seedConnector(t, { authConnectionStatus: "CONNECTED" });
    const before = Date.now();
    await t.mutation(internal.connectionProbes.recordConnectorProbeInternal, {
      connectorId,
      ok: false,
      message: "x".repeat(400),
    });
    const row = await readConnector(t, connectorId);
    expect(row?.lastProbeOk).toBe(false);
    expect(row?.lastProbeMessage).toHaveLength(300);
    expect(row?.lastProbeAt).toBeGreaterThanOrEqual(before);
  });
});

describe("probing the mailbox", () => {
  test("a mailbox that cannot answer is recorded broken with the reason, not skipped", async () => {
    const t = setup();
    // Marked CONNECTED but with no OAuth token rows behind it — the shape a
    // revoked or half-torn-down connection leaves in the database.
    const connectorId = await seedConnector(t, { authConnectionStatus: "CONNECTED" });

    await t.action(internal.connectionProbes.probeConnections, {});

    const row = await readConnector(t, connectorId);
    expect(row?.lastProbeOk).toBe(false);
    expect(row?.lastProbeAt).toBeGreaterThan(0);
    // The reason travels to the row: a bare false would send whoever reads
    // the screen off to reproduce the failure by hand.
    expect(row?.lastProbeMessage?.length).toBeGreaterThan(0);
  });
});

describe("probing the phone line", () => {
  function stubTwilioEnv() {
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "token-abc");
  }

  test("classifies the account's answer honestly: active, suspended, refused, unreachable", async () => {
    const t = setup();
    stubTwilioEnv();
    const connectorId = await seedConnector(t, {
      key: "twilio-voice",
      name: "Phone line",
      category: "VOICE",
    });

    // An account in good standing is working.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toContain("AC123");
        expect(String((init?.headers as Record<string, string>).Authorization)).toMatch(/^Basic /);
        return Response.json({ status: "active" });
      })
    );
    await t.action(internal.connectionProbes.probeConnections, {});
    let row = await readConnector(t, connectorId);
    expect(row?.lastProbeOk).toBe(true);
    expect(row?.lastProbeMessage).toBe("The phone provider answered. Account is active.");

    // A suspended account answered the API perfectly — and must still read
    // as broken, because it cannot take a call.
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ status: "suspended" })));
    await t.action(internal.connectionProbes.probeConnections, {});
    row = await readConnector(t, connectorId);
    expect(row?.lastProbeOk).toBe(false);
    expect(row?.lastProbeMessage).toBe("The phone provider answered. Account is suspended.");

    // A refusal carries the status code, not a guess.
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no", { status: 401 })));
    await t.action(internal.connectionProbes.probeConnections, {});
    row = await readConnector(t, connectorId);
    expect(row?.lastProbeOk).toBe(false);
    expect(row?.lastProbeMessage).toBe("The phone provider answered 401.");

    // A dead network is a failed probe with its error, not an unhandled throw.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hung up");
      })
    );
    await t.action(internal.connectionProbes.probeConnections, {});
    row = await readConnector(t, connectorId);
    expect(row?.lastProbeOk).toBe(false);
    expect(row?.lastProbeMessage).toBe("socket hung up");
  });

  test("without a Twilio account id the line is left unstamped rather than guessed at", async () => {
    const t = setup();
    vi.stubEnv("TWILIO_ACCOUNT_SID", "");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "");
    const connectorId = await seedConnector(t, {
      key: "twilio-voice",
      name: "Phone line",
      category: "VOICE",
    });
    const fetchSpy = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetchSpy);

    await t.action(internal.connectionProbes.probeConnections, {});

    const row = await readConnector(t, connectorId);
    expect(row?.lastProbeAt).toBeUndefined();
    expect(row?.lastProbeOk).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("the connections screen", () => {
  test("an unchecked connection says why nothing is being checked, and the phone row reports its last call", async () => {
    const t = setup();
    const superAdminId = await seedSuperAdmin(t);
    await seedConnector(t, {
      name: "Fresh inbox",
      isActive: false,
      authConnectionStatus: "NOT_CONNECTED",
    });
    await seedConnector(t, {
      name: "Parked inbox",
      isActive: false,
      authConnectionStatus: "CONNECTED",
    });
    await seedConnector(t, { key: "twilio-voice", name: "Phone line", category: "VOICE" });
    const callAt = Date.now() - 600_000;
    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Probe Co",
        createdAt: Date.now(),
      });
      await ctx.db.insert("phoneCalls", {
        companyId,
        providerCallId: "CA-1",
        fromNumber: "+441234567890",
        toNumber: "+440987654321",
        status: "COMPLETED",
        turns: [],
        startedAt: callAt,
      });
    });

    const rows = await t
      .withIdentity({ subject: superAdminId })
      .query(api.connectionProbes.listConnections, {});

    const fresh = rows.find((row) => row.name === "Fresh inbox");
    // "No inbox is connected" must never look like "the inbox is fine".
    expect(fresh).toMatchObject({
      working: null,
      detail: "Not connected yet — nothing to check.",
      checkedAt: null,
    });

    const parked = rows.find((row) => row.name === "Parked inbox");
    expect(parked).toMatchObject({
      working: null,
      detail: "Switched off, so nothing is being checked.",
    });

    const phone = rows.find((row) => row.kind === "PHONE");
    // No account id means no live check exists; the row says so and leans on
    // the line's own traffic as the witness.
    expect(phone?.detail).toBe(
      "No account id is set for a live check, so this row reports the last call received."
    );
    expect(phone?.lastHeardAt).toBe(callAt);
  });

  test("provider verdicts map status to working, read the health message, survive bad JSON — broken rows first", async () => {
    const t = setup();
    const superAdminId = await seedSuperAdmin(t);
    const now = Date.now();
    await t.run(async (ctx) => {
      await ctx.db.insert("aiProviders", {
        providerKey: "anthropic",
        displayName: "Anthropic",
        isEnabled: true,
        status: "healthy",
        lastHealthCheckAt: now - 1000,
        settings: JSON.stringify({ lastHealthMessage: "All models answered." }),
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "openai",
        displayName: "OpenAI",
        isEnabled: true,
        status: "error",
        // Corrupt settings must degrade to the default detail, not throw.
        settings: "{not json",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "openrouter",
        displayName: "OpenRouter",
        isEnabled: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("aiProviders", {
        providerKey: "google-vertex",
        displayName: "Vertex",
        isEnabled: false,
        createdAt: now,
        updatedAt: now,
      });
    });

    const rows = await t
      .withIdentity({ subject: superAdminId })
      .query(api.connectionProbes.listConnections, {});

    // A disabled provider is not a connection the platform depends on.
    expect(rows.map((row) => row.name)).toEqual(["OpenAI", "OpenRouter", "Anthropic"]);
    expect(rows[0]).toMatchObject({ working: false, detail: "Waiting for the first check." });
    expect(rows[1]).toMatchObject({ working: null });
    expect(rows[2]).toMatchObject({
      working: true,
      detail: "All models answered.",
      checkedAt: now - 1000,
    });
  });

  test("a company admin cannot read the platform's connection health", async () => {
    const t = setup();
    const adminId = await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", {
        name: "Probe Co",
        createdAt: Date.now(),
      });
      return await ctx.db.insert("users", {
        email: "admin@probes.test",
        role: "ADMIN",
        companyId,
      });
    });
    await expect(
      t.withIdentity({ subject: adminId }).query(api.connectionProbes.listConnections, {})
    ).rejects.toThrow("Unauthorized access to platform maintenance");
  });
});

/**
 * Tool servers on the Connections screen (tool-server plan, phase 7).
 *
 * A workspace's connected servers belong here for the same reason a mailbox
 * does: this is where a person looks when something has stopped working, and a
 * server that has gone quiet must not be discoverable only on its own page.
 *
 * The witness is the last discovery, because that is the only moment the
 * platform genuinely contacts one — the same distinction the connector rows
 * draw between "configured" and "answering".
 */
describe("tool servers on the connections list", () => {
  async function seedServer(
    t: ReturnType<typeof setup>,
    overrides: Partial<{
      name: string;
      status: "CONNECTED" | "DISABLED" | "ERROR";
      lastDiscoveryOk: boolean;
      lastDiscoveryMessage: string;
      lastDiscoveryAt: number;
    }> = {},
  ) {
    const companyId = await t.run(async (ctx) =>
      await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() }));

    return await t.run(async (ctx) => await ctx.db.insert("mcpServers", {
      companyId,
      name: overrides.name ?? "Finance",
      url: "https://finance.example.com/mcp",
      authMode: "NONE",
      status: overrides.status ?? "CONNECTED",
      ...(overrides.lastDiscoveryOk !== undefined ? { lastDiscoveryOk: overrides.lastDiscoveryOk } : {}),
      ...(overrides.lastDiscoveryMessage ? { lastDiscoveryMessage: overrides.lastDiscoveryMessage } : {}),
      ...(overrides.lastDiscoveryAt ? { lastDiscoveryAt: overrides.lastDiscoveryAt } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));
  }

  const listAs = async (t: ReturnType<typeof setup>) => {
    const superAdminId = await seedSuperAdmin(t, "servers@probes.test");
    return await t.withIdentity({ subject: superAdminId })
      .query(api.connectionProbes.listConnections, {});
  };

  test("a working server is listed with what the last check found", async () => {
    const t = setup();
    await seedServer(t, {
      lastDiscoveryOk: true,
      lastDiscoveryMessage: "Found 3 tools.",
      lastDiscoveryAt: 1_700_000_000_000,
    });

    const row = (await listAs(t)).find((entry) => entry.kind === "TOOL_SERVER");
    expect(row).toMatchObject({
      name: "Finance",
      working: true,
      detail: "Found 3 tools.",
      checkedAt: 1_700_000_000_000,
    });
  });

  test("a server that failed its last check needs attention, with the reason", async () => {
    const t = setup();
    await seedServer(t, {
      status: "ERROR",
      lastDiscoveryOk: false,
      lastDiscoveryMessage: "The server did not answer within 15 seconds.",
    });

    const row = (await listAs(t)).find((entry) => entry.kind === "TOOL_SERVER");
    expect(row?.working).toBe(false);
    expect(row?.detail).toContain("did not answer");
  });

  test("a server nothing has checked never wears a light it has not earned", async () => {
    const t = setup();
    await seedServer(t);

    const row = (await listAs(t)).find((entry) => entry.kind === "TOOL_SERVER");
    expect(row?.working).toBeNull();
    expect(row?.checkedAt).toBeNull();
  });

  test("a switched-off server is listed, and says why nothing is being checked", async () => {
    // Hiding it would make "no server is connected" look exactly like
    // "the server is fine", which is the failure this screen exists to prevent.
    const t = setup();
    await seedServer(t, { status: "DISABLED", lastDiscoveryOk: true });

    const row = (await listAs(t)).find((entry) => entry.kind === "TOOL_SERVER");
    expect(row?.working).toBeNull();
    expect(row?.detail).toContain("Switched off");
  });

  test("a broken server sorts above a working one", async () => {
    // This screen is scanned in a hurry. Rows that need a person must never be
    // below the fold.
    const t = setup();
    await seedServer(t, { name: "Warehouse", lastDiscoveryOk: true });
    await seedServer(t, { name: "Finance", status: "ERROR", lastDiscoveryOk: false });

    const names = (await listAs(t))
      .filter((entry) => entry.kind === "TOOL_SERVER")
      .map((entry) => entry.name);
    expect(names).toEqual(["Finance", "Warehouse"]);
  });
});
