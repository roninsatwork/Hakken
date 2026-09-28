import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { holdQuestions } from "./holdLists";
import { AI_ENGINES, answerPlace, type AiEngine } from "./seoAiEngines";
import { listHold, listWebsiteId } from "./siteAccess";
import { citedPagesOf, QUESTIONS_FOR_CITED_PAGES } from "./siteFigures";
import { addUpList, questionEngine } from "./siteListAi";
import { loadSite, MAX_LIST } from "./websiteSiteRows";

/**
 * Each company's AI figures from one summary per list
 * (docs/plans/active/sites-ai-list-summaries-plan.md). The screens used to
 * read a row or thirty per question and engine every time they opened; they
 * now read the list's rows, worked out as the answers are filed. The proof
 * that matters is that nobody can tell: for the same answers, every figure is
 * what it was — checked here against the old readings, kept as the yardstick.
 */
const harness = () => convexTest(schema, import.meta.glob("./**/*.*s"));
type Harness = ReturnType<typeof harness>;
type Stance = "RECOMMENDED" | "MENTIONED" | "WARNED_AGAINST";
const UK = 2826;
const LEEDS = 1006925;
const SURREY = "who are the best web designers in surrey";
const WORDPRESS = "best wordpress agency in the south east";
const CHARITIES = "who builds websites for charities";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function company(t: Harness, name: string) {
  return await t.run(async (ctx) => await ctx.db.insert("companies", { name, createdAt: Date.now() }));
}

async function member(t: Harness, companyId: Id<"companies">) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
    name: "Member", email: `m-${Math.random()}@test.com`, role: "ADMIN" as const, companyId, createdAt: Date.now(),
  }));
  return t.withIdentity({ subject: userId });
}

async function superAdmin(t: Harness) {
  const userId = await t.run(async (ctx) => await ctx.db.insert("users", {
    name: "Super", email: `s-${Math.random()}@test.com`, role: "SUPER_ADMIN" as const, createdAt: Date.now(),
  }));
  return t.withIdentity({ subject: userId });
}

async function website(t: Harness, host: string) {
  return await t.run(async (ctx) => {
    const existing = await ctx.db.query("websites").withIndex("by_host", (q) => q.eq("host", host)).unique();
    return existing?._id ?? await ctx.db.insert("websites", { host, displayHost: host, firstSeenAt: Date.now() });
  });
}

async function hold(t: Harness, companyId: Id<"companies">, host: string, against?: Id<"websites">) {
  const websiteId = await website(t, host);
  const holdId = await t.run(async (ctx) => await ctx.db.insert("companyWebsites", {
    companyId, websiteId, relationship: against ? "TRACKED" : "OWNED", createdAt: Date.now(),
    ...(against ? { againstWebsiteId: against } : { locationCode: UK }),
  }));
  return { websiteId, holdId };
}

async function ask(t: Harness, list: { websiteId: Id<"websites">; holdId: Id<"companyWebsites"> }, prompt: string, engines: AiEngine[], isActive = true) {
  await t.run(async (ctx) => await ctx.db.insert("websiteQuestions", {
    websiteId: list.websiteId, companyWebsiteId: list.holdId, prompt, engines, isActive, createdAt: Date.now(),
  }));
}

/** One answer, filed the way a collection files it: its brands with their stances, and the pages it cited. */
async function file(t: Harness, answer: {
  asker: Id<"websites">; prompt: string; engine: AiEngine; day: string;
  brands?: Array<[Id<"websites">, Stance]>; cited?: Array<[string, Id<"websites">]>; city?: string;
}) {
  const pullId = await t.run(async (ctx) => await ctx.db.insert("seoDataPulls", {
    operationId: `ai_citation_${answer.engine}`, family: "AI Optimization", mode: "LIVE", websiteId: answer.asker,
    taskArgsJson: answer.city ? JSON.stringify({ web_search_city: answer.city }) : "{}",
    status: "READY", tag: `t-${Math.random()}`, attempts: 0, costUsd: 0, sandbox: false, submittedAt: Date.now(),
  } as never));
  await t.mutation(internal.seoCollectionParse.writeAiCitations, {
    pullId, prompt: answer.prompt, engine: answer.engine, day: answer.day,
    brands: (answer.brands ?? []).map(([websiteId, stance]) => ({ websiteId, text: "A firm", variantKind: "NAME" as const, stance })),
    sources: (answer.cited ?? []).map(([url, websiteId]) => ({ url, websiteId })),
  });
}

/** The cited pages recounted, as their own jobs do a moment after a filing, then each list added up. */
async function settle(t: Harness, holdIds: Array<Id<"companyWebsites">>) {
  vi.advanceTimersByTime(1);
  await t.finishInProgressScheduledFunctions();
  for (const holdId of holdIds) await t.action(internal.siteListAi.summariseList, { holdId });
}

/** What each screen read before the summaries (d9943531), per question and engine: the yardstick. */
async function before(t: Harness, siteId: Id<"companyWebsites">) {
  return await t.run(async (ctx) => {
    const site = (await loadSite(ctx, siteId))!;
    const websiteId = site.website._id;
    const askerId = listWebsiteId(site);
    const holdId = listHold(site);
    const questions = await holdQuestions(ctx, holdId, MAX_LIST);
    const statsOf = (prompt: string, engine: AiEngine) => ctx.db
      .query("websiteQuestionStats")
      .withIndex("by_key", (q) => q.eq("websiteId", askerId).eq("prompt", prompt).eq("engine", engine).eq("locationCode", answerPlace(engine, site.place)))
      .unique();
    const answersOf = (prompt: string, engine: AiEngine, count: number) => ctx.db
      .query("aiAnswers")
      .withIndex("by_question", (q) => q.eq("prompt", prompt).eq("engine", engine).eq("locationCode", answerPlace(engine, site.place)))
      .order("desc")
      .take(count);

    // Mentions: the asker's stats and newest answer; a competitor's last thirty answers.
    const mentions = [];
    for (const question of questions) {
      for (const engine of question.engines) {
        const stats = askerId === websiteId ? await statsOf(question.prompt, engine) : null;
        const answers = await answersOf(question.prompt, engine, askerId === websiteId ? 1 : 30);
        const newest = answers[0];
        const lastStance = !newest ? null
          : newest.warnedAgainst.includes(websiteId) ? "WARNED_AGAINST"
            : newest.recommended.includes(websiteId) ? "RECOMMENDED"
              : newest.named.includes(websiteId) ? "NAMED" : "NOT_NAMED";
        const counted = stats ?? {
          asked: answers.length,
          named: answers.filter((answer) => answer.named.includes(websiteId)).length,
          recommended: answers.filter((answer) => answer.recommended.includes(websiteId)).length,
          warnedAgainst: answers.filter((answer) => answer.warnedAgainst.includes(websiteId)).length,
        };
        mentions.push({
          prompt: question.prompt, engine, asked: counted.asked, named: counted.named, recommended: counted.recommended,
          warnedAgainst: counted.warnedAgainst, lastAskedDay: newest?.day ?? null, lastStance,
        });
      }
    }
    mentions.sort((left, right) => left.prompt.localeCompare(right.prompt) || AI_ENGINES.indexOf(left.engine) - AI_ENGINES.indexOf(right.engine));

    // Share of voice: the asker's stats, every question, with who else they named.
    const voice = new Map<AiEngine, { asked: number; lastDay: string; named: Map<Id<"websites">, number> }>();
    // Side by side: the questions still asked, with the last day each website was named.
    let answersCounted = 0;
    const rivalsNamed = new Map<Id<"websites">, { times: number; lastDay: string | null }>();
    for (const question of questions) {
      for (const engine of question.engines) {
        const stats = await statsOf(question.prompt, engine);
        if (!stats) continue;
        const held = voice.get(engine) ?? { asked: 0, lastDay: stats.lastAskedDay, named: new Map() };
        held.asked += stats.asked;
        if (stats.lastAskedDay > held.lastDay) held.lastDay = stats.lastAskedDay;
        held.named.set(askerId, (held.named.get(askerId) ?? 0) + stats.named);
        for (const other of stats.othersNamed) held.named.set(other.websiteId, (held.named.get(other.websiteId) ?? 0) + other.times);
        voice.set(engine, held);
        if (!question.isActive) continue;
        answersCounted += stats.asked;
        const self = rivalsNamed.get(askerId) ?? { times: 0, lastDay: null };
        self.times += stats.named;
        if (stats.lastNamedDay && (!self.lastDay || stats.lastNamedDay > self.lastDay)) self.lastDay = stats.lastNamedDay;
        rivalsNamed.set(askerId, self);
        for (const other of stats.othersNamed) {
          const seen = rivalsNamed.get(other.websiteId) ?? { times: 0, lastDay: null };
          seen.times += other.times;
          if (!seen.lastDay || other.lastDay > seen.lastDay) seen.lastDay = other.lastDay;
          rivalsNamed.set(other.websiteId, seen);
        }
      }
    }

    // A competitor's AI figure: engines whose newest answer, to any of the first 25 questions, named it.
    const engines = new Map<AiEngine, boolean>();
    for (const question of questions.slice(0, 25)) {
      for (const engine of question.engines) {
        const [newest] = await answersOf(question.prompt, engine, 1);
        if (newest) engines.set(engine, Boolean(engines.get(engine)) || newest.named.includes(websiteId));
      }
    }
    const cited = await citedPagesOf(ctx, websiteId, holdId, site.place, QUESTIONS_FOR_CITED_PAGES);
    // Plain objects out: a function's result holds no maps.
    return {
      mentions,
      voice: Object.fromEntries([...voice].map(([engine, held]) =>
        [engine, { asked: held.asked, lastDay: held.lastDay, named: Object.fromEntries(held.named) as Record<string, number> }])),
      enginesNaming: engines.size === 0 ? null : { named: [...engines.values()].filter(Boolean).length, asked: engines.size },
      citedPages: cited.length,
      citedByEngine: AI_ENGINES.map((engine) => ({ engine, pages: cited.filter((page) => page.engines.includes(engine)).length })),
      answersCounted,
      rivalsNamed: Object.fromEntries(rivalsNamed) as Record<string, { times: number; lastDay: string | null }>,
    };
  });
}

/**
 * Ronins, its two competitors, a website watched against nothing, and a firm
 * nobody watches; three questions, one paused; three rounds of answers that
 * name, recommend and warn against each of them in turn and cite their pages.
 * And another company asking one of the same questions, with its own
 * competitor, and an answer from another place — neither of them Ronins'.
 */
async function world(t: Harness) {
  const ronins = await company(t, "Ronins");
  const other = await company(t, "Someone Else");
  const own = await hold(t, ronins, "ronins.co.uk");
  const lightflows = await hold(t, ronins, "lightflows.co.uk", own.websiteId);
  const pixelfield = await hold(t, ronins, "pixelfield.co.uk", own.websiteId);
  const stray = await hold(t, ronins, "stray.co.uk");
  await t.run(async (ctx) => await ctx.db.patch(stray.holdId, { relationship: "TRACKED", locationCode: undefined }));
  const theirs = await hold(t, other, "otheragency.co.uk");
  const theirRival = await hold(t, other, "chilliapple.co.uk", theirs.websiteId);
  const nobody = await website(t, "bigagency.co.uk");

  const [first, second, third] = AI_ENGINES;
  await ask(t, own, SURREY, [first, second, third]);
  await ask(t, own, WORDPRESS, [...AI_ENGINES]);
  await ask(t, own, CHARITIES, [first], false);
  await ask(t, theirs, SURREY, [first]);

  const stances: Stance[] = ["RECOMMENDED", "MENTIONED", "WARNED_AGAINST"];
  const cast = [own.websiteId, lightflows.websiteId, pixelfield.websiteId, nobody, theirRival.websiteId];
  for (const [round, day] of ["2026-09-20", "2026-09-22", "2026-09-24"].entries()) {
    for (const [qIndex, [prompt, engines]] of ([[SURREY, [first, second, third]], [WORDPRESS, AI_ENGINES], [CHARITIES, [first]]] as const).entries()) {
      for (const [eIndex, engine] of engines.entries()) {
        const seed = round + qIndex * 3 + eIndex * 5;
        // Some answers name nobody the company tracks.
        const brands = seed % 4 === 3 ? [] : cast
          .filter((_, index) => (seed + index) % 3 !== 0)
          .map((websiteId, index): [Id<"websites">, Stance] => [websiteId, stances[(seed + index) % 3]]);
        const cited: Array<[string, Id<"websites">]> = seed % 2 === 0
          ? [[`https://ronins.co.uk/page-${seed % 3}/`, own.websiteId], [`https://lightflows.co.uk/work-${seed % 2}/`, lightflows.websiteId]]
          : [[`https://www.ronins.co.uk/page-${seed % 3}/`, own.websiteId]];
        await file(t, { asker: own.websiteId, prompt, engine, day, brands, cited });
      }
    }
  }
  // Asked from Leeds by the other company: another answer, not Ronins'.
  await file(t, { asker: theirs.websiteId, prompt: SURREY, engine: first, day: "2026-09-25", city: "Leeds", brands: [[own.websiteId, "RECOMMENDED"]] });
  await settle(t, [own.holdId, theirs.holdId]);
  return { ronins, other, own, lightflows, pixelfield, stray, theirs, theirRival, nobody };
}

describe("the AI figures from each list's summary", () => {
  test("equal what every screen showed before, per question and engine, on the owned site and each competitor", async () => {
    const t = harness();
    const w = await world(t);
    const asRonins = await member(t, w.ronins);

    for (const site of [w.own, w.lightflows, w.pixelfield]) {
      const was = await before(t, site.holdId);
      // Mentions, row for row.
      expect(await asRonins.query(api.siteAi.listMentions, { siteId: site.holdId })).toEqual(was.mentions);
      // Share of voice, engine by engine and website by website.
      const voice = await asRonins.query(api.siteAi.shareOfVoice, { siteId: site.holdId });
      expect(voice.map((row) => row.engine)).toEqual(AI_ENGINES.filter((engine) => engine in was.voice));
      for (const row of voice) {
        const held = was.voice[row.engine];
        expect({ asked: row.asked, lastDay: row.lastDay }).toEqual({ asked: held.asked, lastDay: held.lastDay });
        for (const entry of row.sites) expect([entry.websiteId, entry.named]).toEqual([entry.websiteId, held.named[entry.websiteId] ?? 0]);
      }
      // The menu's count of cited pages, and each assistant's on the Overview.
      const header = await asRonins.query(api.sites.getMySite, { siteId: site.holdId });
      expect(header?.counts.citedPages).toBe(was.citedPages);
      const overview = await asRonins.query(api.siteOverview.overviewExtras, { siteId: site.holdId });
      expect(overview.assistants).toEqual(was.citedByEngine);
      // Side by side: how often the answers named each website beside it.
      const rivals = await asRonins.query(api.siteCompetitors.listRivals, { siteId: site.holdId });
      for (const rival of rivals) {
        const seen = was.rivalsNamed[rival.websiteId];
        expect([rival.host, rival.namedInAnswers, rival.answersCounted, rival.lastSeenDay])
          .toEqual([rival.host, seen?.times ?? 0, was.answersCounted, seen?.lastDay ?? null]);
      }
      // A competitor's engines naming it, in its header and on the Sites list.
      if (site !== w.own) {
        expect(header?.counts).toMatchObject({ aiNamed: was.enginesNaming?.named ?? null, aiAsked: was.enginesNaming?.asked ?? null });
        const listed = (await asRonins.query(api.sites.listMySites, {})).find((row) => row.siteId === site.holdId);
        expect(listed).toMatchObject({ aiNamed: was.enginesNaming?.named ?? null, aiAsked: was.enginesNaming?.asked ?? null });
      }
    }
    // The world really does name, recommend and warn: the comparison is not of empties.
    const mentions = (await Promise.all([w.own, w.lightflows, w.pixelfield].map((site) =>
      asRonins.query(api.siteAi.listMentions, { siteId: site.holdId })))).flat();
    expect(new Set(mentions.map((row) => row.lastStance))).toEqual(new Set(["RECOMMENDED", "NAMED", "WARNED_AGAINST", "NOT_NAMED"]));
    expect(mentions.some((row) => row.asked === 3 && row.named > 0 && row.recommended > 0 && row.warnedAgainst > 0)).toBe(true);
  });

  test("count only the company's own list, from its own place", async () => {
    const t = harness();
    const w = await world(t);
    const asRonins = await member(t, w.ronins);
    const asOther = await member(t, w.other);

    // Ronins' Surrey question on the first engine: its own three answers, not
    // the other company's answer from Leeds naming it.
    const surrey = (await asRonins.query(api.siteAi.listMentions, { siteId: w.own.holdId }))
      .find((row) => row.prompt === SURREY && row.engine === AI_ENGINES[0]);
    expect(surrey?.asked).toBe(3);
    // The other company asks the same question from its own place, and counts
    // its own group: its competitor, never Ronins'.
    const rows = await t.run(async (ctx) => await ctx.db.query("siteListQuestions")
      .withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", w.theirs.holdId)).collect());
    const named = new Set(rows.flatMap((row) => row.engines.flatMap((engine) => engine.sites.map((site) => site.websiteId))));
    expect(named.has(w.lightflows.websiteId)).toBe(false);
    expect(named.has(w.theirRival.websiteId)).toBe(true);
    const voice = await asOther.query(api.siteAi.shareOfVoice, { siteId: w.theirs.holdId });
    expect(voice.flatMap((row) => row.sites.map((site) => site.host))).not.toContain("lightflows.co.uk");
    // A competitor watched against nothing has no list, and no figures.
    expect(await asRonins.query(api.siteAi.shareOfVoice, { siteId: w.stray.holdId })).toEqual([]);
    expect((await asRonins.query(api.sites.getMySite, { siteId: w.stray.holdId }))?.counts).toMatchObject({ aiNamed: null, citedPages: 0 });
  });

  test("count a competitor's answers as the company's own: the same latest ones, not only the last thirty", async () => {
    const t = harness();
    const ronins = await company(t, "Ronins");
    const own = await hold(t, ronins, "ronins.co.uk");
    const rival = await hold(t, ronins, "lightflows.co.uk", own.websiteId);
    const engine = AI_ENGINES[0];
    await ask(t, own, SURREY, [engine]);
    for (let index = 0; index < 35; index += 1) {
      const day = new Date(Date.UTC(2026, 7, 1 + index)).toISOString().slice(0, 10);
      await file(t, { asker: own.websiteId, prompt: SURREY, engine, day, brands: index < 5 ? [[rival.websiteId, "RECOMMENDED"]] : [[own.websiteId, "MENTIONED"]] });
    }
    await settle(t, [own.holdId]);
    const asRonins = await member(t, ronins);
    const [ours] = await asRonins.query(api.siteAi.listMentions, { siteId: own.holdId });
    const [theirs] = await asRonins.query(api.siteAi.listMentions, { siteId: rival.holdId });
    expect([ours.asked, ours.named]).toEqual([35, 30]);
    // Named in the five oldest of thirty-five: out of sight of the old
    // thirty-answer read, counted now.
    expect([theirs.asked, theirs.named, theirs.recommended, theirs.lastStance]).toEqual([35, 5, 5, "NOT_NAMED"]);
  });
});

describe("the summaries keep up", () => {
  test("with a new answer, a question added or removed, a competitor added and a place changed", async () => {
    const t = harness();
    const w = await world(t);
    const admin = await superAdmin(t);
    const asRonins = await member(t, w.ronins);
    const jobs = async (name: string) => (await t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").collect()))
      .filter((job) => job.name.includes(name) && job.state.kind === "pending").length;
    const [first, second] = AI_ENGINES;

    // A new answer: its question's row at once, the list's summary a moment later.
    const waiting = await jobs("summariseList");
    await file(t, { asker: w.own.websiteId, prompt: SURREY, engine: second, day: "2026-09-26", brands: [[w.pixelfield.websiteId, "RECOMMENDED"]] });
    const row = (await asRonins.query(api.siteAi.listMentions, { siteId: w.pixelfield.holdId }))
      .find((entry) => entry.prompt === SURREY && entry.engine === second);
    expect(row).toMatchObject({ lastAskedDay: "2026-09-26", lastStance: "RECOMMENDED" });
    expect(await jobs("summariseList")).toBe(waiting + 1);
    await settle(t, [w.own.holdId]);
    const voice = await asRonins.query(api.siteAi.shareOfVoice, { siteId: w.own.holdId });
    expect(voice.find((entry) => entry.engine === second)?.lastDay).toBe("2026-09-26");

    // A question added that another company's asking already had answered:
    // counted from the answers already held.
    await admin.mutation(api.websiteCanonical.addWebsiteQuestion, { companyWebsiteId: w.theirs.holdId, prompt: WORDPRESS, engines: [first] });
    expect(await jobs("recountQuestion")).toBe(1);
    await settle(t, [w.theirs.holdId]);
    const theirs = await (await member(t, w.other)).query(api.siteAi.listMentions, { siteId: w.theirs.holdId });
    expect(theirs.find((entry) => entry.prompt === WORDPRESS)?.asked).toBe(3);

    // A question removed: its answers leave the figures with it.
    const question = await t.run(async (ctx) => (await holdQuestions(ctx, w.own.holdId, 10)).find((entry) => entry.prompt === WORDPRESS)!);
    const askedBefore = (await asRonins.query(api.siteAi.shareOfVoice, { siteId: w.own.holdId })).find((entry) => entry.engine === first)!.asked;
    await admin.mutation(api.websiteCanonical.removeWebsiteQuestion, { questionId: question._id });
    await settle(t, [w.own.holdId]);
    expect((await asRonins.query(api.siteAi.shareOfVoice, { siteId: w.own.holdId })).find((entry) => entry.engine === first)!.asked)
      .toBe(askedBefore - 3);
    expect(await t.run(async (ctx) => await ctx.db.query("siteListQuestions")
      .withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", w.own.holdId).eq("locationCode", UK).eq("prompt", WORDPRESS)).first())).toBeNull();

    // A competitor added: counted in the answers it was already named in.
    const added = await admin.mutation(api.websiteAttachments.addTrackedWebsite, {
      companyId: w.ronins, url: "bigagency.co.uk", againstCompanyWebsiteId: w.own.holdId,
    });
    expect(await jobs("recountList")).toBe(1);
    await t.action(internal.siteListAi.recountList, { holdId: w.own.holdId });
    const was = await before(t, added);
    expect(await asRonins.query(api.siteAi.listMentions, { siteId: added })).toEqual(was.mentions);
    expect(was.mentions.some((entry) => entry.named > 0)).toBe(true);

    // A place changed: the list is read from the new place, and the old
    // place's rows go.
    await admin.mutation(api.websites.setCompanyWebsiteLocation, { companyWebsiteId: w.own.holdId, locationCode: LEEDS, locationLabel: "Leeds, England" });
    await t.action(internal.siteListAi.recountList, { holdId: w.own.holdId });
    const places = await t.run(async (ctx) => [
      ...(await ctx.db.query("siteListQuestions").withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", w.own.holdId)).collect()),
      ...(await ctx.db.query("siteListAiSummary").withIndex("by_hold", (q) => q.eq("companyWebsiteId", w.own.holdId)).collect()),
    ].map((entry) => entry.locationCode));
    expect(new Set(places)).toEqual(new Set([LEEDS]));
    // From Leeds, the first engine's Surrey answer is the other company's one from there.
    const leeds = (await asRonins.query(api.siteAi.listMentions, { siteId: w.own.holdId }))
      .find((entry) => entry.prompt === SURREY && entry.engine === first);
    expect(leeds).toMatchObject({ asked: 1, named: 1, lastStance: "RECOMMENDED" });
  });

  test("and go with the hold whose list they are", async () => {
    const t = harness();
    const w = await world(t);
    const admin = await superAdmin(t);
    const rowsOf = (holdId: Id<"companyWebsites">) => t.run(async (ctx) => [
      ...(await ctx.db.query("siteListQuestions").withIndex("by_hold_prompt", (q) => q.eq("companyWebsiteId", holdId)).collect()),
      ...(await ctx.db.query("siteListAiSummary").withIndex("by_hold", (q) => q.eq("companyWebsiteId", holdId)).collect()),
    ]);
    expect((await rowsOf(w.own.holdId)).length).toBeGreaterThan(0);

    // A competitor removed: the list counts again without it.
    await admin.mutation(api.websites.removeCompanyWebsite, { id: w.pixelfield.holdId });
    await t.action(internal.siteListAi.recountList, { holdId: w.own.holdId });
    const named = (await rowsOf(w.own.holdId)).flatMap((row) =>
      "prompt" in row ? row.engines.flatMap((engine) => engine.sites.map((site) => site.websiteId)) : []);
    expect(named).not.toContain(w.pixelfield.websiteId);

    // The owned site removed: its list's rows go with its questions.
    await admin.mutation(api.websites.removeCompanyWebsite, { id: w.own.holdId });
    vi.advanceTimersByTime(1);
    await t.finishInProgressScheduledFunctions();
    expect(await rowsOf(w.own.holdId)).toEqual([]);
    // The other company's are its own, and stay.
    expect((await rowsOf(w.theirs.holdId)).length).toBeGreaterThan(0);
  });
});

describe("working a question out", () => {
  const ids = ["a", "b", "c"] as unknown as Array<Id<"websites">>;
  const [a, b, c] = ids;
  const answer = (day: string, named: Array<Id<"websites">>, recommended: Array<Id<"websites">> = [], warnedAgainst: Array<Id<"websites">> = []) =>
    ({ day, named, recommended, warnedAgainst });

  test("counts each website of the group, newest first, and reads the newest answer's stance warning first", () => {
    const entry = questionEngine("chatgpt", [
      answer("2026-09-24", [a, b], [a], [b]),
      answer("2026-09-22", [a, c], [c]),
      answer("2026-09-20", []),
    ], new Set([a, b]));
    expect(entry).toEqual({
      engine: "chatgpt",
      asked: 3,
      lastDay: "2026-09-24",
      sites: [
        { websiteId: a, named: 2, recommended: 1, warnedAgainst: 0, lastNamedDay: "2026-09-24", newest: "RECOMMENDED" },
        { websiteId: b, named: 1, recommended: 0, warnedAgainst: 1, lastNamedDay: "2026-09-24", newest: "WARNED_AGAINST" },
      ],
    });
    expect(questionEngine("chatgpt", [], new Set([a]))).toBeNull();
  });

  test("adds a list up over the questions on it and the engines each asks, and no others", () => {
    const row = (prompt: string, engine: AiEngine, asked: number, lastDay: string, sites: Array<[Id<"websites">, number, boolean]>) => ({
      prompt,
      engines: [{ engine, asked, lastDay, sites: sites.map(([websiteId, named, newest]) => ({ websiteId, named, recommended: 0, warnedAgainst: 0, ...(newest ? { newest: "NAMED" as const } : {}) })) }],
    });
    const one = row("one", "chatgpt", 3, "2026-09-20", [[a, 2, false], [b, 1, true]]);
    const listed = addUpList(
      [{ prompt: "one", engines: ["chatgpt"] }, { prompt: "two", engines: ["chatgpt"] }],
      [
        // An engine the question no longer asks is not counted…
        { prompt: "one", engines: [...one.engines, ...row("one", "claude", 7, "2026-09-25", [[c, 7, true]]).engines] },
        row("two", "chatgpt", 2, "2026-09-24", [[a, 1, true]]),
        // …nor a question no longer on the list.
        row("gone", "chatgpt", 9, "2026-09-25", [[c, 9, true]]),
      ],
    );
    expect(listed).toEqual([{
      engine: "chatgpt", asked: 5, lastDay: "2026-09-24",
      named: [{ websiteId: a, times: 3 }, { websiteId: b, times: 1 }],
      newestNamed: [a, b],
    }]);
  });
});
