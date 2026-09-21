import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { DEFAULT_COMPANY_MODULE_KEYS } from "./utils/coreModules";
import { MCP_PROTOCOL_VERSION } from "./mcpProtocol";

vi.mock("./utils/safeWorkflowHttp", async original => {
  const actual = await original<typeof import("./utils/safeWorkflowHttp")>();
  return { ...actual, fetchWorkflowAction: (url: string, options: RequestInit, dependencies: object) =>
    actual.fetchWorkflowAction(url, options, { ...dependencies,
      fetchImplementation: (input, init) => fetch(input, init),
      resolveHostname: async () => [{ address: "93.184.216.34" }],
    }) };
});

/**
 * Contacting a tool server, and what happens when it misbehaves.
 *
 * The network is stubbed rather than mocked away: each test scripts a server
 * that answers in a particular way, which is the only honest way to prove that a
 * timeout, a redirect, a refusal or a hostile tool list each end somewhere sane.
 *
 * The thing every test here is really checking is that **a failure is recorded,
 * not thrown**. A server going down is an ordinary Tuesday, and the screen needs
 * to say what happened rather than showing a spinner forever.
 */

const SERVER_URL = "https://tools.example.com/mcp";

type Reply = { status?: number; contentType?: string; body?: string; headers?: Record<string, string> };

/**
 * Script a server's answers in order.
 *
 * The handshake costs two calls before anything interesting happens, so most
 * tests begin with `greeting()` and then say what the tool list does.
 */
function stubServer(replies: Reply[]) {
  let call = 0;
  const seen: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];

  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    const reply = replies[Math.min(call, replies.length - 1)];
    call += 1;
    seen.push({
      url,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: JSON.parse(String(init.body ?? "{}")),
    });

    return new Response(reply.body ?? "", {
      status: reply.status ?? 200,
      headers: {
        "Content-Type": reply.contentType ?? "application/json",
        ...(reply.headers ?? {}),
      },
    });
  }));

  return { seen };
}

const greeting = (): Reply => ({
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: "Acme Tools", version: "1.0.0" },
    },
  }),
  headers: { "Mcp-Session-Id": "session-abc" },
});

/** The 202 a server owes the `initialized` notification. */
const accepted = (): Reply => ({ status: 202 });

const toolsPage = (id: number, tools: unknown[], nextCursor?: string): Reply => ({
  body: JSON.stringify({ jsonrpc: "2.0", id, result: { tools, ...(nextCursor ? { nextCursor } : {}) } }),
});

const invoiceTool = {
  name: "get_invoice",
  description: "Fetch one invoice.",
  inputSchema: { type: "object", properties: { id: { type: "string" } } },
};

async function setup() {
  const t = convexTest(schema, import.meta.glob("./**/*.*s"));

  const companyAId = await t.run(async (ctx) =>
    await ctx.db.insert("companies", {
      name: "Company A", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
    }));
  const companyBId = await t.run(async (ctx) =>
    await ctx.db.insert("companies", {
      name: "Company B", createdAt: Date.now(), enabledModules: [...DEFAULT_COMPANY_MODULE_KEYS],
    }));

  const adminAId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { email: "a@test.com", role: "ADMIN", companyId: companyAId }));
  const adminBId = await t.run(async (ctx) =>
    await ctx.db.insert("users", { email: "b@test.com", role: "ADMIN", companyId: companyBId }));

  const adminA = t.withIdentity({ subject: adminAId });
  const adminB = t.withIdentity({ subject: adminBId });

  const serverId = await adminA.mutation(api.mcpServers.createServer, {
    name: "Finance", url: SERVER_URL, authMode: "NONE",
  });

  return { t, adminA, adminB, serverId };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("discovering what a server offers", () => {
  test("records the tools a server lists", async () => {
    const { t, adminA, serverId } = await setup();
    stubServer([greeting(), accepted(), toolsPage(2, [invoiceTool])]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    expect(outcome.ok).toBe(true);
    expect(outcome.toolCount).toBe(1);

    const stored = await t.run(async (ctx) =>
      await ctx.db.query("mcpServerTools").collect());
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("get_invoice");
    expect(stored[0].companyId).toBeDefined();

    const server = await adminA.query(api.mcpServers.getServer, { id: serverId });
    expect(server.lastDiscoveryOk).toBe(true);
    expect(server.discoveredToolCount).toBe(1);
    expect(server.serverLabel).toBe("Acme Tools");
  });

  test("sends the headers the transport requires", async () => {
    const { adminA, serverId } = await setup();
    const { seen } = stubServer([greeting(), accepted(), toolsPage(2, [invoiceTool])]);

    await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    // A client must accept both answer shapes, or a server streaming its reply
    // is entitled to refuse.
    expect(seen[0].headers.Accept).toContain("application/json");
    expect(seen[0].headers.Accept).toContain("text/event-stream");

    // The session and protocol headers are owed on everything after the
    // handshake. Without them a stateful server answers 400.
    expect(seen[2].headers["Mcp-Session-Id"]).toBe("session-abc");
    expect(seen[2].headers["MCP-Protocol-Version"]).toBe(MCP_PROTOCOL_VERSION);
  });

  test("follows the list across pages", async () => {
    const { t, adminA, serverId } = await setup();
    stubServer([
      greeting(),
      accepted(),
      toolsPage(2, [invoiceTool], "page-2"),
      toolsPage(3, [{ ...invoiceTool, name: "list_invoices" }]),
    ]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    expect(outcome.toolCount).toBe(2);
    const stored = await t.run(async (ctx) => await ctx.db.query("mcpServerTools").collect());
    expect(stored.map((row) => row.name).sort()).toEqual(["get_invoice", "list_invoices"]);
  });

  test("replaces the previous list rather than accumulating stale tools", async () => {
    // A tool the server has stopped offering must disappear, or an agent keeps a
    // binding to something with nowhere to send it.
    const { t, adminA, serverId } = await setup();

    stubServer([greeting(), accepted(), toolsPage(2, [invoiceTool])]);
    await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    vi.unstubAllGlobals();
    stubServer([greeting(), accepted(), toolsPage(2, [{ ...invoiceTool, name: "something_else" }])]);
    await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    const stored = await t.run(async (ctx) => await ctx.db.query("mcpServerTools").collect());
    expect(stored.map((row) => row.name)).toEqual(["something_else"]);
  });

  test("reports how many tools the server described badly", async () => {
    const { adminA, serverId } = await setup();
    stubServer([greeting(), accepted(), toolsPage(2, [invoiceTool, { name: "no schema here" }])]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    expect(outcome.toolCount).toBe(1);
    expect(outcome.message).toContain("1 were ignored");
  });
});

describe("when a server misbehaves", () => {
  test("a refusal is recorded, not thrown", async () => {
    const { adminA, serverId } = await setup();
    stubServer([{
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32600, message: "Nope" } }),
    }]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("Nope");

    const server = await adminA.query(api.mcpServers.getServer, { id: serverId });
    expect(server.lastDiscoveryOk).toBe(false);
    // A server that would not answer is not connected, whatever it said before.
    expect(server.status).toBe("ERROR");
  });

  test("a redirect is refused rather than followed", async () => {
    // Following one would forward the request, and any credential with it,
    // somewhere the administrator never named.
    const { adminA, serverId } = await setup();
    stubServer([{ status: 302, headers: { Location: "https://elsewhere.example.com/" } }]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("redirects are not allowed");
  });

  test("a server speaking an unsupported version is refused by name", async () => {
    const { adminA, serverId } = await setup();
    stubServer([{
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        result: { protocolVersion: "1999-01-01", capabilities: { tools: {} } },
      }),
    }]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });
    expect(outcome.message).toContain("1999-01-01");
  });

  test("a server offering no tools says so, rather than failing obscurely", async () => {
    const { adminA, serverId } = await setup();
    stubServer([{
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1,
        result: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { resources: {} } },
      }),
    }]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });
    expect(outcome.message).toBe("This server does not offer any tools.");
  });

  test("an unreachable server is recorded, not thrown", async () => {
    const { adminA, serverId } = await setup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNREFUSED"); }));

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("could not be reached");
  });

  test("an HTML error page from a proxy does not become a tool list", async () => {
    const { adminA, serverId } = await setup();
    stubServer([{ contentType: "text/html", body: "<html>502 Bad Gateway</html>" }]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });
    expect(outcome.ok).toBe(false);
  });

  test("a server that always returns a cursor is cut short rather than looping", async () => {
    const { adminA, serverId } = await setup();
    let id = 2;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body ?? "{}"));
      if (body.method === "initialize") return new Response(greeting().body, {
        status: 200, headers: { "Content-Type": "application/json" },
      });
      if (!body.id) return new Response("", { status: 202 });
      const page = JSON.stringify({
        jsonrpc: "2.0", id: id++, result: { tools: [], nextCursor: "always-more" },
      });
      return new Response(page.replace(/"id":\d+/, `"id":${body.id}`), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }));

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("cut short");
  });
});

describe("the company boundary", () => {
  test("one company cannot discover against another's server", async () => {
    const { adminB, serverId } = await setup();
    stubServer([greeting(), accepted(), toolsPage(2, [invoiceTool])]);

    await expect(adminB.action(api.mcpDiscovery.discoverServerTools, { serverId }))
      .rejects.toThrowError(/does not exist/);
  });

  test("discovered tools carry the owning company, not the caller's guess", async () => {
    const { t, adminA, serverId } = await setup();
    stubServer([greeting(), accepted(), toolsPage(2, [invoiceTool])]);

    await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    const [tool] = await t.run(async (ctx) => await ctx.db.query("mcpServerTools").collect());
    const server = await t.run(async (ctx) => await ctx.db.get(serverId));
    expect(tool.companyId).toBe(server?.companyId);
  });

  test("an unapproved credential is refused before any request", async () => {
    const { t, adminA, serverId } = await setup();
    await adminA.mutation(api.mcpServers.updateServer, {
      id: serverId, authMode: "SECRET_REF", secretRef: "vault/acme/mcp",
    });
    stubServer([greeting(), accepted(), toolsPage(2, [invoiceTool])]);

    const outcome = await adminA.action(api.mcpDiscovery.discoverServerTools, { serverId });

    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("MCP_CREDENTIAL_BINDINGS");
    // Nothing was contacted, so nothing was stored.
    expect(await t.run(async (ctx) => await ctx.db.query("mcpServerTools").collect())).toHaveLength(0);
  });
});
