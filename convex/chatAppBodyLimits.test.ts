import { convexTest } from "convex-test";
import { beforeEach, describe, expect, test, vi } from "vitest";
import schema from "./schema";
import { fingerprintOf } from "./utils/chatApps";
import { POST as proxyPost } from "../src/app/api/chat-apps/[door]/route";

const SITE = "http://hakken.localhost:3000";
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => {
  vi.stubEnv("SITE_URL", SITE);
  vi.stubEnv("CONVEX_SITE_URL", "https://dummy.example.com");
});

describe("public chat app body limits", () => {
  test("the Convex OAuth and MCP doors refuse bodies beyond their limits", async () => {
    const t = harness();
    expect((await t.fetch("/oauth/token", { method: "POST" })).status).toBe(401);
    expect((await t.fetch("/oauth/register", { method: "POST" })).status).toBe(400);
    expect((await t.fetch("/oauth/register", { method: "POST", body: "x".repeat(16 * 1024 + 1) })).status).toBe(413);
    expect((await t.fetch("/oauth/token", { method: "POST", body: "x".repeat(16 * 1024 + 1) })).status).toBe(413);

    const accessPass = "hk_pass_dummy";
    await t.run(async (ctx) => {
      const companyId = await ctx.db.insert("companies", { name: "Dummy", createdAt: Date.now() });
      const userId = await ctx.db.insert("users", { name: "Dummy", email: "dummy@test.invalid", role: "USER", companyId, createdAt: Date.now() });
      const grantId = await ctx.db.insert("chatAppGrants", { userId, companyId, app: "local", clientId: "dummy", allowedAt: Date.now() });
      await ctx.db.insert("chatAppPasses", { fingerprint: await fingerprintOf(accessPass), kind: "access", grantId, chain: "dummy", expiresAt: Date.now() + 60_000 });
    });
    expect((await t.fetch("/mcp", { method: "POST", headers: { Authorization: `Bearer ${accessPass}` } })).status).toBe(400);
    expect((await t.fetch("/mcp", { method: "POST", headers: { Authorization: `Bearer ${accessPass}` }, body: "x".repeat(256 * 1024 + 1) })).status).toBe(413);
  });

  test("the Next proxy stops reading an oversized stream and sends nothing upstream", async () => {
    let chunksRead = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksRead += 1;
        controller.enqueue(new Uint8Array(16 * 1024));
        if (chunksRead === 100) controller.close();
      },
    });
    const request = new Request(`${SITE}/api/chat-apps/mcp`, { method: "POST", body: stream, duplex: "half" } as RequestInit);
    const upstream = vi.fn();
    vi.stubGlobal("fetch", upstream);
    const response = await proxyPost(request, { params: Promise.resolve({ door: "mcp" }) });
    expect(response.status).toBe(413);
    expect(chunksRead).toBeLessThan(70);
    expect(upstream).not.toHaveBeenCalled();
  });
});
