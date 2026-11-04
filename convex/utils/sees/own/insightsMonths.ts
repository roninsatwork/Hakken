import { isNumber, isRow, named, partOf, round1, rowsOf, type OwnFound, type Row } from "./shared";
import { biggestMoves, changeOf, headlineOf, kindsOf, movedFrom, moveScore, namesOf, nowAndThen, RATE_FAR_POINTS, RATE_POINTS, rateOf, ratesApart, setBeside, shareFrom, sharesApart, sideOf, sortedKind, SPAN, trioOf, wholeFrom, word } from "./insightsShared";
import { leagueAgainst } from "./insightsWeek";

/** Insights' pages that follow the period menu — Enquiries, a source's enquiries, the Funnel, the Summary, This week, a report, Your month, Findings and a finding (ask-hakken-every-chart-page-plan-2026-11-03.md, section 9). */

// ---------------------------------------------------------------------------
// Enquiries, and one source's enquiries
// ---------------------------------------------------------------------------

/**
 * What brings enquiries: the website's enquiries against the span compared (its headline), the kinds of page whose share
 * of enquiries is far from their share of visits and whose enquiries moved most, the sources (each by its own name) that
 * moved most and whose enquiry rate is furthest from the website's, and the clicks going to searches whose pages brought
 * no enquiry.
 */
export function enquiriesFindings(data: Row): OwnFound[] {
  const view = isRow(data.period) ? data.period : {};
  const read = isRow(data.enquiries) ? data.enquiries : {};
  const names = namesOf(data);
  const side = sideOf(view.chosen);
  const figures = isRow(view.figures) ? view.figures : {};
  const found: OwnFound[] = [];
  const headline = headlineOf(figures, side, names);
  if (headline) found.push(headline);
  const enquiries = trioOf(figures.enquiries), visits = trioOf(figures.visits);
  const websiteThen = enquiries && side ? enquiries[side] : null;
  const websiteChange = enquiries && websiteThen ? changeOf(enquiries.now, websiteThen) : null;
  found.push(...kindsOf(view, side, names, websiteChange));

  // Sources, each by its own name: the biggest rise and fall in enquiries, the website's change beside.
  const sources = rowsOf(read.sources).filter((row) => named(row) && row.sorted !== false).map((row) => ({ row, ...nowAndThen(row, side) })).filter((one) => one.visits && one.enquiries);
  const website = word(names, "website");
  const movers = sources.map((one) => ({ name: named(one.row)!, now: one.enquiries!.now, then: one.then(one.enquiries) ?? 0 }));
  for (const one of biggestMoves(movers, Math.max(30, (enquiries?.now ?? 0) * 0.01), 0.1)) {
    found.push(movedFrom("sources", one.name, "enquiries", one.now, one.then, moveScore(0.95, one.now, one.then), side ? SPAN[side] : "the span before", website && websiteChange !== null ? { name: website, change: websiteChange } : null));
  }
  // The source whose enquiry rate is furthest from the whole website's.
  if (enquiries && visits && visits.now > 0) {
    const apart = ratesApart(sources.map((one) => ({ name: named(one.row)!, visits: one.visits!.now, enquiries: one.enquiries!.now })), rateOf(enquiries.now, visits.now), 100)[0];
    if (apart) found.push(setBeside("sourceRates", apart.row.name, "enquiryRatePercent", apart.rate, rateOf(enquiries.now, visits.now), 0.85 + Math.min(0.5, apart.weight / 2000), null));
  }
  // Google's clicks going to searches whose pages brought no enquiry from Google, of every click the two lists hold.
  const sums = isRow(data.sums) ? data.sums : {};
  const quiet = isNumber(sums.noEnquiryClicks) ? sums.noEnquiryClicks : null;
  const listed = isNumber(sums.clicksListed) ? sums.clicksListed : null;
  const quietName = word(names, "noEnquiryClicks");
  if (quiet !== null && listed !== null && listed > 0 && quietName && quiet / listed >= 0.05) found.push(partOf("noEnquiries", quietName, "clicks", quiet, listed, 0.7 + Math.min(0.5, quiet / listed)));
  return found;
}

/**
 * One source's enquiries: its enquiries against the span compared beside the website's (its headline), its enquiry rate
 * against the website's, its last three months against the three before, the kinds of page it sends people to whose share
 * of its enquiries is far from their share of its visits, and a page holding most of its enquiries.
 */
export function enquirySourceFindings(data: Row): OwnFound[] {
  const source = isRow(data.source) ? data.source : {};
  const website = isRow(data.website) ? data.website : {};
  const names = namesOf(data);
  const name = word(names, "source");
  const figures = isRow(source.figures) ? source.figures : {};
  const side = sideOf(source.chosen);
  const enquiries = trioOf(figures.enquiries), visits = trioOf(figures.visits);
  if (!name || !enquiries || !visits) return [];
  const found: OwnFound[] = [];
  const siteEnquiries = trioOf(website.enquiries), siteVisits = trioOf(website.visits);
  const then = side ? enquiries[side] : null;
  const siteThen = siteEnquiries && side ? siteEnquiries[side] : null;
  const websiteName = word(names, "website");
  if (then !== null && then > 0) {
    const other = siteEnquiries && siteThen && siteThen > 0 && websiteName ? { name: websiteName, change: changeOf(siteEnquiries.now, siteThen) } : null;
    found.push(movedFrom("source", name, "enquiries", enquiries.now, then, moveScore(2, enquiries.now, then), SPAN[side!], other));
  }
  // Its visits, where they moved apart from its enquiries.
  const visitsThen = side ? visits[side] : null;
  if (visitsThen !== null && visitsThen > 0 && Math.abs(changeOf(visits.now, visitsThen)) >= 0.1) found.push(movedFrom("sourceVisits", name, "visits", visits.now, visitsThen, moveScore(0.8, visits.now, visitsThen), SPAN[side!]));
  // Its share of the whole website's enquiries, against its share in the span compared.
  if (siteEnquiries && siteThen && then !== null && siteEnquiries.now > 0 && siteThen > 0) {
    const share = rateOf(enquiries.now, siteEnquiries.now), before = rateOf(then, siteThen);
    if (Math.abs(share - before) >= 0.1 && before > 0 && Math.abs(changeOf(share, before)) >= 0.2) found.push(shareFrom("share", name, "enquiries", share, before, 0.9 + Math.min(0.4, Math.abs(share - before) / 10), SPAN[side!]));
  }
  // Its enquiry rate against the whole website's.
  if (siteEnquiries && siteVisits && siteVisits.now > 0 && visits.now >= 50) {
    const rate = rateOf(enquiries.now, visits.now), siteRate = rateOf(siteEnquiries.now, siteVisits.now);
    // Far enough to matter: a fifth or more apart, or twenty points whatever the ratio (69% against 76% is no news).
    const far = siteRate > 0 && (rate / siteRate >= 1.25 || rate / siteRate <= 0.8 || Math.abs(rate - siteRate) >= RATE_FAR_POINTS);
    if (Math.abs(rate - siteRate) >= RATE_POINTS && far) found.push(setBeside("rate", name, "enquiryRatePercent", rate, siteRate, 1.2 + Math.min(0.5, Math.abs(rate - siteRate) / 60), null));
  }
  // The last three whole months against the three before them, from its months.
  const months = rowsOf(source.months).filter((row) => typeof row.month === "string" && isNumber(row.enquiries)).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const lastThree = word(names, "lastThreeMonths");
  if (months.length >= 6 && lastThree) {
    const sum = (rows: Row[]) => rows.reduce((total, row) => total + (row.enquiries as number), 0);
    const now = sum(months.slice(-3)), before = sum(months.slice(-6, -3));
    if (before > 0 && Math.abs(changeOf(now, before)) >= 0.05) found.push(movedFrom("months", lastThree, "enquiries", now, before, moveScore(1, now, before), "the 3 months before"));
  }
  // The kinds of page it sends people to: a share of its enquiries far from the share of its visits.
  const visitsShare = word(names, "visitsShare");
  const kinds = rowsOf(source.kinds).filter((row) => isNumber(row.visits) && isNumber(row.enquiries));
  if (visitsShare) {
    const sorted = kinds.filter(sortedKind).map((row) => ({ name: named(row)!, visits: row.visits as number, enquiries: row.enquiries as number }));
    const rest = { name: "", visits: kinds.reduce((sum, row) => sum + (row.visits as number), 0) - sorted.reduce((sum, row) => sum + row.visits, 0), enquiries: kinds.reduce((sum, row) => sum + (row.enquiries as number), 0) - sorted.reduce((sum, row) => sum + row.enquiries, 0) };
    for (const one of sharesApart([...sorted, rest], 20).filter((one) => one.row.name)) found.push(setBeside("kindShares", one.row.name, "enquiriesSharePercent", one.enquiriesShare, one.visitsShare, 1 + Math.min(0.5, one.weight / 100), visitsShare));
  }
  // A page holding most of its enquiries.
  const pages = rowsOf(source.pages).filter((row) => typeof row.path === "string" && isNumber(row.enquiries));
  const top = [...pages].sort((a, b) => (b.enquiries as number) - (a.enquiries as number))[0];
  if (top && enquiries.now > 0 && (top.enquiries as number) / enquiries.now >= 0.3 && pages.length >= 3) found.push(partOf("pages", String(top.path), "enquiries", top.enquiries as number, enquiries.now, 0.8 + Math.min(0.5, (top.enquiries as number) / enquiries.now - 0.3)));
  return found;
}

// ---------------------------------------------------------------------------
// The funnel
// ---------------------------------------------------------------------------

/** The funnel's step-to-step rates, each by the figure it is: a click rate, visits counted for each 100 clicks, an enquiry rate. */
const STEPS = [
  { key: "click", top: "CLICKED", bottom: "SHOWN", measure: "ctrPercent" },
  { key: "visit", top: "VISITED", bottom: "CLICKED", measure: "visitsPerHundredClicks" },
  { key: "enquire", top: "ENQUIRED", bottom: "VISITED", measure: "enquiryRatePercent" },
] as const;

/** Google Analytics' own name for visits from Google's results, as the funnel's sources table shows it: what each source is set against. */
const ORGANIC = "Organic Search";

/**
 * The funnel: the step whose rate fell most against the same 90 days a year before (its headline), the source whose
 * enquiry rate moved most set against Organic Search's, the source furthest from the website's rate and the one whose
 * visits moved most (the last 12 months against the 12 before), and the kind of page whose enquiry rate moved most over
 * the period chosen.
 */
export function funnelFindings(data: Row): OwnFound[] {
  const read = isRow(data.funnel) ? data.funnel : {};
  const names = namesOf(data);
  const rates = isRow(names.rates) ? names.rates : {};
  const found: OwnFound[] = [];
  const steps = new Map(rowsOf(read.funnel).map((row) => [String(row.step), row]));
  const moves = STEPS.flatMap((step) => {
    const top = steps.get(step.top), bottom = steps.get(step.bottom), name = word(rates, step.key);
    if (!top || !bottom || !name || !isNumber(top.now) || !isNumber(bottom.now) || !isNumber(top.year) || !isNumber(bottom.year) || bottom.now <= 0 || bottom.year <= 0 || top.year <= 0) return [];
    return [{ name, measure: step.measure, now: rateOf(top.now, bottom.now), then: rateOf(top.year, bottom.year) }];
  }).sort((a, b) => changeOf(a.now, a.then) - changeOf(b.now, b.then));
  moves.forEach((one, at) => found.push(movedFrom("steps", one.name, one.measure, one.now, one.then, at === 0 ? moveScore(2, one.now, one.then) : moveScore(1, one.now, one.then), "the same 90 days a year before")));

  // Each source over the last 12 months against the 12 before, as Analytics names its channels.
  type Channel = { name: string; visits: number; enquiries: number; visitsBefore: number | null; enquiriesBefore: number | null };
  const channels: Channel[] = rowsOf(read.sources).filter((row) => typeof row.channel === "string" && isNumber(row.visits) && isNumber(row.enquiries)).map((row) => ({
    name: String(row.channel), visits: row.visits as number, enquiries: row.enquiries as number,
    visitsBefore: isNumber(row.visitsBefore) ? row.visitsBefore : null, enquiriesBefore: isNumber(row.enquiriesBefore) ? row.enquiriesBefore : null,
  }));
  const visits = channels.reduce((sum, row) => sum + row.visits, 0);
  const enquiries = channels.reduce((sum, row) => sum + row.enquiries, 0);
  const visitsBefore = channels.reduce((sum, row) => sum + (row.visitsBefore ?? 0), 0);
  const trusted = channels.filter((row) => row.visits >= Math.max(200, visits * 0.02) && (row.visitsBefore ?? 0) >= 100 && (row.enquiriesBefore ?? 0) > 0);
  const organicRow = trusted.find((row) => row.name === ORGANIC);
  const rateChange = (row: Channel) => changeOf(rateOf(row.enquiries, row.visits), rateOf(row.enquiriesBefore!, row.visitsBefore!));
  const rateMovers = trusted.filter((row) => row !== organicRow && Math.abs(rateChange(row)) >= 0.1)
    .sort((a, b) => Math.abs(rateChange(b)) * Math.sqrt(b.visits) - Math.abs(rateChange(a)) * Math.sqrt(a.visits));
  const worst = rateMovers.find((row) => rateChange(row) < 0) ?? rateMovers[0];
  if (worst) {
    const other = organicRow ? { name: organicRow.name, change: rateChange(organicRow) } : null;
    found.push(movedFrom("channelRates", worst.name, "enquiryRatePercent", rateOf(worst.enquiries, worst.visits), rateOf(worst.enquiriesBefore!, worst.visitsBefore!), moveScore(1.2, rateOf(worst.enquiries, worst.visits), rateOf(worst.enquiriesBefore!, worst.visitsBefore!)), "the 12 months before", other));
  }
  // The source furthest from the website's own enquiry rate.
  if (visits > 0) {
    const apart = ratesApart(channels.map((row) => ({ name: row.name, visits: row.visits, enquiries: row.enquiries })), rateOf(enquiries, visits), 200)[0];
    if (apart) found.push(setBeside("channelRate", apart.row.name, "enquiryRatePercent", apart.rate, rateOf(enquiries, visits), 0.9 + Math.min(0.5, apart.weight / 5000), null));
  }
  // The source whose visits moved most, the website's visits' change beside.
  const website = word(names, "website");
  const visitMovers = biggestMoves(channels.filter((row) => row.visitsBefore !== null).map((row) => ({ name: row.name, now: row.visits, then: row.visitsBefore! })), Math.max(200, visits * 0.01), 0.1);
  if (visitMovers[0]) found.push(movedFrom("channelVisits", visitMovers[0].name, "visits", visitMovers[0].now, visitMovers[0].then, moveScore(0.8, visitMovers[0].now, visitMovers[0].then), "the 12 months before", website && visitsBefore > 0 ? { name: website, change: changeOf(visits, visitsBefore) } : null));

  // The kind of page whose enquiry rate moved most over the period chosen (the chart of visits that enquired by kind).
  const view = isRow(data.period) ? data.period : {};
  const side = sideOf(view.chosen);
  if (side) {
    const kinds = rowsOf(view.kinds).filter(sortedKind).flatMap((row) => {
      const { visits: v, enquiries: e } = nowAndThen(row, side);
      const vThen = v?.[side] ?? null, eThen = e?.[side] ?? null;
      if (!v || !e || vThen === null || eThen === null || v.now < 100 || vThen < 100 || eThen <= 0) return [];
      return [{ name: named(row)!, now: rateOf(e.now, v.now), then: rateOf(eThen, vThen), weight: Math.sqrt(v.now) }];
    }).filter((one) => Math.abs(one.now - one.then) >= RATE_POINTS)
      .sort((a, b) => Math.abs(b.now - b.then) * b.weight - Math.abs(a.now - a.then) * a.weight);
    if (kinds[0]) found.push(movedFrom("kindRates", kinds[0].name, "enquiryRatePercent", kinds[0].now, kinds[0].then, moveScore(0.9, kinds[0].now, kinds[0].then), SPAN[side]));
  }
  return found;
}

// ---------------------------------------------------------------------------
// The Summary, This week, a report and Your month
// ---------------------------------------------------------------------------

/** The scorecard's measures by the eye's names: the counts, the "for one enquiry" figures, the market share. */
const SCORE_MEASURES: Record<string, string> = {
  enquiries: "enquiries", visitors: "visitors", googleVisits: "googleVisits", googleEnquiries: "googleEnquiries", aiVisits: "aiVisits",
  aiMentions: "aiMentions", reviews: "reviews", visitorsPerEnquiry: "visitorsPerEnquiry", googleClicksPerEnquiry: "googleClicksPerEnquiry",
  marketShare: "marketSharePercent", strength: "strength",
};
const DERIVED = new Set(["visitorsPerEnquiry", "googleClicksPerEnquiry"]);

/**
 * The scorecard (the last 90 days against the same 90 a year before): the measure that did worst and the one that did
 * best, by their change — a "for one enquiry" figure turned round, as less is better; a figure the scorecard rounds to a
 * whole number of visitors for one enquiry worked out from its visitors and enquiries instead.
 */
function scorecardOf(rows: unknown, website: string | null): OwnFound[] {
  const scores = rowsOf(rows).filter((row) => typeof row.measure === "string" && isNumber(row.now));
  const found: OwnFound[] = [];
  const span = "the same 90 days a year before";
  const counted = scores.filter((row) => !DERIVED.has(String(row.measure)) && row.unit !== "percent" && isNumber(row.before) && (row.before as number) > 0 && SCORE_MEASURES[String(row.measure)])
    .map((row) => ({ measure: SCORE_MEASURES[String(row.measure)], now: row.now as number, then: row.before as number, good: (row.lowerIsBetter === true ? -1 : 1) * changeOf(row.now as number, row.before as number) }))
    .sort((a, b) => a.good - b.good);
  const worst = counted[0], best = counted.length > 1 ? counted[counted.length - 1] : undefined;
  if (worst) found.push(wholeFrom("scoreWorst", worst.measure, worst.now, worst.then, 1.3 + Math.min(0.4, Math.abs(worst.good)), span));
  if (best && best.measure !== worst?.measure && best.good > 0) found.push(wholeFrom("scoreBest", best.measure, best.now, best.then, 0.9 + Math.min(0.3, best.good / 5), span));
  // Visitors for one enquiry, from the scorecard's own visitors and enquiries: its figure rounds 0.86 and 1.37 both to 1.
  const visitors = scores.find((row) => row.measure === "visitors"), enquiries = scores.find((row) => row.measure === "enquiries");
  if (website && visitors && enquiries && isNumber(visitors.before) && isNumber(enquiries.before) && (enquiries.now as number) > 0 && (enquiries.before as number) > 0) {
    const now = (visitors.now as number) / (enquiries.now as number), then = (visitors.before as number) / (enquiries.before as number);
    if (Math.abs(changeOf(now, then)) >= 0.03) found.push(movedFrom("perEnquiry", website, "visitorsPerEnquiry", now, then, moveScore(1.5, now, then), span));
  }
  return found;
}

/** The website's share of its market's Google visitors in the newest month held, against the biggest rival's. */
function marketOf(months: unknown, you: string | null): OwnFound | null {
  const newest = rowsOf(months).filter((row) => typeof row.month === "string" && isNumber(row.total) && isNumber(row.you) && (row.total as number) > 0).sort((a, b) => String(b.month).localeCompare(String(a.month)))[0];
  if (!newest || !you) return null;
  const rival = rowsOf(newest.rivals).filter((row) => typeof row.host === "string" && isNumber(row.value)).sort((a, b) => (b.value as number) - (a.value as number))[0];
  if (!rival) return null;
  const total = newest.total as number;
  return setBeside("market", you, "marketSharePercent", rateOf(newest.you as number, total), rateOf(rival.value as number, total), 1.1, String(rival.host));
}

/** The newest whole month's enquiries against the month before, and the same month a year before where held. */
function monthsOf(rows: unknown, before: string): OwnFound[] {
  const months = rowsOf(rows).filter((row) => typeof row.month === "string" && isNumber(row.conversions) && String(row.month) < before && named(row)).sort((a, b) => String(a.month).localeCompare(String(b.month)));
  const newest = months.at(-1);
  if (!newest) return [];
  const found: OwnFound[] = [];
  const month = String(newest.month);
  const yearAgo = months.find((row) => row.month === `${Number(month.slice(0, 4)) - 1}${month.slice(4)}`);
  const prior = months.at(-2);
  const now = newest.conversions as number;
  if (yearAgo && (yearAgo.conversions as number) > 0) found.push(movedFrom("month", named(newest)!, "enquiries", now, yearAgo.conversions as number, moveScore(1.4, now, yearAgo.conversions as number), "the same month a year before"));
  else if (prior && (prior.conversions as number) > 0) found.push(movedFrom("month", named(newest)!, "enquiries", now, prior.conversions as number, moveScore(1.1, now, prior.conversions as number), "the month before"));
  return found;
}

/**
 * The Summary: the period's enquiries against the span compared, its visits beside (its headline), its enquiry rate, the
 * kinds of page that moved, the scorecard's worst and best measures, the market share against the biggest rival's, and
 * the website against the leader in organic traffic.
 */
export function summaryFindings(data: Row): OwnFound[] {
  const view = isRow(data.period) ? data.period : {};
  const names = namesOf(data);
  const side = sideOf(view.chosen);
  const figures = isRow(view.figures) ? view.figures : {};
  const found: OwnFound[] = [];
  const headline = headlineOf(figures, side, names);
  if (headline) found.push(headline);
  const enquiries = trioOf(figures.enquiries);
  const websiteThen = enquiries && side ? enquiries[side] : null;
  // Its enquiry rate, worked out from its enquiries and visits: the box keeps it to a tenth.
  const visits = trioOf(figures.visits);
  const visitsThen = visits && side ? visits[side] : null;
  const website = word(names, "website");
  if (enquiries && visits && websiteThen && visitsThen && visits.now > 0 && website) {
    const now = rateOf(enquiries.now, visits.now), then = rateOf(websiteThen, visitsThen);
    if (Math.abs(now - then) >= 1) found.push(movedFrom("rate", website, "enquiryRatePercent", now, then, moveScore(1, now, then), SPAN[side!]));
  }
  found.push(...kindsOf(view, side, names, enquiries && websiteThen ? changeOf(enquiries.now, websiteThen) : null).filter((one) => one.list === "kinds").slice(0, 1));
  const newest = isRow(data.newest) ? data.newest : {};
  found.push(...scorecardOf(data.scorecard, word(names, "website")));
  const market = marketOf(data.shareByMonth, typeof newest.host === "string" ? newest.host : null);
  if (market) found.push(market);
  const leagues = isRow(data.leagues) ? data.leagues : {};
  const traffic = rowsOf(leagues.leagues).find((row) => row.id === "traffic");
  const trafficName = word(names, "traffic");
  if (traffic && trafficName) found.push(...leagueAgainst(traffic, "leagues", trafficName, names).slice(0, 1).map((one) => ({ ...one, score: 0.95 })));
  return found;
}

/**
 * This week: visitors for one enquiry against the same 90 days a year before (its headline), the scorecard's worst and
 * best measures, the newest whole month's enquiries, the website's share of its market against the biggest rival's, and
 * how much of what is at stake sits in one finding.
 */
export function thisWeekFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const newest = isRow(data.newest) ? data.newest : null;
  if (!newest) return [];
  const found: OwnFound[] = scorecardOf(data.scorecard, word(names, "website")).map((one) => (one.list === "perEnquiry" ? { ...one, score: one.score + 0.6 } : one));
  found.push(...monthsOf(data.enquiriesByMonth, typeof newest.week === "string" ? newest.week.slice(0, 7) : "9999-99"));
  const market = marketOf(data.shareByMonth, typeof newest.host === "string" ? newest.host : null);
  if (market) found.push(market);
  // What is at stake in the week's findings, and the share one finding holds.
  const findings = rowsOf(data.findings).filter((row) => isNumber(row.atStake) && (row.atStake as number) > 0);
  const stake = findings.reduce((sum, row) => sum + (row.atStake as number), 0);
  const top = [...findings].sort((a, b) => (b.atStake as number) - (a.atStake as number))[0];
  if (top && findings.length >= 2 && stake > 0 && typeof top.headline === "string" && (top.atStake as number) / stake >= 0.4) found.push(partOf("stake", top.headline, "enquiries", top.atStake as number, stake, 1));
  return found;
}

/**
 * A report, and Your month: the month's enquiries against the month before, its visits beside (its headline, a monthly
 * report's), or the scorecard's enquiries (a weekly or board report's); the same month a year before where held; the
 * scorecard's worst and best measures; the month's Google clicks; and the market share against the biggest rival's.
 */
export function reportFindings(data: Row): OwnFound[] {
  const report = isRow(data.report) ? data.report : {};
  const body = data;
  const names = namesOf(data);
  const found: OwnFound[] = [];
  const facts = new Map(rowsOf(body.facts).filter((row) => typeof row.key === "string" && isNumber(row.value)).map((row) => [String(row.key), row.value as number]));
  const monthName = word(names, "month");
  const visitsName = word(names, "visits");
  const pair = (key: string) => {
    const now = facts.get(`month.${key}.now`), before = facts.get(`month.${key}.before`);
    return isNumber(now) && isNumber(before) && before > 0 ? { now, before } : null;
  };
  const enquiries = pair("enquiries"), visits = pair("visits"), clicks = pair("googleClicks");
  if (report.kind === "MONTHLY" && enquiries && monthName) {
    found.push(movedFrom("month", monthName, "enquiries", enquiries.now, enquiries.before, moveScore(2, enquiries.now, enquiries.before), "the month before", visits && visitsName ? { name: visitsName, change: changeOf(visits.now, visits.before) } : null));
  }
  if (clicks && monthName) found.push(movedFrom("clicks", monthName, "clicks", clicks.now, clicks.before, moveScore(0.85, clicks.now, clicks.before), "the month before"));
  // The same month a year before, where the months held reach it.
  if (report.kind === "MONTHLY" && typeof report.period === "string") {
    const period = report.period;
    const months = rowsOf(body.enquiriesByMonth);
    const now = months.find((row) => row.month === period), yearAgo = months.find((row) => row.month === `${Number(period.slice(0, 4)) - 1}${period.slice(4)}`);
    if (now && yearAgo && isNumber(now.conversions) && isNumber(yearAgo.conversions) && yearAgo.conversions > 0 && named(now)) found.push(movedFrom("yearAgo", named(now)!, "enquiries", now.conversions, yearAgo.conversions, moveScore(1.4, now.conversions, yearAgo.conversions), "the same month a year before"));
  }
  const scores = scorecardOf(body.scorecard, word(names, "website"));
  // A weekly or board report's headline: the scorecard's enquiries, the last 90 days against the same 90 a year before.
  const enquiryScore = rowsOf(body.scorecard).find((row) => row.measure === "enquiries" && isNumber(row.now) && isNumber(row.before) && (row.before as number) > 0);
  if (report.kind !== "MONTHLY" && enquiryScore) {
    const website = word(names, "website");
    if (website) found.push(movedFrom("enquiries", website, "enquiries", enquiryScore.now as number, enquiryScore.before as number, moveScore(2, enquiryScore.now as number, enquiryScore.before as number), "the same 90 days a year before"));
  }
  found.push(...scores.filter((one) => !(report.kind !== "MONTHLY" && one.list === "scoreBest" && one.params.measure === "enquiries")));
  const market = marketOf(body.shareByMonth, typeof report.host === "string" ? report.host : null);
  if (market) found.push(market);
  return found;
}

// ---------------------------------------------------------------------------
// Findings, and a finding
// ---------------------------------------------------------------------------

/**
 * Findings: the newest week's findings against the week before (its headline), a section with more findings this week
 * than its usual week, the findings found again from the week before, the section holding most of them, and the share of
 * the findings checked that proved right.
 */
export function findingsFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const sections = isRow(names.sections) ? names.sections : {};
  const weeks = rowsOf(data.weekly).filter((row) => typeof row.week === "string").sort((a, b) => String(a.week).localeCompare(String(b.week)));
  const found: OwnFound[] = [];
  const total = (row: Row) => Object.values(isRow(row.sections) ? row.sections : {}).reduce<number>((sum, value) => sum + (isNumber(value) ? value : 0), 0);
  const newest = weeks.at(-1), prior = weeks.at(-2);
  const thisWeek = word(names, "thisWeek");
  if (newest && prior && thisWeek && total(prior) > 0) found.push(movedFrom("weeks", thisWeek, "findings", total(newest), total(prior), moveScore(2, total(newest), total(prior)), "the week before"));
  // A section with more (or fewer) findings this week than its usual week, over up to 12 weeks before.
  const usual = word(names, "usualWeek");
  const earlier = weeks.slice(0, -1).slice(-12);
  if (newest && usual && earlier.length >= 2) {
    const apart = Object.keys(sections).flatMap((section) => {
      const name = word(sections, section);
      const now = isRow(newest.sections) && isNumber(newest.sections[section]) ? (newest.sections[section] as number) : 0;
      const mean = earlier.reduce((sum, row) => sum + (isRow(row.sections) && isNumber(row.sections[section]) ? (row.sections[section] as number) : 0), 0) / earlier.length;
      return name && Math.abs(now - mean) >= 2 && (mean === 0 || now / mean >= 1.5 || now / mean <= 1 / 1.5) ? [{ name, now, mean }] : [];
    }).sort((a, b) => Math.abs(b.now - b.mean) - Math.abs(a.now - a.mean))[0];
    if (apart) found.push(setBeside("sections", apart.name, "findings", apart.now, round1(apart.mean), 1.3, usual));
  }
  const sums = isRow(data.sums) ? data.sums : {};
  // This week's findings the team found the week before too: the same story, still open.
  const again = word(names, "foundAgain");
  if (again && isNumber(sums.foundAgain) && isNumber(sums.thisWeek) && sums.thisWeek > 0 && sums.foundAgain > 0) found.push(partOf("again", again, "findings", sums.foundAgain, sums.thisWeek, 1 + Math.min(0.4, sums.foundAgain / sums.thisWeek / 2)));
  // The section holding most of every finding listed.
  const all = rowsOf(data.bySection).filter((row) => named(row) && isNumber(row.findings));
  const whole = all.reduce((sum, row) => sum + (row.findings as number), 0);
  const top = [...all].sort((a, b) => (b.findings as number) - (a.findings as number))[0];
  if (top && whole > 0 && all.length >= 3 && (top.findings as number) / whole >= 0.3) found.push(partOf("bySection", named(top)!, "findings", top.findings as number, whole, 0.8 + Math.min(0.4, (top.findings as number) / whole - 0.3)));
  // The findings Hakken checked that proved right.
  const right = word(names, "right");
  if (right && isNumber(sums.checked) && isNumber(sums.right) && sums.checked >= 3) found.push(partOf("checked", right, "checkedFindings", sums.right, sums.checked, 1.1));
  return found;
}

/** The figure a finding's fact is, by its key's own name ("sc.page./.clicks.90.now" is clicks), where the eye has words for it. */
const FACT_MEASURES: ReadonlyArray<[RegExp, string]> = [
  [/\.brandClicks\./, "brandClicks"], [/\.clicks\./, "clicks"], [/\.impressions\./, "impressions"], [/\.position\./, "position"],
  [/\.peoplePerConversion\./, "peoplePerConversion"], [/\.conversionRate\./, "conversionRatePercent"], [/\.conversions\./, "conversions"],
  [/\.times\./, "conversions"], [/\.people\./, "people"], [/\.visits\./, "visits"], [/\.enquiries\./, "enquiries"],
  [/\.linkingSites\./, "linkingWebsites"], [/\.strength\./, "strength"], [/^tech\./, "pages"],
];
const measureOfFact = (key: string) => FACT_MEASURES.find(([pattern]) => pattern.test(key))?.[1] ?? null;
/** Two facts of one figure, a span apart: the same key but for its last part ("….now" and "….before"). */
const sameFigure = (a: string, b: string) => a.replace(/\.[^.]+$/, "") === b.replace(/\.[^.]+$/, "") && a !== b;

/**
 * A finding: each pair of figures it rests on, worked out in code — the same figure against its span before, or one
 * figure beside the other it is set against (returning visitors' rate beside new visitors') — the first the team put
 * first, and its figure since it was written against the day it was.
 */
export function findingFindings(data: Row): OwnFound[] {
  const finding = isRow(data.finding) ? data.finding : {};
  const names = namesOf(data);
  const headings = isRow(names.figures) ? names.figures : {};
  const facts = new Map(rowsOf(finding.facts).filter((row) => typeof row.key === "string" && isNumber(row.value)).map((row) => [String(row.key), row]));
  const found: OwnFound[] = [];
  const pairs = Array.isArray(finding.comparisons) ? finding.comparisons.filter((pair): pair is [string, string] => Array.isArray(pair) && pair.length === 2 && pair.every((key) => typeof key === "string")) : [];
  pairs.forEach(([a, b], at) => {
    const now = facts.get(a), then = facts.get(b);
    const measure = measureOfFact(a);
    const name = word(headings, a);
    if (!now || !then || !measure || !name || now.unit !== then.unit) return;
    const value = now.value as number, other = then.value as number;
    const score = 2 - at * 0.15;
    if (sameFigure(a, b)) {
      if (other > 0 && value !== other) found.push(movedFrom("figures", name, measure, value, other, score, "the span it is set against"));
    } else if (value !== other && word(headings, b)) found.push(setBeside("against", name, measure, value, other, score, word(headings, b)!));
  });
  // Its figure since it was written, against the day it was (`progress`), where it has moved.
  const progress = isRow(finding.progress) ? finding.progress : {};
  const since = word(names, "sinceWritten");
  const first = pairs[0] ? measureOfFact(pairs[0][0]) : null;
  if (since && first && isNumber(progress.now) && isNumber(progress.against) && progress.against > 0 && progress.now !== progress.against && progress.than === "WRITTEN") {
    found.push(movedFrom("progress", since, first, progress.now, progress.against, 1.2, "the day it was written"));
  }
  return found;
}
