import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { writeKeywordCopy } from "@/src/test/keywordCopies";

/**
 * Downloading a whole Sites table (docs/plans/active/user-sites-plan.md,
 * "Tables", "Speed"): the file is made on the server from the table's index
 * and handed straight back — only to a member of the company that holds the
 * site, and never stored.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
const UK = 2826;

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) =>
    await ctx.db.insert("users", {
      name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now(),
    }));
  return t.withIdentity({ subject: userId });
}

async function pull(t: Harness, websiteId: Id<"websites">) {
  return await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: "ai_answer_perplexity", family: "AI Optimization", mode: "LIVE", websiteId, taskArgsJson: "{}",
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0.02, sandbox: false, submittedAt: Date.now(),
  } as never));
}

async function hold(t: Harness, companyId: Id<"companies">, host: string) {
  return await t.run(async (ctx) => {
    const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
    const holdId = await ctx.db.insert("companyWebsites", { companyId, websiteId, relationship: "OWNED", locationCode: UK, createdAt: Date.now() });
    return { websiteId, holdId };
  });
}

describe("downloading a whole table", () => {
  test("the file is made on the server, holds every row, and only the asker's company can see it", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const other = await company(t, "Someone Else");
    const own = await hold(t, ronins, "ronins.co.uk");
    const theirs = await hold(t, other, "theirs.co.uk");
    await t.run(async (ctx) => {
      await ctx.db.insert("siteKeywordRanks", {
        websiteId: own.websiteId, locationCode: UK, keyword: '=HYPERLINK("https://evil.example")', position: 1,
        band: "p01_03", page: "/", volume: 10, volumeKnown: true, intent: "OTHER", status: "SAME", change: 0,
        day: "2026-09-23", firstSeenDay: "2026-09-01", searchText: "hyperlink", updatedAt: Date.now(),
      });
      // A carriage return or a semicolon mid-cell must not start a new cell or row.
      for (const keyword of ["x\r=cmd|' /C calc'!A0", "plumber;=1+1"]) {
        await ctx.db.insert("siteKeywordRanks", {
          websiteId: own.websiteId, locationCode: UK, keyword, position: 2,
          band: "p01_03", page: "/", volume: 10, volumeKnown: true, intent: "OTHER", status: "SAME", change: 0,
          day: "2026-09-23", firstSeenDay: "2026-09-01", searchText: "odd", updatedAt: Date.now(),
        });
      }
      for (let index = 0; index < 1_202; index += 1) {
        await ctx.db.insert("siteKeywordRanks", {
          websiteId: own.websiteId, locationCode: UK, keyword: `search, number ${index}`, position: (index % 90) + 1,
          band: "p04_10", page: "/services/", volume: 10, volumeKnown: true, intent: "BUYING", status: "SAME", change: 0,
          day: "2026-09-23", firstSeenDay: "2026-09-01", searchText: `search ${index}`, updatedAt: Date.now(),
        });
      }
    });

    const asRonins = await member(t, ronins);
    const file = await asRonins.action(api.siteExports.exportSiteTable, { siteId: own.holdId, kind: "keywords" });
    expect(file).toMatchObject({ rows: 1_205, complete: true, fileName: expect.stringMatching(/^ronins\.co\.uk-keywords-\d{4}-\d{2}-\d{2}\.csv$/) });
    const lines = file.csv.split("\n");
    expect(lines[0]).toBe("keyword,position,change,status,volume,intent,difficulty,cpc_usd,traffic,page,last_checked");
    expect(lines).toHaveLength(1_206);
    // A comma inside a keyword is quoted, not a new column.
    expect(lines.some((row) => /^"search, number \d+",/.test(row))).toBe(true);
    // Text that would run as a formula in a spreadsheet does not: it gains a
    // leading apostrophe (and its quotes are doubled, as CSV does).
    expect(file.csv).not.toMatch(/(^|\n|,|")=HYPERLINK/);
    expect(file.csv).toContain(`"'=HYPERLINK(""https://evil.example"")"`);
    expect(file.csv).toContain(`"x\r=cmd|' /C calc'!A0",`);
    expect(file.csv).toContain(`"plumber;=1+1",`);

    // Another company cannot download a site that is not theirs, either way round.
    const asOther = await member(t, other);
    await expect(asOther.action(api.siteExports.exportSiteTable, { siteId: own.holdId, kind: "keywords" }))
      .rejects.toThrow(/not one your company holds/);
    await expect(asRonins.action(api.siteExports.exportSiteTable, { siteId: theirs.holdId, kind: "backlinks" }))
      .rejects.toThrow(/not one your company holds/);
  });

  test("the content gap file has a position and traffic pair per competitor, in the order on screen", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const rivals = await t.run(async (ctx) => {
      const watch = async (host: string) => {
        const websiteId = await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
        const holdId = await ctx.db.insert("companyWebsites", {
          companyId: ronins, websiteId, relationship: "TRACKED", againstWebsiteId: own.websiteId, createdAt: Date.now(),
        });
        return { websiteId, holdId };
      };
      const chilli = await watch("chilliapple.co.uk");
      const pixel = await watch("pixelfield.co.uk");
      // Each website's keywords as its copy keeps them: the gap is worked out from these when read.
      await writeKeywordCopy(ctx, own.websiteId, UK, [{ keyword: "web design", position: 1, day: "2026-09-29" }]);
      await writeKeywordCopy(ctx, chilli.websiteId, UK, [
        { keyword: "development website", position: 2, volume: 8100, difficulty: 61, traffic: 0.08, day: "2026-09-29" },
      ]);
      await writeKeywordCopy(ctx, pixel.websiteId, UK, [
        { keyword: "development website", position: 17, volume: 8100, difficulty: 61, traffic: 12.6, day: "2026-09-29" },
        { keyword: "single page app", position: 27, volume: 165000, difficulty: 61, traffic: 0.5, day: "2026-09-29" },
        // The website ranks for it too: no gap.
        { keyword: "web design", position: 3, volume: 5000, day: "2026-09-29" },
      ]);
      return { chilli, pixel };
    });

    const asRonins = await member(t, ronins);
    const file = await asRonins.action(api.siteExports.exportSiteTable, {
      siteId: own.holdId, kind: "gap", sort: `position:${rivals.pixel.holdId}`, direction: "asc",
    });
    const lines = file.csv.split("\n");
    expect(lines[0]).toBe("keyword,intent,volume,difficulty,"
      + "chilliapple.co.uk_position,chilliapple.co.uk_traffic,pixelfield.co.uk_position,pixelfield.co.uk_traffic,last_checked");
    // By pixelfield's position, the top first, as the table was sorted.
    expect(lines.slice(1)).toEqual([
      "development website,BUYING,8100,61,2,0,17,13,2026-09-29",
      "single page app,BUYING,165000,61,,,27,1,2026-09-29",
    ]);
  });

  test("the answers file walks every question's answers, one question after another", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const surrey = "who are the best web designers in surrey";
    const shopify = "who builds shopify sites";
    await t.run(async (ctx) => {
      await ctx.db.insert("websiteQuestions", { websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt: shopify, engines: ["perplexity"], isActive: true, createdAt: Date.now() });
      await ctx.db.insert("websiteQuestions", { websiteId: own.websiteId, companyWebsiteId: own.holdId, prompt: surrey, engines: ["perplexity", "chatgpt"], isActive: true, createdAt: Date.now() });
    });
    const answer = async (prompt: string, engine: "perplexity" | "chatgpt", text: string, brands: unknown[]) =>
      await t.mutation(internal.seoCollectionParse.writeAiCitations, {
        pullId: await pull(t, own.websiteId), prompt, engine, day: "2026-09-23", brands: brands as never,
        sources: [{ url: "https://ronins.co.uk/" }], answer: text,
      });
    await answer(surrey, "perplexity", "Ronins is the one to call.", [{ websiteId: own.websiteId, text: "Ronins", variantKind: "NAME", stance: "RECOMMENDED" }]);
    await answer(surrey, "chatgpt", "Try Example Agency.", []);
    await answer(shopify, "perplexity", "Several, Ronins among them.", [{ websiteId: own.websiteId, text: "Ronins", variantKind: "NAME", stance: "MENTIONED" }]);

    const file = await (await member(t, ronins)).action(api.siteExports.exportSiteTable, { siteId: own.holdId, kind: "answers" });
    expect(file).toMatchObject({ rows: 3, complete: true });
    const [header, ...rows] = file.csv.split("\n");
    expect(header).toBe("day,engine,question,this_website,answer,sources");
    // Questions in order, and each answer with how it treated the site.
    expect(rows.map((row) => row.split(",").slice(1, 4).join(",")).sort()).toEqual([
      `chatgpt,${surrey},not named`,
      `perplexity,${surrey},recommended`,
      `perplexity,${shopify},named`,
    ]);
    expect(rows.findIndex((row) => row.includes(surrey))).toBeLessThan(rows.findIndex((row) => row.includes(shopify)));
    expect(file.csv).toContain(`"Several, Ronins among them."`);
  });
});
