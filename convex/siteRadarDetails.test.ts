import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { useFixedDay } from "@/src/test/realTime";
import { packColumn } from "./utils/packedColumns";

/**
 * One website and One question (discovery-detail-and-hakken-sees-plan.md §3):
 * worked out from the website's Brand radar reading and its rivals', the
 * rivals' shared links and the pages naming the website — with What Hakken
 * sees saying what it means and what to do first.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));

beforeEach(() => useFixedDay("2026-10-09"));
afterEach(() => vi.useRealTimers());

const COST = "how much does a website cost in the uk";
const SURREY = "best web design agency in surrey";

async function seed() {
  const t = harness();
  const ids = await t.run(async (ctx) => {
    const companyId = await ctx.db.insert("companies", { name: "Ronins", createdAt: Date.now() });
    const userId = await ctx.db.insert("users", { name: "Member", email: "m@ronins.co.uk", role: "ADMIN" as const, companyId, createdAt: Date.now() });
    const site = (host: string) => ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const own = await site("ronins.co.uk");
    const brightside = await site("brightside.co.uk");
    const kestrel = await site("kestrel.co.uk");
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId: own, relationship: "OWNED", locationCode: 2826, createdAt: Date.now() });
    for (const websiteId of [brightside, kestrel]) {
      await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "TRACKED", againstWebsiteId: own, locationCode: 2826, createdAt: Date.now() });
    }
    const pullId = await ctx.db.insert("seoDataPulls", { operationId: "radar_mentions", family: "AI Optimization", mode: "LIVE", taskArgsJson: "{}", status: "READY", tag: "r", attempts: 0, costUsd: 0.3, sandbox: false, submittedAt: Date.now() });
    const reading = (websiteId: Id<"websites">, questions: Array<{ question: string; volume: number; firstAt?: number; pages: string[] }>) => {
      const pages = [...new Set(questions.flatMap((entry) => entry.pages))];
      const starts: number[] = [];
      const sourceOf: number[] = [];
      for (const entry of questions) {
        starts.push(sourceOf.length);
        sourceOf.push(...entry.pages.map((url) => pages.indexOf(url)));
      }
      return ctx.db.insert("brandRadarQuestionParts", {
        websiteId, locationCode: 2826, month: "2026-10", total: questions.length,
        questions: questions.map((entry) => entry.question),
        volumes: packColumn(questions.map((entry) => entry.volume)),
        firstAt: packColumn(questions.map((entry) => entry.firstAt)),
        pages, starts: packColumn(starts), sourceOf: packColumn(sourceOf), pullId, updatedAt: Date.now(),
      });
    };
    await reading(own, [
      { question: SURREY, volume: 1300, firstAt: 40, pages: ["https://clutch.co/uk/web-designers/surrey", "https://www.ronins.co.uk/web-design-surrey/"] },
    ]);
    await reading(brightside, [
      { question: COST, volume: 2900, firstAt: 10, pages: ["https://brightside.co.uk/website-cost-guide/", "https://clutch.co/pricing/web-design"] },
      { question: SURREY, volume: 1300, firstAt: 5, pages: ["https://clutch.co/uk/web-designers/surrey"] },
    ]);
    await reading(kestrel, [
      { question: COST, volume: 2900, firstAt: 90, pages: ["https://clutch.co/pricing/web-design"] },
    ]);
    await ctx.db.insert("linkGapPairs", { websiteId: own, rivals: ["brightside.co.uk", "kestrel.co.uk"], month: "2026-10", domains: ["clutch.co"], strength: packColumn([712]), updatedAt: Date.now() } as never);
    return { userId, holdId };
  });
  return { as: t.withIdentity({ subject: ids.userId }), siteId: ids.holdId };
}

describe("One website", () => {
  test("how often it is quoted beside you and your rivals, the questions, its pages and who it links to", async () => {
    const { as, siteId } = await seed();
    const clutch = await as.query(api.siteRadarDetails.websiteDetail, { siteId, host: "www.clutch.co" });
    expect(clutch).toMatchObject({ host: "clutch.co", kind: "DIRECTORY", times: 4, besideYou: 1, besideRivals: 3, rivals: 2, strength: 712, asks: 4200 });
    expect(clutch.linksTo).toEqual(["brightside.co.uk", "kestrel.co.uk"]);
    expect(clutch.questions.find((row) => row.question === COST)?.named).toEqual([{ host: "brightside.co.uk", you: false }, { host: "kestrel.co.uk", you: false }]);
    expect(clutch.pages.map((row) => [row.url, row.times])).toEqual([["https://clutch.co/uk/web-designers/surrey", 2], ["https://clutch.co/pricing/web-design", 2]]);
    expect(clutch.businesses).toEqual([
      { host: "ronins.co.uk", you: true, on: "NOT_LINKED", quotedBeside: 1 },
      { host: "brightside.co.uk", you: false, on: "LINKS", quotedBeside: 2 },
      { host: "kestrel.co.uk", you: false, on: "LINKS", quotedBeside: 1 },
    ]);
  });

  test("What Hakken sees: quoted mostly beside rivals, linking to them, so get listed and answer what you are missing", async () => {
    const { as, siteId } = await seed();
    const { seen } = await as.query(api.siteRadarDetails.websiteDetail, { siteId, host: "clutch.co" });
    expect(seen.says.map((phrase) => phrase.code)).toEqual(["mostlyRivals", "linksToRivals", "notOnIt"]);
    expect(seen.says[1]).toMatchObject({ a: 2, more: "brightside.co.uk, kestrel.co.uk" });
    expect(seen.steps).toEqual([
      { code: "getListed", text: "clutch.co", link: "visit", to: { url: "https://clutch.co" } },
      { code: "answerQuestion", text: COST, link: "seeQuestion", to: { record: "question", key: COST } },
    ]);
  });
});

describe("One question", () => {
  test("the businesses it names in order, and the pages it quotes, whose and of what kind", async () => {
    const { as, siteId } = await seed();
    const cost = await as.query(api.siteRadarDetails.questionDetail, { siteId, question: COST.toUpperCase() });
    expect(cost).toMatchObject({ question: COST, found: true, volume: 2900, month: "2026-10", tracked: false });
    expect(cost.named).toEqual([
      { host: "brightside.co.uk", you: false, place: 1, page: "https://brightside.co.uk/website-cost-guide/" },
      { host: "kestrel.co.uk", you: false, place: 2, page: null },
      { host: "ronins.co.uk", you: true, place: null, page: null },
    ]);
    expect(cost.pages.map((row) => [row.host, row.kind])).toEqual([["brightside.co.uk", "RIVAL"], ["clutch.co", "DIRECTORY"]]);
    expect(cost.seen.says.map((phrase) => phrase.code)).toEqual(["namesOther", "noPage", "rivalPages"]);
    expect(cost.seen.steps.map((step) => step.code)).toEqual(["answerOnPage", "getListedOn"]);
  });

  test("a question naming you says where, and quotes your page", async () => {
    const { as, siteId } = await seed();
    const surrey = await as.query(api.siteRadarDetails.questionDetail, { siteId, question: SURREY });
    expect(surrey.named.map((row) => [row.host, row.place])).toEqual([["brightside.co.uk", 1], ["ronins.co.uk", 2]]);
    expect(surrey.seen.says.slice(0, 2)).toEqual([{ code: "namesYou", a: 1300, b: 2 }, { code: "yourPage", text: "/web-design-surrey/" }]);
  });

  test("a question no reading holds says so, and offers nothing to do", async () => {
    const { as, siteId } = await seed();
    const gone = await as.query(api.siteRadarDetails.questionDetail, { siteId, question: "a question nobody asked" });
    expect(gone.found).toBe(false);
    expect(gone.seen).toEqual({ says: [{ code: "notFound" }], steps: [] });
  });
});
