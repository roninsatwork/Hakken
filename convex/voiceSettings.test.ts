import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

/**
 * One voice for everywhere Hakken speaks. What matters here: the setting is
 * workspace-scoped, only a real voice can be chosen, every mint point reads
 * the same answer, and the change leaves an audit entry.
 */

async function seedAdmin(t: ReturnType<typeof convexTest>) {
  const { adminId, companyId } = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: Date.now() });
    const adminId = await ctx.db.insert("users", {
      email: "admin@acme.test",
      role: "ADMIN",
      companyId,
    });
    return { adminId, companyId };
  });
  return { client: t.withIdentity({ subject: adminId }), companyId };
}

describe("the spoken voice setting", () => {
  test("unset means the default, everywhere that asks", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { client, companyId } = await seedAdmin(t);

    const setting = await client.query(api.voiceSettings.getSpokenVoice, {});
    expect(setting.voice).toBe("Aoede");
    expect(setting.options.map((option) => option.key)).toEqual([
      "Kore",
      "Puck",
      "Charon",
      "Aoede",
    ]);

    const forSession = await t.query(internal.voiceSettings.getSpokenVoiceForCompany, {
      companyId,
    });
    expect(forSession).toBe("Aoede");
  });

  test("an admin's choice is what every live session then reads, and it is audited", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { client, companyId } = await seedAdmin(t);

    await client.mutation(api.voiceSettings.setSpokenVoice, { voice: "Charon" });

    const setting = await client.query(api.voiceSettings.getSpokenVoice, {});
    expect(setting.voice).toBe("Charon");

    const forSession = await t.query(internal.voiceSettings.getSpokenVoiceForCompany, {
      companyId,
    });
    expect(forSession).toBe("Charon");

    const audits = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
    const entry = audits.find((row) => row.actionType === "UPDATE_SPOKEN_VOICE");
    expect(entry?.companyId).toBe(companyId);
    expect(entry?.metadata).toContain("Charon");
  });

  test("a voice the platform cannot speak with is refused", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { client } = await seedAdmin(t);

    await expect(
      client.mutation(api.voiceSettings.setSpokenVoice, { voice: "Barry" })
    ).rejects.toThrow(/not one the platform can speak with/);
  });

  test("a workspace's voice is its own — another company still hears the default", async () => {
    const t = convexTest(schema, import.meta.glob("./**/*.*s"));
    const { client } = await seedAdmin(t);
    await client.mutation(api.voiceSettings.setSpokenVoice, { voice: "Puck" });

    const otherCompanyId = await t.run(async (ctx) => {
      return await ctx.db.insert("companies", { name: "Bravo", createdAt: Date.now() });
    });
    const other = await t.query(internal.voiceSettings.getSpokenVoiceForCompany, {
      companyId: otherCompanyId as Id<"companies">,
    });
    expect(other).toBe("Aoede");
  });
});
