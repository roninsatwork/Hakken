import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { isThreadInCallersWorkspace } from "./chatService";

/**
 * Which client a conversation answers for (assistant-foundation-plan.md,
 * item 8, as drawn and approved 2026-10-06): a super admin picks one for a
 * new conversation without changing who they are viewing as; everyone else is
 * always answered for their own company.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

async function seed(t: ReturnType<typeof harness>) {
  return await t.run(async (ctx) => {
    const viewing = await ctx.db.insert("companies", { name: "Conterra Ops", createdAt: Date.now() });
    const picked = await ctx.db.insert("companies", { name: "Korda", createdAt: Date.now() });
    const superAdmin = await ctx.db.insert("users", { email: "super@platform.test", role: "SUPER_ADMIN", impersonatingCompanyId: viewing });
    const admin = await ctx.db.insert("users", { email: "admin@conterra.test", role: "ADMIN", companyId: viewing, createdAt: Date.now() });
    return { viewing, picked, superAdmin, admin };
  });
}

describe("a conversation's client", () => {
  test("a super admin's new conversation is for the client picked, or the platform, without changing who they view as", async () => {
    const t = harness();
    const { viewing, picked, superAdmin } = await seed(t);
    const asSuper = t.withIdentity({ subject: superAdmin });

    const forPicked = await asSuper.mutation(api.chat.createThread, { forCompanyId: picked });
    const forPlatform = await asSuper.mutation(api.chat.createThread, { forPlatform: true });
    const asViewing = await asSuper.mutation(api.chat.createThread, {});

    const threads = await t.run(async (ctx) => ({
      picked: await ctx.db.get(forPicked),
      platform: await ctx.db.get(forPlatform),
      viewing: await ctx.db.get(asViewing),
      user: await ctx.db.get(superAdmin),
    }));
    expect(threads.picked?.companyId).toBe(picked);
    expect(threads.platform?.companyId).toBeUndefined();
    expect(threads.viewing?.companyId).toBe(viewing);
    expect(threads.user?.impersonatingCompanyId).toBe(viewing);

    expect(await asSuper.query(api.chat.getConversationClient, { threadId: forPicked })).toEqual({ name: "Korda" });
    expect(await asSuper.query(api.chat.getConversationClient, { threadId: forPlatform })).toEqual({ name: null });
  });

  test("nobody else chooses, nor sees the label", async () => {
    const t = harness();
    const { picked, admin } = await seed(t);
    const asAdmin = t.withIdentity({ subject: admin });

    await expect(asAdmin.mutation(api.chat.createThread, { forCompanyId: picked })).rejects.toThrow("Only a super admin");
    await expect(asAdmin.mutation(api.chat.createThread, { forPlatform: true })).rejects.toThrow("Only a super admin");
    const own = await asAdmin.mutation(api.chat.createThread, {});
    expect(await asAdmin.query(api.chat.getConversationClient, { threadId: own })).toBeNull();
  });

  test("files and voice follow the conversation's client for a super admin, the caller's company for everyone else", () => {
    expect(isThreadInCallersWorkspace({ role: "SUPER_ADMIN", impersonatingCompanyId: "a" as never }, { companyId: "b" as never })).toBe(true);
    expect(isThreadInCallersWorkspace({ role: "ADMIN", companyId: "a" as never }, { companyId: "a" as never })).toBe(true);
    expect(isThreadInCallersWorkspace({ role: "ADMIN", companyId: "a" as never }, { companyId: "b" as never })).toBe(false);
    expect(isThreadInCallersWorkspace({ role: "USER", companyId: "a" as never }, { companyId: undefined })).toBe(false);
  });
});
