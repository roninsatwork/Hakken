import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { channelKey, emptyRow, packList, type ListRow, type PartOnly } from "./googleAnalyticsLists";
import { slotKey } from "./googleAnalyticsCollect";
import { conversionsOf, eachSlotPart, readSlot } from "./googleAnalyticsRows";
import { channelLanding, eachLandingByChannel, landingByChannel } from "./googleAnalyticsChannelReads";

/**
 * A long stored list read a part at a time, each row with only what a read names (2026-11-04: a year of landing pages
 * by channel, or every page's, read whole as rows ran their reads out of Convex's 64MB on More Handles): the same
 * figures as the list read whole, a part's rows let go before the next.
 */

const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
const EVENTS = ["generate_lead", "contact"];
const COUNTED = [{ eventName: "generate_lead", fromAnalytics: true, hakken: null }];

function row(key: string, visits: number, leads = 0): ListRow {
  const out = { ...emptyRow(key), visits, engaged: visits, seconds: visits * 30, views: visits * 2, people: visits, newPeople: visits, length: visits * 40 };
  out.counts.set("generate_lead", leads);
  out.values.set("generate_lead", leads * 1_000);
  out.eventVisits!.set("generate_lead", leads);
  out.eventTimes!.set("generate_lead", leads);
  return out;
}

/** A list kept as the runs keep it: its slot and its parts of 2,000 rows. */
async function keep(ctx: Pick<MutationCtx, "db">, holdId: Id<"companyWebsites">, key: string, rows: ListRow[]) {
  const parts = packList("landingChannel", rows, EVENTS);
  await ctx.db.insert("googleAnalyticsPeriodSlots", { companyWebsiteId: holdId, key, slot: 1, parts: parts.length, from: "2026-10-01", to: "2026-10-30", hash: "x", builtAt: 1, thresholded: true });
  for (const [part, packed] of parts.entries()) await ctx.db.insert("googleAnalyticsPeriods", { companyWebsiteId: holdId, key, slot: 1, part, ...packed });
}

/**
 * Landing pages by channel past one part: ChatGPT's referrals to /a/ filed under Referral, Google's own AI Assistant
 * channel on /b/, and filler pages enough for a second part.
 */
async function landingWebsite() {
  const t = harness();
  const holdId = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Acme", createdAt: 1 });
    const websiteId = await ctx.db.insert("websites", { host: "acme-shop.test", displayHost: "acme-shop.test", firstSeenAt: 1 });
    const hold = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", createdAt: 1 });
    const filler = Array.from({ length: 2_010 }, (_, at) => row(channelKey(`/p${at}/`, at % 2 ? "Organic Search" : "Direct"), 1));
    await keep(ctx, hold, slotKey("landingChannel", "thisMonth", "NOW", ""), [
      row(channelKey("/a/", "Organic Search"), 20, 2),
      row(channelKey("/a/", "Referral"), 10, 3),
      row(channelKey("/b/", "AI Assistant"), 3, 1),
      row(channelKey("/c/", "Referral"), 2),
      ...filler,
    ]);
    await keep(ctx, hold, slotKey("landingAssistant", "thisMonth", "NOW", ""), [
      row(channelKey("/a/", channelKey("Referral", "chatgpt.com")), 4, 1),
      // Not an assistant: never taken out of Referral.
      row(channelKey("/c/", channelKey("Referral", "example.com")), 2),
    ]);
    return hold;
  });
  return { t, holdId };
}

/** A row's figures as the reads take them: its key, visits, engaged visits and counted conversions. */
const figures = (rows: readonly ListRow[]) => rows.map((one) => [one.key, one.visits, one.engaged, conversionsOf(one, COUNTED).conversions]);

describe("a stored list a part at a time", () => {
  test("each part's rows in order, with only what is named, the same figures as the list read whole", async () => {
    const { t, holdId } = await landingWebsite();
    await t.run(async (ctx) => {
      const key = slotKey("landingChannel", "thisMonth", "NOW", "");
      const whole = (await readSlot(ctx, holdId, key))!;
      const sizes: number[] = [];
      const only: PartOnly = { events: new Set(["generate_lead"]) };
      const notes = await eachSlotPart(ctx, holdId, key, only, (rows, part) => {
        sizes.push(rows.length);
        expect(part.events).toEqual(EVENTS);
      });
      expect(sizes).toEqual([2_000, 14]);
      expect(notes).toEqual({ from: "2026-10-01", to: "2026-10-30", folded: false, thresholded: true, cut: false });
      const lean = (await readSlot(ctx, holdId, key, only))!;
      expect(figures(lean.rows)).toEqual(figures(whole.rows));
      // Only the event named, and its nought left out.
      expect(lean.rows.find((one) => one.key === channelKey("/a/", "Referral"))?.counts).toEqual(new Map([["generate_lead", 3]]));
      expect(lean.rows.find((one) => one.key === channelKey("/c/", "Referral"))?.counts.size).toBe(0);
      expect(await eachSlotPart(ctx, holdId, slotKey("landingChannel", "lastMonth", "NOW", ""), only, () => undefined)).toBeNull();
    });
  });

  test("landing pages by channel a part at a time: the same rows, in the same order, whole or with only what is named", async () => {
    const { t, holdId } = await landingWebsite();
    await t.run(async (ctx) => {
      const whole = (await landingByChannel(ctx, holdId, "thisMonth", "NOW", ""))!;
      // ChatGPT's 4 visits and lead out of /a/'s Referral, and with Google's own AI Assistant channel on /b/ as AI assistants.
      expect(figures(whole.rows.filter((one) => !one.key.startsWith("/p")))).toEqual([
        [channelKey("/a/", "Organic Search"), 20, 20, 2],
        [channelKey("/a/", "Referral"), 6, 6, 2],
        [channelKey("/c/", "Referral"), 2, 2, 0],
        [channelKey("/a/", "AI assistants"), 4, 4, 1],
        [channelKey("/b/", "AI assistants"), 3, 3, 1],
      ]);
      expect([whole.assistants, whole.everyDevice, whole.thresholded]).toEqual([true, false, true]);

      const lean: ListRow[] = [];
      const notes = await eachLandingByChannel(ctx, holdId, "thisMonth", "NOW", "", "", { events: new Set(["generate_lead"]) }, (one) => lean.push(one));
      expect(figures(lean)).toEqual(figures(whole.rows));
      expect(notes).toMatchObject({ assistants: true, everyDevice: false, from: "2026-10-01", to: "2026-10-30" });

      // Some pages only: their rows alone, as the whole list gives them.
      const some: ListRow[] = [];
      await eachLandingByChannel(ctx, holdId, "thisMonth", "NOW", "", "", { events: new Set(["generate_lead"]), keep: (page) => page === "/a/" }, (one) => some.push(one));
      expect(figures(some)).toEqual(figures(whole.rows.filter((one) => one.key.startsWith("/a/\u001f"))));

      // One channel's pages keyed by page, and every row's visits and engaged visits added up.
      const ai = (await channelLanding(ctx, holdId, "thisMonth", "NOW", "", "", "AI assistants", new Set(["generate_lead"])))!;
      expect(figures(ai.rows)).toEqual([["/a/", 4, 4, 1], ["/b/", 3, 3, 1]]);
      const total = whole.rows.reduce((sum, one) => sum + one.visits, 0);
      expect(ai.site).toEqual({ visits: total, engaged: total });
      expect(await channelLanding(ctx, holdId, "lastMonth", "NOW", "", "", "AI assistants", new Set())).toBeNull();
    });
  });
});
