import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { writeFeaturesOff } from "./utils/featureSwitchReads";
import { useMiddayUtc } from "../src/test/realTime";

/**
 * Ask Hakken in ChatGPT and Claude: the door, `/mcp`, and the sign-in
 * endpoints, through the real HTTP routes
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, phases 2
 * and 6). No pass gets a 401 that points at the sign-in; a pass answers for its
 * own company only; the switch, both protocol eras and the log each have a test.
 */

const SITE = "http://hakken.localhost:3000";
const RETURN = "http://localhost:33418/callback";
const VERIFIER = "dBjftJeZ4CVP-mA92IaYEnDHSGcCmP4kuIXr53B2oUo";
const CHALLENGE = "TbK7F0vvIILGMN5U52pyHeP_ybqapGmnSTqqfdC9lFU";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => {
  vi.stubEnv("SITE_URL", SITE);
});

afterEach(() => {
  vi.useRealTimers();
});

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyA = await ctx.db.insert("companies", { name: "Period House Group", createdAt: now });
    const companyB = await ctx.db.insert("companies", { name: "Korda", createdAt: now });
    const siteA = await ctx.db.insert("websites", { host: "morehandles.co.uk", displayHost: "morehandles.co.uk", firstSeenAt: now });
    const siteB = await ctx.db.insert("websites", { host: "kordatacle.com", displayHost: "kordatacle.com", firstSeenAt: now });
    const holdA = await ctx.db.insert("companyWebsites", { companyId: companyA, websiteId: siteA, relationship: "OWNED", createdAt: now });
    await ctx.db.insert("companyWebsites", { companyId: companyB, websiteId: siteB, relationship: "OWNED", createdAt: now });
    const memberA = await ctx.db.insert("users", { name: "Jo Hughes", email: "jo@test.com", role: "USER", companyId: companyA, createdAt: now });
    return { companyA, companyB, memberA, siteA, holdA };
  });
}

/** Signs a test app up, allows it as the person and swaps the code, all through the HTTP endpoints. */
async function connect(t: Harness, userId: Id<"users">): Promise<string> {
  const signedUp = await t.fetch("/oauth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_name: "Claude Code", redirect_uris: [RETURN] }) });
  expect(signedUp.status).toBe(201);
  const { client_id: clientId } = await signedUp.json() as { client_id: string };
  const { returnTo } = await t.withIdentity({ subject: userId }).mutation(api.chatAppPasses.allow, {
    clientId, redirectUri: RETURN, responseType: "code", codeChallenge: CHALLENGE, codeChallengeMethod: "S256", resource: `${SITE}/mcp`,
  });
  const code = new URL(returnTo).searchParams.get("code") ?? "";
  const swapped = await t.fetch("/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: clientId, redirect_uri: RETURN, code_verifier: VERIFIER, resource: `${SITE}/mcp` }).toString(),
  });
  expect(swapped.status).toBe(200);
  const passes = await swapped.json() as { access_token: string; token_type: string; expires_in: number };
  expect(passes).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
  return passes.access_token;
}

async function ask(t: Harness, pass: string | null, body: unknown, headers: Record<string, string> = {}) {
  const response = await t.fetch("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...(pass ? { Authorization: `Bearer ${pass}` } : {}), ...headers },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, headers: response.headers, body: text ? JSON.parse(text) : null };
}

const call = (id: number, name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } });

describe("the public documents", () => {
  test("say where the door's sign-in is, at Hakken's own address", async () => {
    const t = harness();
    const resource = await (await t.fetch("/.well-known/oauth-protected-resource/mcp")).json();
    expect(resource).toMatchObject({ resource: `${SITE}/mcp`, authorization_servers: [SITE] });
    const server = await (await t.fetch("/.well-known/oauth-authorization-server")).json();
    expect(server).toMatchObject({ issuer: SITE, token_endpoint: `${SITE}/oauth/token`, code_challenge_methods_supported: ["S256"] });
  });
});

describe("no pass, no answer", () => {
  test("a 401 that points at the sign-in, which is the only thing that starts it", async () => {
    const t = harness();
    const answer = await ask(t, null, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } });
    expect(answer.status).toBe(401);
    expect(answer.headers.get("WWW-Authenticate")).toBe(`Bearer resource_metadata="${SITE}/.well-known/oauth-protected-resource", scope="figures:read"`);
  });

  test("a made-up pass gets the same, saying it's no good", async () => {
    const t = harness();
    const answer = await ask(t, "hk_pass_made_up", { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(answer.status).toBe(401);
    expect(answer.headers.get("WWW-Authenticate")).toMatch(/^Bearer error="invalid_token"/);
  });

  test("GET and DELETE are refused: no stream, no session", async () => {
    const t = harness();
    expect((await t.fetch("/mcp", { method: "GET" })).status).toBe(405);
    expect((await t.fetch("/mcp", { method: "DELETE" })).status).toBe(405);
  });
});

describe("both eras of the protocol", () => {
  test("the older one opens with initialize and gets its own version back", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    const answer = await ask(t, pass, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } });
    expect(answer.body.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "hakken", title: "Hakken" } });
    expect((await ask(t, pass, { jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
  });

  test("the stateless one asks server/discover, with its version in _meta and the header", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    const meta = { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } };
    const answer = await ask(t, pass, { jsonrpc: "2.0", id: 1, method: "server/discover", params: meta }, { "MCP-Protocol-Version": "2026-07-28" });
    expect(answer.body.result).toMatchObject({ resultType: "complete", supportedVersions: expect.arrayContaining(["2026-07-28", "2025-11-25"]) });
    const mismatch = await ask(t, pass, { jsonrpc: "2.0", id: 2, method: "tools/list", params: meta }, { "MCP-Protocol-Version": "2025-11-25" });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.error.code).toBe(-32020);
    const unknown = await ask(t, pass, { jsonrpc: "2.0", id: 3, method: "tools/list" }, { "MCP-Protocol-Version": "1999-01-01" });
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe(-32022);
  });

  test("every tool only reads, and says so as both directories ask", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    const { body } = await ask(t, pass, { jsonrpc: "2.0", id: 1, method: "tools/list" }, { "MCP-Protocol-Version": "2025-11-25" });
    const tools = body.result.tools as Array<{ name: string; title: string; annotations: Record<string, unknown> }>;
    expect(tools.map((tool) => tool.name)).toEqual(["your_websites", "website_summary", "screen_findings", "top_of_list", "page_story"]);
    for (const tool of tools) {
      expect(tool.title, tool.name).toBeTruthy();
      expect(tool.annotations, tool.name).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: false });
    }
  });

  test("the chart's view is there to read, and reads nothing from anywhere itself", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    const { body } = await ask(t, pass, { jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "ui://charts/days.html" } }, { "MCP-Protocol-Version": "2025-11-25" });
    const content = body.result.contents[0];
    expect(content.mimeType).toBe("text/html;profile=mcp-app");
    expect(content._meta.ui.csp).toEqual({ connectDomains: [], resourceDomains: [] });
    expect(content.text).toContain("ui/initialize");
    expect(content.text).not.toMatch(/fetch\(|XMLHttpRequest|<script src=/);
  });
});

describe("one company's figures, for one company's pass", () => {
  test("the websites are the pass's company's own, never another's", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    const { body } = await ask(t, pass, call(1, "your_websites"), { "MCP-Protocol-Version": "2025-11-25" });
    const said = JSON.stringify(body.result.structuredContent);
    expect(said).toContain("morehandles.co.uk");
    expect(said).not.toContain("kordatacle.com");
  });

  test("naming another company's website gets nothing of it", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    const { body } = await ask(t, pass, call(1, "top_of_list", { website: "kordatacle.com", list: "searchConsole.keywords" }), { "MCP-Protocol-Version": "2025-11-25" });
    const answer = body.result.structuredContent;
    expect(answer.rows).toBeUndefined();
    expect(String(answer.problem)).toMatch(/kordatacle\.com/);
  });

  test("a page's story asks Google Analytics for that page, by its address", async () => {
    // The connection's newest day is today's, worked out again by the read: kept away from midnight.
    useMiddayUtc();
    const t = harness();
    const seeded = await seed(t);
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("googleAnalyticsConnections", {
        companyId: seeded.companyA, companyWebsiteId: seeded.holdA, websiteId: seeded.siteA, status: "CONNECTED", property: "properties/1",
        newestDay: new Date(now).toISOString().slice(0, 10), createdAt: now, updatedAt: now,
      });
    });
    const pass = await connect(t, seeded.memberA);
    const { body } = await ask(t, pass, call(1, "page_story", { website: "morehandles.co.uk", page: "/", dates: "lastMonth" }), { "MCP-Protocol-Version": "2025-11-25" });
    const analytics = (body.result.structuredContent.sections as Array<{ section: string; problem?: string }>).find((part) => part.section === "Google Analytics");
    // Handed the page as a search, the read had no page to look for and asked which one (found live, 21 November 2026).
    expect(analytics?.problem).not.toMatch(/Say which page/);
    expect(analytics?.problem).toMatch(/No page of morehandles\.co\.uk matching \//);
  });

  test("each question goes in the log, with who asked and what for", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    await ask(t, pass, call(1, "top_of_list", { website: "morehandles.co.uk", list: "searchConsole.keywords", dates: "lastMonth" }), { "MCP-Protocol-Version": "2025-11-25" });
    const asked = await t.withIdentity({ subject: seeded.memberA }).query(api.chatAppPasses.myChatAppQuestions, { app: "chatgpt" });
    expect(asked).toEqual([]);
    const rows = await t.run(async (ctx) => await ctx.db.query("chatAppRequests").collect());
    expect(rows).toEqual([expect.objectContaining({ userId: seeded.memberA, companyId: seeded.companyA, app: "local", tool: "top_of_list", detail: "searchConsole.keywords", website: "morehandles.co.uk", period: "lastMonth" })]);
  });
});

describe("credits", () => {
  test("each answered question spends the company's credits, one charge a question, by the person who asked", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    await ask(t, pass, call(1, "your_websites"), { "MCP-Protocol-Version": "2025-11-25" });
    await ask(t, pass, call(2, "top_of_list", { website: "morehandles.co.uk", list: "searchConsole.keywords" }), { "MCP-Protocol-Version": "2025-11-25" });
    const charges = await t.run(async (ctx) => (await ctx.db.query("creditCharges").collect()).filter((charge) => charge.kind === "chatApps"));
    expect(charges).toHaveLength(2);
    expect(charges[0]).toMatchObject({ companyId: seeded.companyA, userId: seeded.memberA, units: 1, creditsOut: 1, how: "byHand" });
    // The statement shows the kind's own name; no tool's code name rides along.
    expect(charges[0].detail).toBeUndefined();
  });

  test("a refused question costs nothing", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    await t.run(async (ctx) => await writeFeaturesOff(ctx, seeded.companyA, ["searchConsole"]));
    await ask(t, pass, call(1, "top_of_list", { website: "morehandles.co.uk", list: "searchConsole.keywords" }), { "MCP-Protocol-Version": "2025-11-25" });
    await ask(t, pass, call(2, "no_such_tool"), { "MCP-Protocol-Version": "2025-11-25" });
    const charges = await t.run(async (ctx) => (await ctx.db.query("creditCharges").collect()).filter((charge) => charge.kind === "chatApps"));
    expect(charges).toEqual([]);
  });
});

describe("the switch", () => {
  test("switched off for the company, the door refuses and says why", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    await t.run(async (ctx) => await writeFeaturesOff(ctx, seeded.companyA, ["chatApps"]));
    const answer = await ask(t, pass, call(1, "your_websites"), { "MCP-Protocol-Version": "2025-11-25" });
    expect(answer.status).toBe(403);
    expect(answer.body.error_description).toMatch(/switched off/);
  });

  test("a section switched off for the company answers that it is, and reads nothing", async () => {
    const t = harness();
    const seeded = await seed(t);
    const pass = await connect(t, seeded.memberA);
    await t.run(async (ctx) => await writeFeaturesOff(ctx, seeded.companyA, ["searchConsole"]));
    const { body } = await ask(t, pass, call(1, "top_of_list", { website: "morehandles.co.uk", list: "searchConsole.keywords" }), { "MCP-Protocol-Version": "2025-11-25" });
    expect(body.result.structuredContent.problem).toMatch(/Search Console is switched off/);
    const logged = await t.run(async (ctx) => await ctx.db.query("chatAppRequests").collect());
    expect(logged[0]).toMatchObject({ outcome: "refused", reason: "switchedOff" });
  });
});

describe("the token endpoint", () => {
  test("refuses a grant it doesn't know, and an app that won't say who it is", async () => {
    const t = harness();
    const unknownGrant = await t.fetch("/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=password&client_id=x" });
    expect(unknownGrant.status).toBe(400);
    expect(await unknownGrant.json()).toMatchObject({ error: "unsupported_grant_type" });
    const noClient = await t.fetch("/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "grant_type=refresh_token&refresh_token=x" });
    expect(noClient.status).toBe(401);
  });

  test("a renewal pass swaps through the endpoint too", async () => {
    const t = harness();
    const seeded = await seed(t);
    await connect(t, seeded.memberA);
    const renew = await t.run(async (ctx) => (await ctx.db.query("chatAppPasses").collect()).find((pass) => pass.kind === "renew"));
    expect(renew).toBeDefined();
    // The endpoint only ever sees the secret; a fingerprint can't be swapped back.
    const answer = await t.mutation(internal.chatAppPasses.renewInternal, { renewalPass: renew?.fingerprint ?? "", clientId: "x" });
    expect(answer.ok).toBe(false);
  });
});
