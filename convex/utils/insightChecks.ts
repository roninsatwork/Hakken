import { changeOf, type Fact } from "./insightFacts";
import { enquiryCheck } from "./insightEnquiryCheck";
import type { InsightSpecialist } from "./insightTeam";

/**
 * Each specialist's checklist (docs/plans/active/insights-analyst-plan.md
 * §2.2, §3): plain code over a website's facts, no AI, finding the
 * candidates worth a look — a figure that moved, a gap to a rival, two
 * sources that disagree. The AI is handed only these, with the facts they
 * rest on, so each call is small and every finding starts from the data.
 * Each check holds back when the numbers are too small to mean anything.
 */

export type Candidate = {
  specialist: Exclude<InsightSpecialist, "strategy">;
  /** The pattern (§3), a short code. */
  pattern: string;
  /** What the code saw, in plain words naming its facts. */
  seen: string;
  /** The facts it rests on: the ones the specialist must use. */
  facts: string[];
  /** What is at stake, to order the week: enquiries a year, or share points. */
  stake: number;
  /** Enquiries a year at stake, for the patterns that count them. */
  enquiries?: number;
};

type Read = { get(key: string): number | undefined; has(key: string): boolean; keys: string[]; fact(key: string): Fact | undefined };

function readerOf(facts: readonly Fact[]): Read {
  const byKey = new Map(facts.map((fact) => [fact.key, fact]));
  return {
    get: (key) => byKey.get(key)?.value,
    has: (key) => byKey.has(key),
    keys: [...byKey.keys()],
    fact: (key) => byKey.get(key),
  };
}

/** Fewer than this many before, and a move is chance. */
const FEW = 20;
/** Fewer visits than this, and a page's rate is chance. */
const FEW_VISITS = 100;

const k = (...parts: Array<string | number>) => parts.join(".");

/** Hosts in a website's market facts, the website's own first. */
function hostsOf(read: Read, own: string): string[] {
  const hosts = new Set<string>();
  for (const key of read.keys) {
    const match = /^seo\.(.+)\.traffic\.now$/.exec(key);
    if (match) hosts.add(match[1]);
  }
  return [own, ...[...hosts].filter((host) => host !== own)].filter((host) => hosts.has(host));
}

/** A landing page's path from its facts' keys. */
function landingPaths(read: Read, prefix: "landing" | "landingSearch", period: string): string[] {
  const paths: string[] = [];
  const pattern = new RegExp(`^ga\\.${prefix}\\.(.+)\\.visits\\.${period}\\.now$`);
  for (const key of read.keys) {
    const match = pattern.exec(key);
    if (match) paths.push(match[1]);
  }
  return paths;
}

export function candidatesFor(facts: readonly Fact[], own: string): Candidate[] {
  const read = readerOf(facts);
  const out: Candidate[] = [];
  const add = (candidate: Candidate) => {
    if (candidate.facts.every((key) => read.has(key))) out.push(candidate);
  };

  // ---------------------------------------------------------------- Search
  // Same visitors, fewer results (§3): search visits held, its enquiries fell.
  {
    const visits = k("ga.channel.Organic Search.visits.365"), done = k("ga.channel.Organic Search.conversions.365");
    const [vNow, vYear, cNow, cYear] = [read.get(`${visits}.now`), read.get(`${visits}.before`), read.get(`${done}.now`), read.get(`${done}.before`)];
    if (vNow !== undefined && vYear !== undefined && cNow !== undefined && cYear !== undefined && cYear >= FEW) {
      const visitsMoved = changeOf(vNow, vYear) ?? 0;
      const doneMoved = changeOf(cNow, cYear) ?? 0;
      if (Math.abs(visitsMoved) <= 15 && doneMoved <= -25) {
        add({
          specialist: "search", pattern: "sameVisitorsFewerResults", stake: cYear - cNow, enquiries: cYear - cNow,
          seen: `Visits from search held ([[${visits}.now]] against [[${visits}.before]]) while their conversions fell ([[${done}.now]] against [[${done}.before]]).`,
          facts: [`${visits}.now`, `${visits}.before`, `${done}.now`, `${done}.before`],
        });
      }
    }
  }
  // Searches for the business's own name moved.
  {
    const now = read.get("sc.brandClicks.90.now"), before = read.get("sc.brandClicks.90.before");
    if (now !== undefined && before !== undefined && before >= FEW) {
      const moved = changeOf(now, before) ?? 0;
      if (Math.abs(moved) >= 25) {
        add({
          specialist: "search", pattern: moved > 0 ? "nameSearchesRose" : "nameSearchesFell", stake: Math.abs(now - before) / 10,
          seen: `Google clicks from searches for the business's own name went from [[sc.brandClicks.90.before]] to [[sc.brandClicks.90.now]].`,
          facts: ["sc.brandClicks.90.now", "sc.brandClicks.90.before"],
        });
      }
    }
  }
  // Pages whose Google clicks moved most against the 90 days before.
  {
    const moves: Array<{ page: string; now: number; before: number }> = [];
    for (const key of read.keys) {
      const match = /^sc\.page\.(.+)\.clicks\.90\.now$/.exec(key);
      if (!match) continue;
      const now = read.get(key)!, before = read.get(`sc.page.${match[1]}.clicks.90.before`);
      if (before === undefined || Math.max(now, before) < FEW) continue;
      if (Math.abs(changeOf(now, before) ?? 100) >= 40) moves.push({ page: match[1], now, before });
    }
    moves.sort((a, b) => Math.abs(b.now - b.before) - Math.abs(a.now - a.before));
    for (const move of moves.slice(0, 2)) {
      add({
        specialist: "search", pattern: move.now > move.before ? "pageGaining" : "pageLosing", stake: Math.abs(move.now - move.before) / 10,
        seen: `${move.page} went from [[sc.page.${move.page}.clicks.90.before]] Google clicks to [[sc.page.${move.page}.clicks.90.now]].`,
        facts: [`sc.page.${move.page}.clicks.90.now`, `sc.page.${move.page}.clicks.90.before`, `sc.page.${move.page}.position.90.now`].filter((key) => read.has(key)),
      });
    }
  }
  // Almost on page one: shown often, sitting just below the first page.
  {
    const near: Array<{ page: string; shown: number }> = [];
    for (const key of read.keys) {
      const match = /^sc\.page\.(.+)\.position\.90\.now$/.exec(key);
      if (!match) continue;
      const position = read.get(key)!, shown = read.get(`sc.page.${match[1]}.impressions.90.now`) ?? 0;
      if (position > 8 && position <= 20 && shown >= 1000) near.push({ page: match[1], shown });
    }
    near.sort((a, b) => b.shown - a.shown);
    for (const page of near.slice(0, 2)) {
      add({
        specialist: "search", pattern: "almostOnPageOne", stake: page.shown / 1000,
        seen: `${page.page} sits at position [[sc.page.${page.page}.position.90.now]] though Google showed it [[sc.page.${page.page}.impressions.90.now]] times.`,
        facts: [`sc.page.${page.page}.position.90.now`, `sc.page.${page.page}.impressions.90.now`, `sc.page.${page.page}.clicks.90.now`],
      });
    }
  }

  // ---------------------------------------------------------------- Conversion
  const siteRate = read.get("ga.conversionRate.365.now");
  const siteVisits = read.get("ga.visits.365.now") ?? 0;
  // Visits Analytics couldn't tie to a landing page are a measurement question, never a page's.
  for (const path of landingPaths(read, "landing", "365").filter((path) => !/not set/i.test(path))) {
    const base = `ga.landing.${path}`;
    const visits = read.get(`${base}.visits.365.now`) ?? 0;
    const done = read.get(`${base}.conversions.365.now`) ?? 0;
    const doneYear = read.get(`${base}.conversions.365.year`);
    // Traffic that doesn't pay: a page carries a tenth of the visits and brings almost nothing.
    if (siteVisits > 0 && visits / siteVisits >= 0.1 && done <= 1 && visits >= FEW_VISITS) {
      add({
        specialist: "conversion", pattern: "trafficThatDoesntPay", stake: (siteRate ?? 1) * visits / 100, enquiries: Math.max(0, Math.round((siteRate ?? 0) * visits / 100) - done),
        seen: `${path} had [[${base}.visits.365.now]] of the website's [[ga.visits.365.now]] visits and [[${base}.conversions.365.now]] conversions.`,
        facts: [`${base}.visits.365.now`, "ga.visits.365.now", `${base}.conversions.365.now`],
      });
    }
    // A page lost its enquiries against the same months a year before.
    if (doneYear !== undefined && doneYear >= 6 && done <= doneYear * 0.5) {
      add({
        specialist: "conversion", pattern: "pageLostItsEnquiries", stake: doneYear - done, enquiries: doneYear - done,
        seen: `${path} made [[${base}.conversions.365.now]] conversions in 12 months against [[${base}.conversions.365.year]] the year before, from [[${base}.visits.365.now]] visits against [[${base}.visits.365.year]].`,
        facts: [`${base}.conversions.365.now`, `${base}.conversions.365.year`, `${base}.visits.365.now`, `${base}.visits.365.year`].filter((key) => read.has(key)),
      });
    }
    // Best page, buried: it converts at twice the website's rate, but sits off Google's first page.
    const rate = read.get(`${base}.conversionRate.365.now`);
    const position = read.get(`sc.page.${path}.position.90.now`);
    if (rate !== undefined && siteRate !== undefined && visits >= FEW_VISITS && rate >= siteRate * 2 && position !== undefined && position > 10) {
      add({
        specialist: "conversion", pattern: "bestPageBuried", stake: done,
        seen: `${path} converts [[${base}.conversionRate.365.now]] of its visits against the website's [[ga.conversionRate.365.now]], yet sits at position [[sc.page.${path}.position.90.now]] on Google.`,
        facts: [`${base}.conversionRate.365.now`, "ga.conversionRate.365.now", `sc.page.${path}.position.90.now`],
      });
    }
  }
  // People for one conversion, the website's, against the year before.
  {
    const now = read.get("ga.peoplePerConversion.365.now"), before = read.get("ga.peoplePerConversion.365.before");
    if (now !== undefined && before !== undefined && (read.get("ga.conversions.365.before") ?? 0) >= FEW && Math.abs(changeOf(now, before) ?? 0) >= 25) {
      add({
        specialist: "conversion", pattern: now > before ? "harderToConvert" : "easierToConvert", stake: Math.abs((read.get("ga.conversions.365.before") ?? 0) - (read.get("ga.conversions.365.now") ?? 0)),
        seen: `It took [[ga.peoplePerConversion.365.now]] people for one conversion in the last 12 months, against [[ga.peoplePerConversion.365.before]] the 12 months before.`,
        facts: ["ga.peoplePerConversion.365.now", "ga.peoplePerConversion.365.before", "ga.conversions.365.now", "ga.conversions.365.before", "ga.people.365.now", "ga.people.365.before"],
      });
    }
  }
  // New against returning visitors.
  {
    const fresh = read.get("ga.visitor.new.conversionRate.365.now"), back = read.get("ga.visitor.returning.conversionRate.365.now");
    if (fresh !== undefined && back !== undefined && (read.get("ga.visitor.returning.visits.365.now") ?? 0) >= FEW_VISITS && (back >= fresh * 1.5 || fresh >= back * 1.5)) {
      add({
        specialist: "conversion", pattern: back > fresh ? "returningConvertMore" : "newConvertMore", stake: 2,
        seen: `Returning visitors convert [[ga.visitor.returning.conversionRate.365.now]] of their visits, new ones [[ga.visitor.new.conversionRate.365.now]].`,
        facts: ["ga.visitor.returning.conversionRate.365.now", "ga.visitor.new.conversionRate.365.now", "ga.visitor.returning.visits.365.now", "ga.visitor.new.visits.365.now"],
      });
    }
  }

  // ---------------------------------------------------------------- AI visibility
  // Worth more per visit: an AI assistant's visitors convert well above search's.
  {
    const ai = read.get("ga.channel.AI assistants.conversionRate.365.now"), search = read.get("ga.channel.Organic Search.conversionRate.365.now");
    if (ai !== undefined && search !== undefined && (read.get("ga.channel.AI assistants.visits.365.now") ?? 0) >= FEW_VISITS && ai >= search * 1.5) {
      add({
        specialist: "aiVisibility", pattern: "worthMorePerVisit", stake: read.get("ga.channel.AI assistants.conversions.365.now") ?? 0,
        seen: `Visitors from AI assistants converted [[ga.channel.AI assistants.conversionRate.365.now]] of their visits, search's [[ga.channel.Organic Search.conversionRate.365.now]].`,
        facts: ["ga.channel.AI assistants.conversionRate.365.now", "ga.channel.Organic Search.conversionRate.365.now", "ga.channel.AI assistants.visits.365.now", "ga.channel.AI assistants.conversions.365.now"],
      });
    }
  }
  // Introduced by AI, closed by name (I35): people an assistant first brought converted on later visits.
  {
    const first = read.get("ga.firstChannel.AI assistants.conversions.365.now"), visit = read.get("ga.channel.AI assistants.conversions.365.now");
    if (first !== undefined && visit !== undefined && first >= visit + 3) {
      add({
        specialist: "aiVisibility", pattern: "introducedByAi", stake: first - visit,
        seen: `People first brought by an AI assistant made [[ga.firstChannel.AI assistants.conversions.365.now]] conversions, though visits from AI assistants made only [[ga.channel.AI assistants.conversions.365.now]].`,
        facts: ["ga.firstChannel.AI assistants.conversions.365.now", "ga.channel.AI assistants.conversions.365.now", "ga.firstChannel.AI assistants.people.365.now"].filter((key) => read.has(key)),
      });
    }
  }
  // Strong in one place, missing in another (§3): an assistant names rivals but not the website.
  {
    const engines = new Set<string>();
    for (const key of read.keys) {
      const match = /^ai\.answers\.([^.]+)\.asked$/.exec(key);
      if (match) engines.add(match[1]);
    }
    for (const engine of engines) {
      const asked = read.get(`ai.answers.${engine}.asked`) ?? 0;
      const mine = read.get(`ai.answers.${engine}.${own}.named`) ?? 0;
      const rivals = read.keys.filter((key) => key.startsWith(`ai.answers.${engine}.`) && key.endsWith(".named") && key !== `ai.answers.${engine}.${own}.named`);
      const best = rivals.sort((a, b) => (read.get(b) ?? 0) - (read.get(a) ?? 0))[0];
      if (asked >= 10 && best && mine === 0 && (read.get(best) ?? 0) >= 2) {
        add({
          specialist: "aiVisibility", pattern: "missingFromAnAssistant", stake: (read.get(best) ?? 0),
          seen: `${engine} named the website in [[ai.answers.${engine}.${own}.named]] of [[ai.answers.${engine}.asked]] answers; a rival in [[${best}]].`,
          facts: [`ai.answers.${engine}.${own}.named`, `ai.answers.${engine}.asked`, best],
        });
      }
    }
  }
  // AI mentions: the website's share against its rivals', and its own against a year before.
  {
    const hosts = [...new Set(read.keys.map((key) => /^ai\.(.+)\.mentions\.now$/.exec(key)?.[1]).filter((host): host is string => Boolean(host)))];
    const total = hosts.reduce((sum, host) => sum + (read.get(`ai.${host}.mentions.now`) ?? 0), 0);
    const mine = read.get(`ai.${own}.mentions.now`);
    if (mine !== undefined && total > 0 && hosts.length >= 3) {
      const leader = hosts.filter((host) => host !== own).sort((a, b) => (read.get(`ai.${b}.mentions.now`) ?? 0) - (read.get(`ai.${a}.mentions.now`) ?? 0))[0];
      if (leader && (read.get(`ai.${leader}.mentions.now`) ?? 0) >= mine * 2) {
        add({
          specialist: "aiVisibility", pattern: "aiMindshareGap", stake: 3,
          seen: `AI answers mentioned the website [[ai.${own}.mentions.now]] times in a month, ${leader} [[ai.${leader}.mentions.now]].`,
          facts: [`ai.${own}.mentions.now`, `ai.${leader}.mentions.now`, ...(read.has(`ai.${own}.mentions.year`) ? [`ai.${own}.mentions.year`] : [])],
        });
      }
    }
  }

  // ---------------------------------------------------------------- Market
  {
    const hosts = hostsOf(read, own);
    const now = hosts.map((host) => read.get(`seo.${host}.traffic.now`) ?? 0);
    const year = hosts.map((host) => read.get(`seo.${host}.traffic.year`));
    if (hosts.length >= 3 && hosts[0] === own && year.every((value) => value !== undefined)) {
      const totalNow = now.reduce((a, b) => a + b, 0), totalYear = (year as number[]).reduce((a, b) => a + b, 0);
      const shareNow = totalNow > 0 ? now[0] / totalNow : 0, shareYear = totalYear > 0 ? (year[0] as number) / totalYear : 0;
      // It's the market, not you (§3): everyone fell, the website's share rose.
      if (totalNow < totalYear * 0.85 && shareNow > shareYear) {
        add({
          specialist: "market", pattern: "itsTheMarket", stake: 5,
          seen: `The website and its rivals had fewer estimated visitors from Google than a year before, while the website's own share of them rose.`,
          facts: hosts.flatMap((host) => [`seo.${host}.traffic.now`, `seo.${host}.traffic.year`]),
        });
      }
    }
    // A rival growing fast.
    for (const host of hosts.slice(1)) {
      const now = read.get(`seo.${host}.traffic.now`), before = read.get(`seo.${host}.traffic.year`), mine = read.get(`seo.${own}.traffic.now`) ?? 0;
      if (now !== undefined && before !== undefined && before > 0 && now >= before * 1.3 && now >= mine * 0.5) {
        add({
          specialist: "market", pattern: "rivalRising", stake: 3,
          seen: `${host}'s estimated visitors from Google went from [[seo.${host}.traffic.year]] to [[seo.${host}.traffic.now]] a month.`,
          facts: [`seo.${host}.traffic.now`, `seo.${host}.traffic.year`, `seo.${own}.traffic.now`],
        });
      }
    }
  }

  // ---------------------------------------------------------------- Links
  {
    const hosts = hostsOf(read, own);
    const mine = read.get(`seo.${own}.linkingSites.now`);
    const leader = hosts.slice(1).sort((a, b) => (read.get(`seo.${b}.linkingSites.now`) ?? 0) - (read.get(`seo.${a}.linkingSites.now`) ?? 0))[0];
    if (mine !== undefined && leader && (read.get(`seo.${leader}.linkingSites.now`) ?? 0) >= mine * 1.5) {
      add({
        specialist: "links", pattern: "linkGap", stake: 2,
        seen: `[[seo.${own}.linkingSites.now]] websites link to the website, [[seo.${leader}.linkingSites.now]] to ${leader}.`,
        facts: [`seo.${own}.linkingSites.now`, `seo.${leader}.linkingSites.now`, `seo.${own}.strength.now`, `seo.${leader}.strength.now`].filter((key) => read.has(key)),
      });
    }
  }

  // ---------------------------------------------------------------- Local
  {
    const own_ = read.keys.filter((key) => /^local\.own\..+\.reviews$/.test(key));
    const rivals = read.keys.filter((key) => /^local\.rival\..+\.reviews$/.test(key));
    const mine = own_.sort((a, b) => (read.get(b) ?? 0) - (read.get(a) ?? 0))[0];
    const leader = rivals.sort((a, b) => (read.get(b) ?? 0) - (read.get(a) ?? 0))[0];
    if (mine && leader && (read.get(leader) ?? 0) >= Math.max(10, (read.get(mine) ?? 0) * 2)) {
      add({
        specialist: "local", pattern: "reviewGap", stake: 2,
        seen: `The business's busiest Google profile has [[${mine}]] reviews; the rival with most has [[${leader}]].`,
        facts: [mine, leader],
      });
    }
  }

  // ---------------------------------------------------------------- Technical
  {
    const pages = read.get("crawl.pages") ?? 0;
    const serious = ["is_broken", "is_4xx_code", "is_5xx_code", "no_title", "broken_links", "redirect_loop", "duplicate_title", "no_description", "high_loading_time", "redirect_chain"];
    const found = serious
      .map((check) => ({ check, count: read.get(`crawl.issue.${check}`) ?? 0 }))
      .filter((issue) => pages > 0 && issue.count >= Math.max(3, pages * 0.05))
      .sort((a, b) => b.count - a.count);
    if (found.length > 0) {
      add({
        specialist: "technical", pattern: "auditProblems", stake: found[0].count / 10,
        seen: `The site audit read [[crawl.pages]] pages; ${found.slice(0, 3).map((issue) => `[[crawl.issue.${issue.check}]] have "${issue.check}"`).join(", ")}.`,
        facts: ["crawl.pages", ...found.slice(0, 3).map((issue) => `crawl.issue.${issue.check}`)],
      });
    }
  }

  // ---------------------------------------------------------------- Measurement
  // The enquiry check (I42): one enquiry counted twice, repeats, or the form counted as leaving the website.
  {
    const check = enquiryCheck(facts);
    if (!check.ok) {
      const keys = check.problems.flatMap((problem) => problem.code === "leavesBefore"
        ? ["ga.funnel.click.then.365.now", "ga.funnel.click.did.365.now"]
        : problem.code === "countedTwice"
          ? [`ga.counted.${problem.event}.times.365.now`, `ga.counted.${problem.other}.times.365.now`]
          : [`ga.counted.${problem.event}.times.365.now`, `ga.event.${problem.event}.people.365.now`]);
      add({
        specialist: "measurement", pattern: "enquiryCountUncertain", stake: 8,
        seen: `The enquiry count may be wrong: ${check.problems.map((problem) => problem.code).join(", ")}.`,
        facts: [...new Set(keys)].filter((key) => read.has(key)),
      });
    }
  }
  // Ways to enquire counted as conversions that never happened in 12 months.
  {
    const silent = read.keys.filter((key) => /^ga\.counted\..+\.times\.365\.now$/.test(key) && read.get(key) === 0);
    if (silent.length > 0) {
      add({
        specialist: "measurement", pattern: "conversionsNeverFire", stake: 4,
        seen: `${silent.length} of the ways to enquire counted as conversions never happened in 12 months: ${silent.map((key) => `[[${key}]]`).join(", ")} times.`,
        facts: silent,
      });
    }
  }
  // How much of Google's traffic Analytics sees, home country with home country (I33).
  {
    const clicks = read.get("sc.clicks.90.now"), visits = read.get("ga.channel.Organic Search.visits.90.now");
    if (clicks !== undefined && visits !== undefined && clicks >= FEW_VISITS && visits < clicks * 0.6) {
      add({
        specialist: "measurement", pattern: "analyticsSeesPart", stake: 1,
        seen: `Google sent [[sc.clicks.90.now]] clicks in the home country in 90 days; Analytics counted [[ga.channel.Organic Search.visits.90.now]] visits from search there.`,
        facts: ["sc.clicks.90.now", "ga.channel.Organic Search.visits.90.now"],
      });
    }
  }

  return out.sort((a, b) => b.stake - a.stake);
}
