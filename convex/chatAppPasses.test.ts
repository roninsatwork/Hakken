import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { writeFeaturesOff } from "./utils/featureSwitchReads";

/**
 * Ask Hakken in ChatGPT and Claude: the passes
 * (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, phase 1
 * and "Keeping it secure"). A person presses Allow; the app swaps the one-use
 * code for an hour's pass and a renewal pass; every question checks the pass,
 * the person, the company and the switch. Each refusal in the plan's table has
 * a test here.
 */

const SITE = "http://hakken.localhost:3000";
const RETURN = "http://localhost:33418/callback";
// sha256(VERIFIER), as base64url, worked out with Node's own crypto.
const VERIFIER = "dBjftJeZ4CVP-mA92IaYEnDHSGcCmP4kuIXr53B2oUo";
const CHALLENGE = "TbK7F0vvIILGMN5U52pyHeP_ybqapGmnSTqqfdC9lFU";

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;

beforeEach(() => {
  vi.stubEnv("SITE_URL", SITE);
});

async function seed(t: Harness) {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const companyA = await ctx.db.insert("companies", { name: "Period House Group", createdAt: now });
    const companyB = await ctx.db.insert("companies", { name: "Korda", createdAt: now });
    const memberA = await ctx.db.insert("users", { name: "Jo Hughes", email: "jo@test.com", role: "USER", companyId: companyA, createdAt: now });
    const memberB = await ctx.db.insert("users", { name: "Sam Lee", email: "sam@test.com", role: "USER", companyId: companyB, createdAt: now });
    const superAdmin = await ctx.db.insert("users", { name: "Super", email: "super@test.com", role: "SUPER_ADMIN", createdAt: now });
    return { companyA, companyB, memberA, memberB, superAdmin };
  });
}

/** A test app on this machine signs itself up, as Claude Code does. */
async function signUp(t: Harness): Promise<string> {
  const answer = await t.mutation(internal.chatAppPasses.signUpClientInternal, { name: "Claude Code", redirectUris: [RETURN] });
  if (!answer.ok) throw new Error(answer.description);
  return answer.clientId;
}

const request = (clientId: string) => ({ clientId, redirectUri: RETURN, responseType: "code", codeChallenge: CHALLENGE, codeChallengeMethod: "S256", state: "s-1", resource: `${SITE}/mcp` });

async function allowAs(t: Harness, userId: Id<"users">, clientId: string, companyId?: Id<"companies">) {
  const { returnTo } = await t.withIdentity({ subject: userId }).mutation(api.chatAppPasses.allow, { ...request(clientId), ...(companyId ? { companyId } : {}) });
  return new URL(returnTo);
}

async function passesFor(t: Harness, userId: Id<"users">, clientId: string, companyId?: Id<"companies">) {
  const back = await allowAs(t, userId, clientId, companyId);
  const answer = await t.mutation(internal.chatAppPasses.redeemCodeInternal, { code: back.searchParams.get("code") ?? "", clientId, redirectUri: RETURN, codeVerifier: VERIFIER, resource: `${SITE}/mcp` });
  if (!answer.ok) throw new Error(answer.description);
  return answer;
}

describe("Allow, then the passes", () => {
  test("Allow sends the person back with a one-use code, the app's own state and Hakken's name", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const back = await allowAs(t, seeded.memberA, clientId);
    expect(`${back.origin}${back.pathname}`).toBe(RETURN);
    expect(back.searchParams.get("state")).toBe("s-1");
    expect(back.searchParams.get("iss")).toBe(SITE);
    expect(back.searchParams.get("code")).toMatch(/^hk_code_/);
  });

  test("the code swaps once, with its verifier, for a pass that reads the person's own company", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const passes = await passesFor(t, seeded.memberA, clientId);
    expect(passes.expiresIn).toBe(3600);
    const check = await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: passes.accessPass });
    expect(check).toMatchObject({ ok: true, userId: seeded.memberA, companyId: seeded.companyA, app: "local" });
  });

  test("a wrong verifier, another app or another return address gets nothing", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    for (const change of [{ codeVerifier: `${VERIFIER.slice(0, -1)}p` }, { clientId: "hk_client_other" }, { redirectUri: "http://localhost:1/callback" }]) {
      const back = await allowAs(t, seeded.memberA, clientId);
      const answer = await t.mutation(internal.chatAppPasses.redeemCodeInternal, { code: back.searchParams.get("code") ?? "", clientId, redirectUri: RETURN, codeVerifier: VERIFIER, ...change });
      expect(answer.ok, JSON.stringify(change)).toBe(false);
    }
  });

  test("a code used twice gets nothing, and the passes it gave stop", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const back = await allowAs(t, seeded.memberA, clientId);
    const swap = { code: back.searchParams.get("code") ?? "", clientId, redirectUri: RETURN, codeVerifier: VERIFIER };
    const first = await t.mutation(internal.chatAppPasses.redeemCodeInternal, swap);
    if (!first.ok) throw new Error("the first swap should work");
    expect((await t.mutation(internal.chatAppPasses.redeemCodeInternal, swap)).ok).toBe(false);
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: first.accessPass })).toMatchObject({ ok: false, status: 401 });
  });
});

describe("renewal passes", () => {
  test("a renewal pass gives a fresh pair once, and the old access pass stops", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const first = await passesFor(t, seeded.memberA, clientId);
    const second = await t.mutation(internal.chatAppPasses.renewInternal, { renewalPass: first.renewalPass, clientId });
    if (!second.ok) throw new Error(second.description);
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: second.accessPass })).toMatchObject({ ok: true });
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: first.accessPass })).toMatchObject({ ok: false, status: 401 });
  });

  test("a renewal pass used twice cuts the whole chain off: one of the two holders isn't the app", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const first = await passesFor(t, seeded.memberA, clientId);
    const second = await t.mutation(internal.chatAppPasses.renewInternal, { renewalPass: first.renewalPass, clientId });
    if (!second.ok) throw new Error(second.description);
    expect(await t.mutation(internal.chatAppPasses.renewInternal, { renewalPass: first.renewalPass, clientId })).toMatchObject({ ok: false, error: "invalid_grant" });
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: second.accessPass })).toMatchObject({ ok: false, status: 401 });
    expect((await t.mutation(internal.chatAppPasses.renewInternal, { renewalPass: second.renewalPass, clientId })).ok).toBe(false);
  });

  test("only the app the pass was given to may renew it", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const first = await passesFor(t, seeded.memberA, clientId);
    expect((await t.mutation(internal.chatAppPasses.renewInternal, { renewalPass: first.renewalPass, clientId: "hk_client_other" })).ok).toBe(false);
  });
});

describe("one person, one company", () => {
  test("a person can't allow an app to read another company's figures", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    await expect(allowAs(t, seeded.memberA, clientId, seeded.companyB)).rejects.toThrow(/isn't yours/);
  });

  test("a super admin's pass reads only the company picked on the Allow page", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    await expect(allowAs(t, seeded.superAdmin, clientId)).rejects.toThrow(/Pick a company/);
    const passes = await passesFor(t, seeded.superAdmin, clientId, seeded.companyB);
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: passes.accessPass })).toMatchObject({ ok: true, companyId: seeded.companyB });
  });

  test("someone who leaves the company loses the app's passes at once", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const passes = await passesFor(t, seeded.memberA, clientId);
    await t.run(async (ctx) => await ctx.db.patch(seeded.memberA, { companyId: seeded.companyB }));
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: passes.accessPass })).toMatchObject({ ok: false, status: 401, why: "left" });
    expect((await t.mutation(internal.chatAppPasses.renewInternal, { renewalPass: passes.renewalPass, clientId })).ok).toBe(false);
  });
});

describe("the switch, Unlink and the limit", () => {
  test("switched off for the company: no Allow, and a pass already given stops", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const passes = await passesFor(t, seeded.memberA, clientId);
    await t.run(async (ctx) => await writeFeaturesOff(ctx, seeded.companyA, ["chatApps"]));
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: passes.accessPass })).toMatchObject({ ok: false, status: 403, why: "switchedOff" });
    await expect(allowAs(t, seeded.memberA, clientId)).rejects.toThrow(/switched off/);
  });

  test("switched off for everyone, the same", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const passes = await passesFor(t, seeded.memberA, clientId);
    await t.run(async (ctx) => await writeFeaturesOff(ctx, undefined, ["chatApps"]));
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: passes.accessPass })).toMatchObject({ ok: false, status: 403 });
  });

  test("Unlink stops every pass of the app at once", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const passes = await passesFor(t, seeded.memberA, clientId);
    expect(await t.withIdentity({ subject: seeded.memberA }).mutation(api.chatAppPasses.unlinkChatApp, { app: "local" })).toBe(1);
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: passes.accessPass })).toMatchObject({ ok: false, status: 401 });
    expect((await t.mutation(internal.chatAppPasses.renewInternal, { renewalPass: passes.renewalPass, clientId })).ok).toBe(false);
  });

  test("15 questions a minute, then the app waits", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const passes = await passesFor(t, seeded.memberA, clientId);
    const check = await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: passes.accessPass });
    if (!check.ok) throw new Error("the pass should work");
    await t.run(async (ctx) => {
      const at = Date.now();
      for (let i = 0; i < 15; i++) {
        await ctx.db.insert("chatAppRequests", { grantId: check.grantId, userId: seeded.memberA, companyId: seeded.companyA, app: "local", method: "tools/call", outcome: "answered", at });
      }
    });
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: passes.accessPass })).toMatchObject({ ok: false, status: 429 });
  });

  test("a pass that isn't one, or has run out, is refused", async () => {
    const t = harness();
    expect(await t.mutation(internal.chatAppPasses.checkPassInternal, { accessPass: "hk_pass_made_up" })).toMatchObject({ ok: false, status: 401, why: "noPass" });
  });
});

describe("who may sign up", () => {
  test("only an allowed app's return addresses", async () => {
    const t = harness();
    expect(await t.mutation(internal.chatAppPasses.signUpClientInternal, { name: "Evil", redirectUris: ["https://evil.example/cb"] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
    expect(await t.mutation(internal.chatAppPasses.signUpClientInternal, { name: "Claude", redirectUris: ["https://claude.ai/api/mcp/auth_callback"] })).toMatchObject({ ok: true, app: "claude" });
  });

  test("the Allow page names the app and where it'll send the person back, and refuses an address the app never gave", async () => {
    const t = harness();
    const seeded = await seed(t);
    const clientId = await signUp(t);
    const asker = t.withIdentity({ subject: seeded.memberA });
    const described = await asker.action(api.chatAppPasses.describeAllowRequest, request(clientId));
    expect(described).toMatchObject({ ok: true, app: "local", returnHost: "localhost:33418", issuer: SITE, person: { name: "Jo Hughes", company: { name: "Period House Group" } } });
    expect(await asker.action(api.chatAppPasses.describeAllowRequest, { ...request(clientId), redirectUri: "https://evil.example/cb" })).toMatchObject({ ok: false, reason: "badReturn" });
    expect(await asker.action(api.chatAppPasses.describeAllowRequest, { ...request("hk_client_unknown") })).toMatchObject({ ok: false, reason: "unknownApp" });
    expect(await asker.action(api.chatAppPasses.describeAllowRequest, { ...request(clientId), codeChallengeMethod: "plain" })).toMatchObject({ ok: false, reason: "badRequest" });
  });
});
