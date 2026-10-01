import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { decryptConnectorToken, encryptConnectorToken } from "./connectorTokenCrypto";
import schema from "./schema";

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("./aiProviderRegistry", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./aiProviderRegistry")>()),
  generateTextWithResolvedModel: generate,
}));

/**
 * X in News (docs/plans/active/knowledge-news-and-digest-plan.md, phase 6).
 * What must hold: Anthony connects his own X account once — a super admin
 * only, with PKCE, the access kept encrypted and never shown — and only a
 * sign-in that may read bookmarks connects; watched accounts are read with
 * the app's token, newest posts since the last read only, and each run's X
 * reads cost what is entered; the connected account's new bookmarks come
 * into News, each once, credited to whoever wrote them; and its access is
 * renewed as it runs out.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

const KEY = btoa("0123456789abcdef0123456789abcdef");

type Call = { url: string; init?: RequestInit };

/** X, as the platform calls it: each address's answer. */
function x(routes: Record<string, (call: Call) => Response>) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const route = Object.keys(routes).find((prefix) => url.startsWith(prefix));
    return route ? routes[route]({ url, init }) : new Response("not found", { status: 404 });
  }));
  return calls;
}

async function superAdmin(t: ReturnType<typeof harness>) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", { email: "anthony@hakken.example", role: "SUPER_ADMIN" }));
  return t.withIdentity({ subject: userId });
}

async function collector(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => await ctx.db.insert("agents", {
    name: "News Collector", modelId: "model-test", thinkingMode: false, isActive: true, systemKey: "NEWS_COLLECTOR",
    systemPrompt: "Summarise plainly.", createdAt: Date.now(), updatedAt: Date.now(),
  }));
}

async function collect(t: ReturnType<typeof harness>, agentId: Id<"agents">) {
  const runId = await t.run(async (ctx) => await ctx.db.insert("agentRuns", {
    agentId, triggerType: "MANUAL", objective: "collect", status: "QUEUED", startedAt: Date.now(), updatedAt: Date.now(),
  }));
  await t.action(internal.newsAgentRunActions.runNewsRoleNow, { role: "NEWS_COLLECTOR", runId });
  return await t.run(async (ctx) => await ctx.db.get(runId));
}

const items = (t: ReturnType<typeof harness>) => t.run(async (ctx) => await ctx.db.query("newsItems").collect());
const post = (id: string, text: string, author?: string) => ({ id, text, created_at: "2026-09-30T10:00:00.000Z", ...(author ? { author_id: author } : {}) });

beforeEach(() => {
  vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
  vi.stubEnv("X_CLIENT_ID", "x-client");
  vi.stubEnv("X_CLIENT_SECRET", "x-secret");
  generate.mockReset().mockImplementation(async (args: { contents: Array<{ text: string }> }) => {
    const asked = JSON.parse(args.contents[0].text) as { text: string };
    return { text: JSON.stringify({ title: `On: ${asked.text.slice(0, 30)}`, summary: `In short: ${asked.text}`, meaning: "" }), inputTokens: 100, outputTokens: 20 };
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("connecting Anthony's X account", () => {
  async function signIn(t: ReturnType<typeof harness>, scope: string) {
    const admin = await superAdmin(t);
    const { authorizeUrl } = await admin.mutation(api.xConnect.beginXConnect, {});
    const state = new URL(authorizeUrl, "https://deployment.example").searchParams.get("state")!;
    const toX = await t.fetch(`/api/x/oauth/authorize?state=${encodeURIComponent(state)}`);
    const xUrl = new URL(toX.headers.get("location")!);
    const calls = x({
      "https://api.x.com/2/oauth2/token": () => Response.json({ access_token: "access-1", refresh_token: "refresh-1", expires_in: 7200, scope }),
      "https://api.x.com/2/oauth2/revoke": () => new Response(null, { status: 200 }),
      "https://api.x.com/2/users/me": () => Response.json({ data: { id: "42", username: "ants" } }),
    });
    const back = await t.fetch(`/api/x/oauth/callback?state=${encodeURIComponent(state)}&code=the-code`);
    return { admin, xUrl, calls, back };
  }

  test("a super admin connects once, with PKCE, and the access is kept encrypted and never shown", async () => {
    const t = harness();
    const { admin, xUrl, calls, back } = await signIn(t, "tweet.read users.read bookmark.read offline.access");

    expect(xUrl.origin + xUrl.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(xUrl.searchParams.get("scope")).toBe("tweet.read users.read bookmark.read offline.access");
    expect(xUrl.searchParams.get("code_challenge_method")).toBe("S256");
    // The code is exchanged with the app's Basic proof and the verifier the challenge was made from.
    const exchange = calls.find((call) => call.url === "https://api.x.com/2/oauth2/token")!;
    expect((exchange.init?.headers as Record<string, string>).Authorization).toBe(`Basic ${btoa("x-client:x-secret")}`);
    const verifier = new URLSearchParams(String(exchange.init?.body)).get("code_verifier")!;
    const challenge = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(xUrl.searchParams.get("code_challenge")).toBe(challenge);

    expect(back.headers.get("location")).toMatch(/\/admin\/content\/news-sources\?x=connected$/);
    const row = await t.run(async (ctx) => (await ctx.db.query("xConnections").first())!);
    expect(row).toMatchObject({ status: "CONNECTED", account: "@ants", xUserId: "42" });
    expect(row.accessTokenCiphertext).not.toContain("access-1");
    expect(await decryptConnectorToken(row.refreshTokenCiphertext!)).toBe("refresh-1");
    const shown = await admin.query(api.xConnect.getXForAdmin, {});
    expect(shown).toMatchObject({ status: "CONNECTED", account: "@ants", signInConfigured: true });
    expect(JSON.stringify(shown)).not.toMatch(/access-1|refresh-1|Ciphertext/);
  });

  test("a sign-in that may not read bookmarks connects nothing, and its grant goes back to X", async () => {
    const t = harness();
    const { calls, back } = await signIn(t, "tweet.read users.read offline.access");

    expect(back.headers.get("location")).toMatch(/\?x=missing-scope$/);
    expect(calls.some((call) => call.url === "https://api.x.com/2/oauth2/revoke")).toBe(true);
    expect(await t.run(async (ctx) => (await ctx.db.query("xConnections").first())?.status)).toBe("CONNECTING");
  });

  test("only a super admin can start, a forged state goes nowhere, and disconnecting forgets the access", async () => {
    const t = harness();
    const member = await t.run(async (ctx) => await ctx.db.insert("users", { email: "anna@korda.example", role: "USER" }));
    await expect(t.withIdentity({ subject: member }).mutation(api.xConnect.beginXConnect, {})).rejects.toThrow();
    expect((await t.fetch("/api/x/oauth/authorize?state=forged")).status).toBe(400);

    const { admin } = await signIn(t, "tweet.read users.read bookmark.read offline.access");
    await admin.mutation(api.xConnect.disconnectX, {});
    expect(await t.run(async (ctx) => await ctx.db.query("xConnections").collect())).toEqual([]);
  });
});

describe("reading X", () => {
  test("a watched account: its newest posts only, five on a first read, then only what is newer, each run's reads on its cost", async () => {
    vi.stubEnv("X_BEARER_TOKEN", "app-token");
    vi.stubEnv("X_READ_COST_USD", "0.005");
    const t = harness();
    const agentId = await collector(t);
    await t.run(async (ctx) => await ctx.db.insert("newsSources", {
      kind: "X_ACCOUNT", name: "Search Liaison", address: "searchliaison", isOn: true, createdAt: Date.now(), updatedAt: Date.now(),
    }));
    const posts = Array.from({ length: 8 }, (_, index) => post(String(108 - index), `Post number ${8 - index}`));
    const calls = x({
      "https://api.x.com/2/users/by/username/searchliaison": () => Response.json({ data: { id: "777", username: "searchliaison" } }),
      "https://api.x.com/2/users/777/tweets": ({ url }) => (url.includes("since_id=108")
        ? Response.json({ meta: { result_count: 0 } })
        : Response.json({ data: posts, meta: { newest_id: "108" } })),
    });

    const first = await collect(t, agentId);

    expect((await items(t)).map((item) => item.url).sort()).toEqual(
      ["104", "105", "106", "107", "108"].map((id) => `https://x.com/searchliaison/status/${id}`),
    );
    expect((await items(t))[0]).toMatchObject({ kind: "X", sourceName: "Search Liaison" });
    const tweets = calls.find((call) => call.url.startsWith("https://api.x.com/2/users/777/tweets"))!;
    expect((tweets.init?.headers as Record<string, string>).Authorization).toBe("Bearer app-token");
    expect(tweets.url).toContain("exclude=retweets%2Creplies");
    // Eight posts read at $0.005, on the run with its model calls.
    const ledger = await t.run(async (ctx) => await ctx.db.query("agentTransactions").collect());
    expect(ledger.find((row) => row.providerKey === "x")).toMatchObject({ costUsd: 0.04, actionContext: "Read 8 posts from @searchliaison" });
    expect(first?.costUsd).toBeGreaterThanOrEqual(0.04);

    await collect(t, agentId);
    expect(calls.filter((call) => call.url.startsWith("https://api.x.com/2/users/by/username"))).toHaveLength(1);
    expect(calls.at(-1)?.url).toContain("since_id=108");
    expect(await items(t)).toHaveLength(5);
  });

  async function connected(t: ReturnType<typeof harness>, expiresAt: number, lastBookmarkId?: string) {
    const access = await encryptConnectorToken("access-1");
    const refresh = await encryptConnectorToken("refresh-1");
    await t.run(async (ctx) => await ctx.db.insert("xConnections", {
      status: "CONNECTED", account: "@ants", xUserId: "42", accessTokenCiphertext: access, refreshTokenCiphertext: refresh,
      expiresAt, ...(lastBookmarkId ? { lastBookmarkId } : {}), createdAt: Date.now(), updatedAt: Date.now(),
    }));
  }

  const bookmarksAnswer = (ids: string[]) => Response.json({
    data: ids.map((id) => post(id, `Bookmarked post ${id}`, "9")),
    includes: { users: [{ id: "9", username: "rustybrick", name: "Barry" }] },
  });

  test("the connected account's new bookmarks come in, each once, credited to whoever wrote them", async () => {
    const t = harness();
    const agentId = await collector(t);
    await connected(t, Date.now() + 3600_000, "500");
    let answer = ["503", "502", "501", "500", "499"];
    const calls = x({ "https://api.x.com/2/users/42/bookmarks": () => bookmarksAnswer(answer) });

    expect((await collect(t, agentId))?.finalOutput).toMatch(/^Added 3 items to News/);
    expect((await items(t)).map((item) => [item.url, item.sourceName, item.kind]).sort()).toEqual([
      ["https://x.com/rustybrick/status/501", "@rustybrick", "X"],
      ["https://x.com/rustybrick/status/502", "@rustybrick", "X"],
      ["https://x.com/rustybrick/status/503", "@rustybrick", "X"],
    ]);
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer access-1");
    expect(await t.run(async (ctx) => (await ctx.db.query("xConnections").first())?.lastBookmarkId)).toBe("503");

    answer = ["504", "503", "502"];
    await collect(t, agentId);
    expect(await items(t)).toHaveLength(4);
  });

  test("access nearly out is renewed first, and X's new renewal kept", async () => {
    const t = harness();
    const agentId = await collector(t);
    await connected(t, Date.now() + 30_000, "500");
    const calls = x({
      "https://api.x.com/2/oauth2/token": () => Response.json({ access_token: "access-2", refresh_token: "refresh-2", expires_in: 7200 }),
      "https://api.x.com/2/users/42/bookmarks": () => bookmarksAnswer(["500"]),
    });

    await collect(t, agentId);

    const renewal = calls.find((call) => call.url === "https://api.x.com/2/oauth2/token")!;
    expect(new URLSearchParams(String(renewal.init?.body)).get("refresh_token")).toBe("refresh-1");
    expect((calls.find((call) => call.url.includes("/bookmarks"))!.init?.headers as Record<string, string>).Authorization).toBe("Bearer access-2");
    const row = await t.run(async (ctx) => (await ctx.db.query("xConnections").first())!);
    expect(await decryptConnectorToken(row.refreshTokenCiphertext!)).toBe("refresh-2");
  });
});
