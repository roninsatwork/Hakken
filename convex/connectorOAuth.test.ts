import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { decryptConnectorToken, encryptConnectorToken } from "./connectorTokenCrypto";
import { finishScheduled } from "@/src/test/finishScheduled";

/**
 * The consent plumbing, end to end with the provider stubbed at the network
 * boundary: begin → authorize redirect → callback exchange → ciphertext at
 * rest → refresh on expiry → revoke on disconnect. What these tests pin is
 * everything the platform decides; nothing here contacts Google.
 */

const KEY = Buffer.from(new Uint8Array(32).fill(5)).toString("base64");

function stubProviderFetch(overrides: {
  onToken?: (body: URLSearchParams) => Response;
  onRevoke?: (body: URLSearchParams) => void;
} = {}) {
  const calls: { url: string; body: URLSearchParams }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = new URLSearchParams(typeof init?.body === "string" ? init.body : "");
      calls.push({ url, body });
      if (url.includes("oauth2.googleapis.com/token")) {
        return (
          overrides.onToken?.(body) ??
          Response.json({
            access_token: "ya29.live-access-token",
            refresh_token: "1//refresh-token",
            expires_in: 3600,
            scope: "https://www.googleapis.com/auth/gmail.modify",
          })
        );
      }
      if (url.includes("oauth2.googleapis.com/revoke")) {
        overrides.onRevoke?.(body);
        return new Response("{}", { status: 200 });
      }
      if (url.includes("gmail/v1/users/me/profile")) {
        return Response.json({ emailAddress: "ask@ronins.co.uk" });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    })
  );
  return calls;
}

async function seedConnectedMailbox(t: ReturnType<typeof convexTest>) {
  const superAdminId = await t.run(async (ctx) =>
    ctx.db.insert("users", { email: "super@example.com", role: "SUPER_ADMIN" })
  );
  const companyId = await t.run(async (ctx) =>
    ctx.db.insert("companies", { name: "Mail Co", createdAt: Date.now() })
  );
  const asAdmin = t.withIdentity({ subject: superAdminId });
  const connectorId = await asAdmin.mutation(api.aiTools.installConnector, {
    key: "google-gmail",
    companyId,
  });
  const begin = await asAdmin.mutation(api.aiTools.beginConnectorOAuth, { connectorId });
  // The state stays on the server — the mutation hands back only the URL the
  // browser follows — so the test reads it from the row it was written to.
  const state = await t.run(async (ctx) =>
    (await ctx.db.get(begin.oauthConnectionId))!.state
  );
  return { superAdminId, companyId, connectorId, asAdmin, ...begin, state };
}

describe("the connector consent flow", () => {
  beforeEach(() => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("SITE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("begin mints an unguessable single-use state and an absolute authorize link", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { state, authorizationUrl } = await seedConnectedMailbox(t);

    // Random beyond the id and timestamp: 48 hex characters of entropy.
    expect(state).toMatch(/:[0-9a-f]{48}$/);
    expect(authorizationUrl).toContain("/api/connectors/oauth/authorize?state=");
  });

  test("the authorize route sends the admin to Google with exactly the connection's scopes", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { state } = await seedConnectedMailbox(t);

    const response = await t.fetch(`/api/connectors/oauth/authorize?state=${encodeURIComponent(state)}`);
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("Location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    expect(location.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/gmail.modify");
    expect(location.searchParams.get("state")).toBe(state);
    // The two parameters a working refresh token depends on.
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("consent");
  });

  test("a state nobody minted is rejected on both routes", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    await seedConnectedMailbox(t);

    const authorize = await t.fetch("/api/connectors/oauth/authorize?state=forged-state");
    expect(authorize.status).toBe(400);
    const callback = await t.fetch("/api/connectors/oauth/callback?state=forged-state&code=abc");
    expect(callback.status).toBe(400);
  });

  test("the callback exchanges the code, stores ciphertext, and marks the connection", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { state, connectorId, companyId } = await seedConnectedMailbox(t);
    stubProviderFetch();

    const response = await t.fetch(
      `/api/connectors/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("oauthConnected=1");

    const { connector, tokenRows, audits } = await t.run(async (ctx) => ({
      connector: await ctx.db.get(connectorId),
      tokenRows: await ctx.db.query("connectorOAuthTokens").collect(),
      audits: await ctx.db.query("auditLogs").collect(),
    }));

    expect(connector).toMatchObject({
      authConnectionStatus: "CONNECTED",
      authAccountRef: "ask@ronins.co.uk",
    });
    expect(tokenRows).toHaveLength(1);
    // Ciphertext at rest: the raw tokens appear nowhere in the row...
    expect(JSON.stringify(tokenRows[0])).not.toContain("ya29");
    expect(JSON.stringify(tokenRows[0])).not.toContain("1//refresh");
    expect(tokenRows[0].companyId).toBe(companyId);
    // ...but decrypt back to exactly what Google issued.
    await expect(decryptConnectorToken(tokenRows[0].accessTokenCiphertext)).resolves.toBe(
      "ya29.live-access-token"
    );
    // Audited: account and scopes, never a token.
    const audit = audits.find((entry) => entry.actionType === "CONNECTOR_OAUTH_CONNECTED");
    expect(audit?.metadata).toContain("ask@ronins.co.uk");
    expect(audit?.metadata).not.toContain("ya29");

    // Single-use: replaying the same state is refused.
    const replay = await t.fetch(
      `/api/connectors/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`
    );
    expect(replay.status).toBe(400);
  });

  test("a consent missing the required scope fails honestly, with no ciphertext left behind", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { state, connectorId } = await seedConnectedMailbox(t);
    stubProviderFetch({
      onToken: () =>
        Response.json({
          access_token: "ya29.narrow",
          expires_in: 3600,
          scope: "https://www.googleapis.com/auth/userinfo.email",
        }),
    });

    const response = await t.fetch(
      `/api/connectors/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toContain("oauthError=");

    const { connector, tokenRows } = await t.run(async (ctx) => ({
      connector: await ctx.db.get(connectorId),
      tokenRows: await ctx.db.query("connectorOAuthTokens").collect(),
    }));
    expect(connector?.authConnectionStatus).toBe("ERROR");
    expect(tokenRows).toHaveLength(0);
  });

  test("an expired token refreshes itself on read, and the new ciphertext is stored", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { state, connectorId } = await seedConnectedMailbox(t);
    stubProviderFetch();
    await t.fetch(`/api/connectors/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`);

    // Age the token past its life.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("connectorOAuthTokens").collect())[0];
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1000 });
    });

    const calls = stubProviderFetch({
      onToken: (body) => {
        expect(body.get("grant_type")).toBe("refresh_token");
        expect(body.get("refresh_token")).toBe("1//refresh-token");
        return Response.json({ access_token: "ya29.renewed", expires_in: 3600 });
      },
    });

    const result = await t.action(internal.connectorOAuth.getConnectorAccessToken, { connectorId });
    expect(result).toEqual({ ok: true, accessToken: "ya29.renewed" });
    expect(calls.some((call) => call.url.includes("/token"))).toBe(true);

    const row = await t.run(async (ctx) => (await ctx.db.query("connectorOAuthTokens").collect())[0]);
    await expect(decryptConnectorToken(row.accessTokenCiphertext)).resolves.toBe("ya29.renewed");
    // The refresh response omitted a new refresh token, so the old one holds.
    await expect(decryptConnectorToken(row.refreshTokenCiphertext ?? "")).resolves.toBe("1//refresh-token");
  });

  test("a grant revoked at the provider surfaces as reconnect, never silence", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { state, connectorId } = await seedConnectedMailbox(t);
    stubProviderFetch();
    await t.fetch(`/api/connectors/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`);
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("connectorOAuthTokens").collect())[0];
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1000 });
    });
    stubProviderFetch({
      onToken: () => new Response('{"error":"invalid_grant"}', { status: 400 }),
    });

    const result = await t.action(internal.connectorOAuth.getConnectorAccessToken, { connectorId });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Reconnect");

    const { connector, tokenRows } = await t.run(async (ctx) => ({
      connector: await ctx.db.get(connectorId),
      tokenRows: await ctx.db.query("connectorOAuthTokens").collect(),
    }));
    expect(connector?.authConnectionStatus).toBe("ERROR");
    expect(tokenRows).toHaveLength(0);
  });

  test("disconnect revokes at the provider, then deletes the ciphertext, then audits", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { state, connectorId, asAdmin } = await seedConnectedMailbox(t);
    stubProviderFetch();
    await t.fetch(`/api/connectors/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`);

    let revokedToken: string | null = null;
    stubProviderFetch({
      onRevoke: (body) => {
        revokedToken = body.get("token");
      },
    });

    vi.useFakeTimers();
    await asAdmin.mutation(api.aiTools.disconnectConnectorOAuth, { connectorId });
    // Let the scheduled revoke action run.
    await finishScheduled(t);
    vi.useRealTimers();

    // The refresh token — the whole grant — is what went to the revocation
    // endpoint, and nothing encrypted remains afterwards.
    expect(revokedToken).toBe("1//refresh-token");
    const { connector, tokenRows, audits } = await t.run(async (ctx) => ({
      connector: await ctx.db.get(connectorId),
      tokenRows: await ctx.db.query("connectorOAuthTokens").collect(),
      audits: await ctx.db.query("auditLogs").collect(),
    }));
    expect(tokenRows).toHaveLength(0);
    expect(connector?.authConnectionStatus).toBe("NOT_CONNECTED");
    expect(audits.some((entry) => entry.actionType === "CONNECTOR_OAUTH_DISCONNECTED")).toBe(true);
  });

  test("a stale pending connection cannot be completed", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { state } = await seedConnectedMailbox(t);
    await t.run(async (ctx) => {
      const connection = (await ctx.db.query("toolConnectorOAuthConnections").collect())[0];
      await ctx.db.patch(connection._id, { createdAt: Date.now() - 16 * 60 * 1000 });
    });

    const response = await t.fetch(
      `/api/connectors/oauth/callback?state=${encodeURIComponent(state)}&code=auth-code`
    );
    expect(response.status).toBe(400);
  });
});

describe("token table discipline", () => {
  test("no client-callable function is declared in the module that reads the token table", () => {
    // Commitment 1: `connectorOAuthTokens` is readable by no client-callable
    // function. The table is only touched from connectorOAuth.ts, so it is
    // enough that every declaration there is internal or an HTTP action —
    // held as a source check the same way the authz enumeration test works.
    const source = fs.readFileSync(path.join(__dirname, "connectorOAuth.ts"), "utf8");
    const builders = Array.from(source.matchAll(/=\s*(\w+)\s*\(\s*[{(]/g), (match) => match[1]);
    const declarationBuilders = builders.filter((name) =>
      /^(query|mutation|action|internalQuery|internalMutation|internalAction|httpAction|publicQuery|publicMutation|publicAction|tenantQuery|tenantMutation|adminQuery|adminMutation|superAdminQuery|superAdminMutation)$/.test(
        name
      )
    );
    expect(declarationBuilders.length).toBeGreaterThan(0);
    for (const builder of declarationBuilders) {
      expect(["internalQuery", "internalMutation", "internalAction", "httpAction"]).toContain(builder);
    }

    // And no other module queries the table at all.
    const convexDir = __dirname;
    const offenders: string[] = [];
    for (const file of fs.readdirSync(convexDir)) {
      if (!file.endsWith(".ts") || file.endsWith(".test.ts")) continue;
      if (file === "connectorOAuth.ts" || file === "schema.ts") continue;
      const content = fs.readFileSync(path.join(convexDir, file), "utf8");
      if (content.includes('"connectorOAuthTokens"')) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });

  test("the ciphertext helpers reject use without a key even mid-flow", async () => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
    const stored = await encryptConnectorToken("token");
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", "");
    await expect(decryptConnectorToken(stored)).rejects.toThrow("not configured");
    vi.unstubAllEnvs();
  });
});

describe("connector client credentials", () => {
  afterEach(() => vi.unstubAllEnvs());

  test("a deployment without a dedicated connector client falls back to the sign-in app", async () => {
    const { getConnectorOAuthClientCredentials } = await import("./connectorOAuthProviders");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_ID", "");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("AUTH_GOOGLE_ID", "auth-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "auth-secret");
    expect(getConnectorOAuthClientCredentials("google")).toEqual({
      clientId: "auth-id",
      clientSecret: "auth-secret",
    });
  });

  test("a dedicated connector client always wins over the sign-in app", async () => {
    const { getConnectorOAuthClientCredentials } = await import("./connectorOAuthProviders");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_ID", "own-id");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_SECRET", "own-secret");
    vi.stubEnv("AUTH_GOOGLE_ID", "auth-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "auth-secret");
    expect(getConnectorOAuthClientCredentials("google")).toEqual({
      clientId: "own-id",
      clientSecret: "own-secret",
    });
  });

  test("a half-set dedicated pair fails visibly rather than half-falling-back", async () => {
    const { getConnectorOAuthClientCredentials } = await import("./connectorOAuthProviders");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_ID", "own-id");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_SECRET", "");
    vi.stubEnv("AUTH_GOOGLE_ID", "auth-id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "auth-secret");
    expect(getConnectorOAuthClientCredentials("google")).toBeNull();
  });
});

describe("the connector screen never receives the value that completes a connection", () => {
  /**
   * `state` is what finishes a pending OAuth connection, and `buildOAuthState`
   * makes it unguessable for that reason. Every test above reaches the
   * connector details while no connection exists, so removing the narrowing
   * from that door left the whole suite green — the classic shape of a check
   * with nothing to read.
   */
  beforeEach(() => {
    vi.stubEnv("CONNECTOR_TOKEN_ENCRYPTION_KEY", KEY);
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_ID", "client-id.apps.googleusercontent.com");
    vi.stubEnv("CONNECTOR_GOOGLE_CLIENT_SECRET", "client-secret");
    vi.stubEnv("SITE_URL", "http://localhost:3000");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  test("a pending connection is on screen, and its state is not", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { asAdmin, connectorId, state } = await seedConnectedMailbox(t);

    const details = await asAdmin.query(api.aiTools.getConnectorInstallDetails, { connectorId });

    // Proof this read something: without a connection there is nothing to leak.
    expect(details.oauthConnections).toHaveLength(1);
    expect(details.oauthConnection?.status).toBe("PENDING");
    expect(state).toContain("connector:");
    expect(JSON.stringify(details)).not.toContain(state);
    expect(details.oauthConnections.filter((row) => "state" in row)).toEqual([]);
  });
});
