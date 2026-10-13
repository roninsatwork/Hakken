import type { Fact } from "./insightFacts";
import { sourcesFrom } from "./insightConversion";

/**
 * The figures three screens' boxes are written from beyond the run's own
 * (Anthony, 13 October 2026, "Go" on the boxes still in the screens' own
 * words): the funnel's step-to-step rates and each source's enquiry rate,
 * worked out here because a specialist never works out a number; how the
 * website's findings turned out when checked; and what Page decisions
 * decided. Each is named by its key, as a finding's facts are, and filled in
 * the same way (utils/insightBoxes.ts).
 */

/** Sources a Funnel box is given, the most visits first. */
const SOURCES = 12;

/** A share to one decimal, or null from nothing. */
const share = (part: number | undefined, whole: number | undefined) => (part !== undefined && whole !== undefined && whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

/** The funnel and where its visitors came from, from the reading: the step-to-step rates now and a year before, and each source's 12 months against the 12 before. */
export function funnelFacts(facts: readonly Fact[]): Fact[] {
  const at = new Map(facts.map((fact) => [fact.key, fact]));
  const out: Fact[] = [];
  const copy = (key: string, from: string, label: string) => {
    const held = at.get(from);
    if (held) out.push({ ...held, key, label });
  };
  const rate = (key: string, part: string, whole: string, label: string) => {
    const held = at.get(part);
    const value = share(held?.value, at.get(whole)?.value);
    if (held && value !== null) out.push({ ...held, key, value, unit: "percent", label });
  };
  for (const which of ["now", "year"] as const) {
    copy(`funnel.shown.${which}`, `sc.impressions.90.${which}`, "times the website was shown on Google");
    copy(`funnel.clicked.${which}`, `sc.clicks.90.${which}`, "Google clicks");
    copy(`funnel.visited.${which}`, `ga.channel.Organic Search.visits.90.${which}`, "visits from Google");
    copy(`funnel.enquired.${which}`, `ga.channel.Organic Search.conversions.90.${which}`, "enquiries from visits from Google");
    rate(`funnel.clickRate.${which}`, `sc.clicks.90.${which}`, `sc.impressions.90.${which}`, "share of the times shown on Google that were clicked");
    rate(`funnel.visitRate.${which}`, `ga.channel.Organic Search.visits.90.${which}`, `sc.clicks.90.${which}`, "visits from Google for each Google click, as a share");
    rate(`funnel.enquireRate.${which}`, `ga.channel.Organic Search.conversions.90.${which}`, `ga.channel.Organic Search.visits.90.${which}`, "share of visits from Google that enquired");
  }
  for (const { channel } of sourcesFrom(facts).slice(0, SOURCES)) {
    for (const which of ["now", "before"] as const) {
      copy(`funnel.source.${channel}.visits.${which}`, `ga.channel.${channel}.visits.365.${which}`, `visits from ${channel}`);
      copy(`funnel.source.${channel}.enquiries.${which}`, `ga.channel.${channel}.conversions.365.${which}`, `enquiries from ${channel}`);
      rate(`funnel.source.${channel}.rate.${which}`, `ga.channel.${channel}.conversions.365.${which}`, `ga.channel.${channel}.visits.365.${which}`, `share of visits from ${channel} that enquired`);
    }
  }
  return out;
}

type Checked = { outcome?: string | null; actedAt?: number | null; specialist: string };

/**
 * How the website's published findings turned out when checked: right,
 * wrong, or too early to tell, as Track record counts them; how many wait
 * for their check and were acted on; each specialist's; and what the changes
 * made since brought. Counted from the findings themselves, so its source is
 * the figures they were checked against.
 */
export function trackFacts(findings: readonly Checked[], changes: ReadonlyArray<{ result: string }>): Fact[] {
  const fact = (key: string, value: number, label: string): Fact => ({ key: `track.${key}`, value, unit: "count", source: "analytics", label });
  const tally = (rows: readonly Checked[], prefix: string, who: string) => {
    const right = rows.filter((row) => row.outcome === "RIGHT").length;
    const wrong = rows.filter((row) => row.outcome === "WRONG").length;
    const unclear = rows.filter((row) => row.outcome && row.outcome !== "RIGHT" && row.outcome !== "WRONG").length;
    return [
      fact(`${prefix}right`, right, `${who} findings checked and found right`),
      fact(`${prefix}wrong`, wrong, `${who} findings checked and found wrong`),
      fact(`${prefix}unclear`, unclear, `${who} findings checked but too early to tell`),
      fact(`${prefix}checked`, right + wrong + unclear, `${who} findings checked`),
    ];
  };
  return [
    fact("written", findings.length, "findings published for the website"),
    fact("waiting", findings.filter((row) => !row.outcome).length, "findings still waiting for their check"),
    fact("acted", findings.filter((row) => row.actedAt).length, "findings the business said it acted on"),
    ...tally(findings, "", "the team's"),
    ...[...new Set(findings.map((row) => row.specialist))].flatMap((specialist) => tally(findings.filter((row) => row.specialist === specialist), `${specialist}.`, `the ${specialist} specialist's`)),
    fact("changes.grew", changes.filter((change) => change.result === "GREW").length, "changes made whose enquiries grew after"),
    fact("changes.held", changes.filter((change) => change.result === "HELD").length, "changes made whose enquiries held after"),
    fact("changes.lost", changes.filter((change) => change.result === "LOST").length, "changes made whose enquiries fell after"),
  ];
}

/** Verdicts a page can have, as Page decisions counts them. */
const VERDICTS = ["KEEP", "IMPROVE", "MERGE", "REDIRECT", "REMOVE"] as const;

/** What Page decisions decided: how many pages, each verdict's count, who decided them, and the pages to create. */
export function decisionFacts(saved: { pages: number; decisions: ReadonlyArray<{ verdict: string; decidedBy?: string; reason: string }>; creates: readonly unknown[] }, competingReasons: ReadonlySet<string>): Fact[] {
  const fact = (key: string, value: number, label: string): Fact => ({ key: `decisions.${key}`, value, unit: "count", source: "crawl", label });
  return [
    fact("pages", saved.pages, "pages of the website decided"),
    ...VERDICTS.map((verdict) => fact(verdict.toLowerCase(), saved.decisions.filter((row) => row.verdict === verdict).length, `pages to ${verdict.toLowerCase()}`)),
    fact("bySpecialist", saved.decisions.filter((row) => row.decidedBy === "AGENT" && !competingReasons.has(row.reason)).length, "pages the Page decisions specialist decided"),
    fact("byCannibalisation", saved.decisions.filter((row) => competingReasons.has(row.reason)).length, "pages decided by Keyword cannibalisation"),
    fact("creates", saved.creates.length, "pages to create"),
  ];
}
