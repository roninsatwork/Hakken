import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { sectionOf, FINDING_SECTIONS } from "@/convex/utils/insightSections";

/**
 * What each Insights page hands its eye (ask-hakken-every-chart-page-plan-2026-11-03.md, section 9): the very answers
 * the page draws itself from, the reader's own words for every name a rule says (`names`), and — where a rule weighs a
 * whole list the eye would cut to its first rows — the list's sums (`sums`). Insights draws only on what the sections
 * have downloaded (Anthony, 2026-10-29): nothing here reads anything; each page passes what it already holds. Its own
 * rules are `convex/utils/sees/own/insights.ts`; `convex/utils/sees/insightsPageFindings.test.ts` builds the figures through
 * these same functions, so the test reads what the page hands. No words here: every name comes from the page's own
 * translations.
 */

/** The reader's words a page hands its rules: a word, words by a key, or a list of them (a league's title by its id). */
type Words = Record<string, unknown>;
type PeriodView = FunctionReturnType<typeof api.insightsPeriod.insightsPeriodView>;
type Enquiries = FunctionReturnType<typeof api.insightsPeriod.insightsEnquiries>;
type EnquirySource = FunctionReturnType<typeof api.insightsPeriod.insightsEnquirySource>;
type Conversion = FunctionReturnType<typeof api.insightsConversion.insightsConversion>;
type AiSearch = FunctionReturnType<typeof api.insightAiSearch.insightsAiSearch>;
type Cannibalisation = FunctionReturnType<typeof api.insightCompeting.insightsCannibalisation>;
type CompetingGroup = FunctionReturnType<typeof api.insightCompeting.insightsCompetingGroup>;
type AllFindings = FunctionReturnType<typeof api.insightsReads.insightsAllFindings>;
type Finding = FunctionReturnType<typeof api.insightsReads.insightsFinding>;
type ThisWeek = FunctionReturnType<typeof api.insightsReads.insightsThisWeek>;
type Report = FunctionReturnType<typeof api.insightsReads.insightsReport>;
type Leagues = FunctionReturnType<typeof api.insightsReads.insightsLeagues>;
type Measurement = FunctionReturnType<typeof api.insightsReads.insightsMeasurement>;
type Plan = FunctionReturnType<typeof api.insightsReads.insightsPlan>;
type Decisions = FunctionReturnType<typeof api.insightDecisions.insightsPageDecisions>;
type Strategy = FunctionReturnType<typeof api.insightsReads.insightsStrategy>;
type Service = FunctionReturnType<typeof api.insightsReads.insightsService>;

/** A source's key: its channel, then its source (`insightHistory`'s SOURCE_JOIN). */
const CHANNEL_JOIN = "\u001f";
/** Google Analytics' stand-ins for no name ("(not set)", "(data not available)"); typed in, "(direct)", is one. */
const NO_NAME = /^\((?!direct\))[^)]*\)$/;

/** What brings enquiries: the period's figures and the page's lists, each source by the name its table shows. */
export function enquiriesSees(view: PeriodView | undefined, data: Enquiries | undefined, box: unknown, names: Words, sourceName: (row: { name: string; group: string }) => string) {
  if (view === undefined || data === undefined) return undefined;
  // Google Analytics names one source under more than one channel ("google" is Cross-network, Paid Shopping and Organic
  // Search): its channel beside it, as Analytics' own name for it (each key is its channel, then its source).
  const counts = new Map<string, number>();
  for (const row of data?.sources ?? []) counts.set(sourceName(row), (counts.get(sourceName(row)) ?? 0) + 1);
  const named = (row: { key: string; name: string; group: string }) => {
    const channel = row.key.split(CHANNEL_JOIN)[0];
    return (counts.get(sourceName(row)) ?? 0) > 1 && channel && channel !== row.key ? `${sourceName(row)} (${channel})` : sourceName(row);
  };
  const listed = [...(data?.searches ?? []), ...(data?.noEnquiries ?? [])].reduce((sum, row) => sum + row.clicks, 0);
  return {
    period: view,
    // A source Analytics never recorded ("(not set)") is in the totals, never named in a finding (`sorted: false`).
    enquiries: data ? { ...data, sources: data.sources.map((row) => ({ ...row, name: named(row), ...(NO_NAME.test(row.name) ? { sorted: false } : {}) })) } : data,
    box,
    names,
    sums: { noEnquiryClicks: (data?.noEnquiries ?? []).reduce((sum, row) => sum + row.clicks, 0), clicksListed: listed },
  };
}

/** One source's enquiries, beside the whole website's for the same period. */
export function enquirySourceSees(data: EnquirySource | undefined, view: PeriodView | undefined, names: Words) {
  if (data === undefined) return undefined;
  return { source: data, website: view?.figures ?? null, names };
}

/** The funnel: the week's steps and sources, and the period's kinds of page. */
export function funnelSees(data: Conversion | undefined, view: PeriodView | undefined, box: unknown, names: Words) {
  if (data === undefined) return undefined;
  return { funnel: data ? { host: data.host, week: data.week, funnel: data.funnel, sources: data.sources } : data, period: view ?? null, box, names };
}

/** AI search, as its page reads it. */
export function aiSearchSees(data: AiSearch | undefined, box: unknown, names: Words) {
  if (data === undefined) return undefined;
  return { aiSearch: data, box, names };
}

/**
 * Cannibalisation: each group by the figures its table and charts show. Its searches and pages are each group's own
 * page's: a list of 20 groups each holding 200 searches is far past what the eye takes (2.7 MB on More Handles).
 */
export function cannibalisationSees(data: Cannibalisation | undefined, names: Words) {
  if (data === undefined) return undefined;
  if (!data) return { groups: [], names };
  return {
    host: data.host,
    groups: data.groups.map(({ group, from, to }) => ({
      name: group.name, owner: group.owner, pages: group.pages.length, shared: group.shared, split: group.split, shown: group.shown, clicks: group.clicks,
      enquiries: group.enquiries, recent: group.recent, recentBefore: group.recentBefore, gainClicks: group.gainClicks, gainEnquiries: group.gainEnquiries, sure: group.sure, from, to,
    })),
    names,
  };
}

/** A group of competing pages: its pages and its searches, as its own page shows them. */
export function competingGroupSees(data: CompetingGroup | undefined, names: Words) {
  if (data === undefined) return undefined;
  const kept = data?.kept;
  if (!kept) return { group: null, names };
  const { group } = kept;
  return {
    group: {
      name: group.name, owner: group.owner, shared: group.shared, split: group.split, shown: group.shown, clicks: group.clicks, enquiries: group.enquiries,
      recent: group.recent, recentBefore: group.recentBefore, gainClicks: group.gainClicks, gainEnquiries: group.gainEnquiries, sure: group.sure,
      pages: group.pages, searches: group.searches.map(({ search, clicks, shown, position, volume, owner, top, split, gain }) => ({ search, clicks, shown, position, volume, owner, top, split, gain })),
    },
    from: kept.from, to: kept.to,
    names,
  };
}

/** Findings: every finding listed, each week's by section (the chart), each section's whole, and the sums its rules weigh. */
export function findingsSees(rows: AllFindings | undefined, names: Words) {
  if (rows === undefined) return undefined;
  const sections = (names.sections && typeof names.sections === "object" ? names.sections : {}) as Record<string, string>;
  const weeks = [...new Set(rows.map((row) => row.week))].sort();
  const weekly = weeks.map((week) => ({ week, sections: Object.fromEntries(FINDING_SECTIONS.map((section) => [section, rows.filter((row) => row.week === week && sectionOf(row) === section).length])) }));
  const newest = weeks.at(-1), before = weeks.at(-2);
  const thisWeek = rows.filter((row) => row.week === newest);
  const lastWeek = new Set(rows.filter((row) => row.week === before).map((row) => `${row.specialist}|${row.pattern}`));
  return {
    findings: rows.map(({ headline, week, specialist, pattern, sure, isNew, outcome, checkOn }) => ({ headline, week, section: sections[sectionOf({ specialist, pattern })] ?? null, sure, isNew, outcome, checkOn })),
    weekly,
    bySection: FINDING_SECTIONS.map((section) => ({ name: sections[section] ?? null, findings: rows.filter((row) => sectionOf(row) === section).length })).filter((row) => row.name && row.findings > 0),
    sums: {
      thisWeek: thisWeek.length,
      foundAgain: before ? thisWeek.filter((row) => lastWeek.has(`${row.specialist}|${row.pattern}`)).length : 0,
      checked: rows.filter((row) => row.outcome === "RIGHT" || row.outcome === "WRONG").length,
      right: rows.filter((row) => row.outcome === "RIGHT").length,
    },
    names,
  };
}

/** A finding: the figures it rests on, each named as its page heads it; its words are handed apart, as advice (`findingAdvice`). */
export function findingSees(finding: Finding | undefined, names: Words, heading: (label: string) => string) {
  if (finding === undefined) return undefined;
  if (!finding) return null;
  return {
    finding: { pattern: finding.pattern, sure: finding.sure, checkOn: finding.checkOn, facts: finding.facts, comparisons: finding.comparisons, progress: finding.progress, ruledOut: finding.ruledOut },
    names: { ...names, figures: Object.fromEntries(finding.facts.map((fact) => [fact.key, heading(fact.label)])) },
  };
}

/** The advice a finding's page already shows, for the writer to build on and never say otherwise (decision 2). */
export function findingAdvice(finding: Finding | undefined) {
  if (!finding) return undefined;
  return { headline: finding.headline, story: finding.story, action: finding.action, howWeKnow: finding.howWeKnow };
}

/**
 * The newest week as This week and the Summary read it: its scorecard, market share and enquiries a month at the top of
 * what is handed, each month named as the reader reads it — the eye keeps an answer six levels deep, and a week's
 * scorecard sits deeper than that inside the read.
 */
function newestWeek(data: ThisWeek | undefined, monthName: (month: string) => string) {
  const newest = data?.weeks[0];
  return {
    newest: newest ? { week: newest.week, host: newest.host, checked: newest.checked, ruledOut: newest.ruledOut, changes: newest.changes } : null,
    scorecard: newest?.summary?.scorecard ?? [],
    shareByMonth: newest?.summary?.shareByMonth ?? [],
    enquiriesByMonth: (newest?.summary?.enquiriesByMonth ?? []).map((row) => ({ ...row, name: monthName(row.month) })),
  };
}

/** This week: the week's findings and scorecard. */
export function thisWeekSees(data: ThisWeek | undefined, names: Words, monthName: (month: string) => string) {
  if (data === undefined) return undefined;
  if (!data) return null;
  return {
    open: data.open,
    findings: data.findings.map(({ headline, specialist, pattern, sure, atStake, checkOn, rank }) => ({ headline, specialist, pattern, sure, atStake, checkOn, rank })),
    ...newestWeek(data, monthName),
    names,
  };
}

/** The advice This week already shows: the strategy's verdict and each finding's headline and first step (decision 2). */
export function thisWeekAdvice(data: ThisWeek | undefined) {
  if (!data) return undefined;
  const newest = data.weeks[0];
  return { verdict: newest?.verdict ?? null, paragraphs: newest?.summary?.paragraphs ?? [], findings: data.findings.map((finding) => ({ headline: finding.headline, action: finding.action })) };
}

/** A report, and Your month: its figures as written, at the top of what is handed, its months each named as the reader reads them. */
export function reportSees(report: Report | undefined, names: Words, monthName: (month: string) => string) {
  if (report === undefined) return undefined;
  if (!report) return null;
  const { body } = report;
  return {
    report: { kind: report.kind, period: report.period, host: report.host, from: report.from, to: report.to, title: report.title },
    facts: body.facts,
    scorecard: body.scorecard,
    shareByMonth: body.shareByMonth,
    enquiriesByMonth: body.enquiriesByMonth.map((row) => ({ ...row, name: monthName(row.month) })),
    did: body.did,
    names: report.kind === "MONTHLY" ? { ...names, month: monthName(report.period) } : names,
  };
}

/** The advice a report already shows: its headline, summary and every section's words (decision 2). */
export function reportAdvice(report: Report | undefined) {
  if (!report) return undefined;
  const { body } = report;
  return { headline: body.headline, summary: body.summary, points: body.points, risks: body.risks, opportunities: body.opportunities, next: body.next, decision: body.decision };
}

/** The Summary: the period's figures, the newest week's scorecard and market share, the leagues and the funnel's pages. */
export function summarySees(view: PeriodView | undefined, week: ThisWeek | undefined, leagues: Leagues | undefined, conversion: Conversion | undefined, board: Report | undefined, names: Words, monthName: (month: string) => string) {
  return { period: view, ...newestWeek(week, monthName), leagues, conversion: conversion ? { host: conversion.host, week: conversion.week, funnel: conversion.funnel, pages: conversion.pages.map(({ page, verdict, visits, enquiries }) => ({ page, verdict, visits, enquiries })) } : conversion, board: board ? { kind: board.kind, period: board.period, title: board.title } : board, names };
}

/** The strategy: each service by the name its table shows. */
export function strategySees(data: Strategy | undefined, box: unknown, names: Words, serviceName: (service: NonNullable<Strategy>["services"][number]) => string) {
  if (data === undefined) return undefined;
  return { strategy: data ? { ...data, services: data.services.map((service) => ({ ...service, name: serviceName(service) })) } : data, box, names };
}

/** The leaderboards, as the page reads them. */
export function leaderboardsSees(data: Leagues | undefined, box: unknown, names: Words) {
  if (data === undefined) return undefined;
  return { leagues: data, box, names };
}

/** One league. */
export function leagueSees(league: NonNullable<Leagues>["leagues"][number] | null | undefined, names: Words) {
  if (league === undefined) return undefined;
  return { league, names };
}

/** Measurement: the checks and each day of Google's clicks against Analytics' visits, each day named as the reader reads it. */
export function measurementSees(data: Measurement | undefined, box: unknown, names: Words, dayName: (day: string) => string) {
  if (data === undefined) return undefined;
  const measurement = data?.measurement;
  return { measurement: measurement ? { ...measurement, byDay: measurement.byDay.map((day) => ({ ...day, name: dayName(day.day) })) } : null, box, names };
}

/** Opportunities: the plan, and the sums of its whole list (the eye keeps a long list's first rows only). */
export function opportunitiesSees(data: Plan | undefined, box: unknown, names: Words, notSorted: string) {
  if (data === undefined) return undefined;
  const rows = data?.plan?.opportunities ?? [];
  const rate = data?.plan?.siteRate ?? null;
  const kindOf = new Map((data?.kinds ?? []).map((entry) => [entry.page, entry.kind]));
  const pages = new Map<string, number>();
  const kinds = new Map<string, { searches: number; sorted: boolean }>();
  for (const row of rows) {
    if (row.page) pages.set(row.page, (pages.get(row.page) ?? 0) + 1);
    const kind = row.page ? kindOf.get(row.page) ?? null : null;
    const key = kind ?? notSorted;
    kinds.set(key, { searches: (kinds.get(key)?.searches ?? 0) + 1, sorted: kind !== null });
  }
  return {
    plan: data,
    box,
    names,
    sums: {
      count: rows.length,
      volume: rows.reduce((sum, row) => sum + (row.volume ?? 0), 0),
      volumeBelow: rate === null ? 0 : rows.filter((row) => row.rate !== null && row.rate < rate).reduce((sum, row) => sum + (row.volume ?? 0), 0),
      pages: [...pages].map(([page, searches]) => ({ page, searches })).sort((a, b) => b.searches - a.searches).slice(0, 10),
      kinds: [...kinds].map(([name, entry]) => ({ name, ...entry })).sort((a, b) => b.searches - a.searches).slice(0, 10),
    },
  };
}

/** Verdicts that take a page away: merged into another, redirected, or removed. */
const GOING = new Set(["MERGE", "REDIRECT", "REMOVE"]);

/** The page plan: the plan, the decisions, and the sums of the whole list of decisions (the chart by kind of page among them). */
export function pagePlanSees(data: Plan | undefined, decided: Decisions | undefined, box: unknown, names: Words, notSorted: string) {
  if (data === undefined || decided === undefined) return undefined;
  const decisions = decided?.decisions ?? [];
  // Each kind's pages the plan takes away (merge, redirect, remove) and every page it would change (improve as well).
  const kinds = new Map<string, { going: number; changing: number; sorted: boolean }>();
  for (const row of decisions) {
    if (row.verdict === "KEEP") continue;
    const key = row.kind ?? notSorted;
    const held = kinds.get(key) ?? { going: 0, changing: 0, sorted: row.kind !== null };
    kinds.set(key, { ...held, going: held.going + (GOING.has(row.verdict) ? 1 : 0), changing: held.changing + 1 });
  }
  const rebuild = (data?.plan?.pages ?? []).filter((row) => row.action === "REBUILD" || row.action === "RESTORE");
  return {
    plan: data,
    decisions: decided ? { pages: decided.pages, decisions, creates: decided.creates } : decided,
    box,
    names,
    sums: {
      kinds: [...kinds].map(([name, entry]) => ({ name, ...entry })).sort((a, b) => b.going - a.going || b.changing - a.changing).slice(0, 10),
      going: decisions.filter((row) => GOING.has(row.verdict)).length,
      changing: decisions.filter((row) => row.verdict !== "KEEP").length,
      goingVisits: decisions.filter((row) => GOING.has(row.verdict)).reduce((sum, row) => sum + row.visits, 0),
      changingVisits: decisions.filter((row) => row.verdict !== "KEEP").reduce((sum, row) => sum + row.visits, 0),
      visits: decisions.reduce((sum, row) => sum + row.visits, 0),
      // A page to rebuild or restore keeps what it brought a year (`a`) and brings now (`b`): its old page's, where it took over.
      rebuildEnquiries: rebuild.reduce((sum, row) => sum + (row.b ?? 0), 0),
      rebuildEnquiriesBefore: rebuild.every((row) => row.a === null) ? null : rebuild.reduce((sum, row) => sum + (row.a ?? 0), 0),
    },
  };
}

/** Page reviews: the reviewed pages, as the page reads them. */
export function pageReviewsSees(data: Conversion | undefined, names: Words) {
  if (data === undefined) return undefined;
  return { conversion: data ? { host: data.host, week: data.week, pages: data.pages, kinds: data.kinds } : data, names };
}

/** A page's review: its review, its service's figures and searches, and the rivals' pages AI cites for it. */
export function pageReviewSees(review: NonNullable<Conversion>["pages"][number] | undefined, service: Service | undefined, cited: unknown, names: Words) {
  return { review, service, cited, names };
}

// ---------------------------------------------------------------------------
// Each page's names: the reader's words for what its rules name, from the section's own translations
// ---------------------------------------------------------------------------

/** The section's words, as `usePlatformTranslations("insights")` gives them. */
export type InsightsWords = (key: string, values?: Record<string, string | number>) => string;
/** Words with a name still to fill ("{name}, one place above"): the rule fills it with the website it names. */
const slot = (t: InsightsWords, key: string, name: string) => t(key, { [name]: `{${name}}` });
const LEAGUES = ["strength", "traffic", "mindshare", "shareOfVoice", "links", "aiOverviews", "recommended", "cited", "reviews"] as const;
const places = (t: InsightsWords) => ({ leader: slot(t, "sees.leader", "name"), above: slot(t, "sees.above", "name"), below: slot(t, "sees.below", "name") });

export const enquiriesNames = (t: InsightsWords) => ({
  website: t("sees.website"), visits: t("enquiries.columns.visits"), visitsShare: t("enquiries.kinds.shareVisits"), noEnquiryClicks: t("sees.noEnquiryClicks"),
});
export const enquirySourceNames = (t: InsightsWords, source: string) => ({ source, website: t("sees.website"), visitsShare: t("enquiries.kinds.shareVisits"), lastThreeMonths: t("sees.lastThreeMonths") });
export const funnelNames = (t: InsightsWords) => ({ website: t("sees.website"), rates: { click: t("funnel.rates.click"), visit: t("funnel.rates.visit"), enquire: t("funnel.rates.enquire") } });
export const aiSearchNames = (t: InsightsWords, engines: Record<string, string>) => ({ ai: t("why.groups.AI"), theirEnquiries: t("sees.theirEnquiries"), visitsShare: t("enquiries.kinds.shareVisits"), engines });
export const cannibalisationNames = (t: InsightsWords) => ({ otherGroups: t("sees.otherGroups"), everyGroup: t("sees.everyGroup") });
export const competingGroupNames = (t: InsightsWords) => ({ owner: slot(t, "sees.owner", "page"), otherPages: t("sees.otherPages"), splitSearches: t("sees.splitSearches") });
export const findingsNames = (t: InsightsWords) => ({
  thisWeek: t("sees.thisWeek"), usualWeek: t("sees.usualWeek"), foundAgain: t("sees.foundAgain"), right: t("words.status.right"),
  sections: Object.fromEntries(FINDING_SECTIONS.map((section) => [section, t(`findings.sections.${section}.title`)])),
});
export const findingNames = (t: InsightsWords) => ({ sinceWritten: t("sees.sinceWritten") });
export const thisWeekNames = (t: InsightsWords) => ({ website: t("sees.website") });
export const reportNames = (t: InsightsWords) => ({ website: t("sees.website"), visits: t("reports.figures.visits") });
export const summaryNames = (t: InsightsWords) => ({ website: t("sees.website"), visits: t("summary.visits"), traffic: t("leagues.traffic.title"), ...places(t) });
export const strategyNames = (t: InsightsWords) => ({ otherServices: t("sees.otherServices"), everyService: t("sees.everyService"), shownOnGoogle: t("sees.shownOnGoogle") });
export const leaderboardsNames = (t: InsightsWords) => ({ leagues: LEAGUES.map((id) => ({ id, title: t(`leagues.${id}.title`) })), ...places(t) });
export const leagueNames = (t: InsightsWords, league: string) => ({ title: (LEAGUES as readonly string[]).includes(league) ? t(`leagues.${league}.title`) : league, ...places(t) });
export const measurementNames = (t: InsightsWords) => ({ last28Days: t("sees.last28Days"), usualDay: t("sees.usualDay"), clicks: t("measurement.chart.clicks"), weekends: t("sees.weekends"), weekdays: t("sees.weekdays") });
export const opportunitiesNames = (t: InsightsWords) => ({ belowRate: t("sees.belowRate") });
export const pagePlanNames = (t: InsightsWords) => ({ toRebuild: t("sees.toRebuild"), toMergeOrRemove: t("sees.toMergeOrRemove"), toChange: t("sees.toChange") });
export const pageReviewsNames = (t: InsightsWords) => ({ lastTwelveMonths: t("sees.lastTwelveMonths") });
export const pageReviewNames = (t: InsightsWords) => ({ visits: t("pageReview.figures.visits"), lastNinetyDays: t("sees.lastNinetyDays"), lastTwelveMonths: t("sees.lastTwelveMonths"), shownOnGoogle: t("sees.shownOnGoogle"), rivalAbove: t("sees.rivalAbove") });
