import { isNumber, isRow, named, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { biggestMoves, changeOf, filled, movedFrom, moveScore, namesOf, percentOf, RATE_POINTS, rateOf, rivalMoved, setBeside, shareFrom, sharesApart, sortedKind, unitOf, word } from "./insightsShared";

/** Insights' pages read from the newest week — Leaderboards and a league, AI search, Cannibalisation and a group, Measurement, Opportunities, the Page plan, Page reviews and a page review, and the Strategy (ask-hakken-every-chart-page-plan-2026-11-03.md, section 9). */

// ---------------------------------------------------------------------------
// Leaderboards and a league
// ---------------------------------------------------------------------------

/** Each league's figure by the eye's name for it. */
const LEAGUE_MEASURES: Record<string, string> = {
  strength: "strength", traffic: "traffic", mindshare: "aiMentions", shareOfVoice: "top3", links: "linkingWebsites",
  aiOverviews: "aiOverviews", recommended: "recommended", cited: "aiCitedPages", reviews: "reviews",
};
type LeagueRow = { name: string; place: number; value: number; you: boolean; before: number | null; placeBefore: number | null };
const leagueRows = (league: Row): LeagueRow[] => rowsOf(league.rows).filter((row) => named(row) && isNumber(row.place) && isNumber(row.value)).map((row) => ({
  name: named(row)!, place: row.place as number, value: row.value as number, you: row.you === true,
  before: isNumber(row.before) ? row.before : null, placeBefore: isNumber(row.placeBefore) ? row.placeBefore : null,
})).sort((a, b) => a.place - b.place);

/** The website against the league's leader, or — leading it — against the website in second place. */
export function leagueAgainst(league: Row, list: string, name: string | null, names: Row): OwnFound[] {
  const rows = leagueRows(league);
  const measure = LEAGUE_MEASURES[String(league.id)];
  const you = rows.find((row) => row.you);
  if (!measure || !you || rows.length < 2) return [];
  name ??= you.name;
  if (you.place === 1) {
    const second = rows[1];
    const label = filled(word(names, "below"), { name: second.name });
    return second.value > 0 && label && you.value !== second.value ? [setBeside(list, name, measure, you.value, second.value, 1 + Math.min(0.5, you.value / second.value - 1), label)] : [];
  }
  const leader = rows[0];
  const label = filled(word(names, "leader"), { name: leader.name });
  return leader.value > 0 && label ? [setBeside(list, name, measure, you.value, leader.value, 1 + Math.min(0.8, 1 - you.value / leader.value), label)] : [];
}

/**
 * Leaderboards: the main league where the website is furthest behind its leader (its headline), the league it leads by
 * most, the place nearest to climb, the league it comes last in, and — where a year before is held — a rival that climbed
 * past it and a league where it grew less than its leader.
 */
export function leaderboardsFindings(data: Row): OwnFound[] {
  const read = isRow(data.leagues) ? data.leagues : {};
  const names = namesOf(data);
  // Each league's title by its id, handed as a list: a league called "links" would be read as a page's plumbing (`pageData.ts`).
  const titles = new Map(rowsOf(names.leagues).filter((row) => typeof row.id === "string" && typeof row.title === "string").map((row) => [String(row.id), String(row.title)]));
  const leagues = rowsOf(read.leagues).filter((league) => typeof league.id === "string" && LEAGUE_MEASURES[String(league.id)] && titles.has(String(league.id)));
  const found: OwnFound[] = [];
  const titleOf = (league: Row) => titles.get(String(league.id))!;
  // Behind the leader: the main league furthest behind, by the share of the leader's figure the website holds.
  const behind = leagues.filter((league) => league.main === true).flatMap((league) => {
    const rows = leagueRows(league), you = rows.find((row) => row.you);
    return you && you.place > 1 && rows[0].value > 0 ? [{ league, gap: 1 - you.value / rows[0].value }] : [];
  }).sort((a, b) => b.gap - a.gap)[0];
  if (behind) found.push(...leagueAgainst(behind.league, "leaders", titleOf(behind.league), names).map((one) => ({ ...one, score: 2 + Math.min(0.5, behind.gap) })));
  // Ahead: the league the website leads by most, against the website in second.
  const ahead = leagues.flatMap((league) => {
    const rows = leagueRows(league), you = rows.find((row) => row.you);
    return you && you.place === 1 && rows[1] && rows[1].value > 0 ? [{ league, lead: you.value / rows[1].value - 1 }] : [];
  }).sort((a, b) => b.lead - a.lead)[0];
  if (ahead) found.push(...leagueAgainst(ahead.league, "lead", titleOf(ahead.league), names));
  // The nearest place to climb: the smallest gap to the website just above, as a share of the website's own figure.
  const climb = leagues.flatMap((league) => {
    const rows = leagueRows(league), you = rows.find((row) => row.you);
    const above = you && you.place > 1 ? rows.find((row) => row.place === you.place - 1) : undefined;
    return you && above && you.value > 0 && league !== behind?.league ? [{ league, you, above, gap: (above.value - you.value) / you.value }] : [];
  }).sort((a, b) => a.gap - b.gap)[0];
  const aboveLabel = climb ? filled(word(names, "above"), { name: climb.above.name }) : null;
  if (climb && aboveLabel && climb.gap <= 0.25) found.push(setBeside("climb", titleOf(climb.league), LEAGUE_MEASURES[String(climb.league.id)], climb.you.value, climb.above.value, 1.2 + Math.min(0.3, 0.25 - climb.gap), aboveLabel));
  // Last: a league the website comes last in, against the website just above.
  const last = leagues.flatMap((league) => {
    const rows = leagueRows(league), you = rows.find((row) => row.you);
    const above = you ? rows.find((row) => row.place === you.place - 1) : undefined;
    return you && above && rows.length >= 3 && you.place === rows.length && league !== behind?.league ? [{ league, you, above }] : [];
  })[0];
  const lastLabel = last ? filled(word(names, "above"), { name: last.above.name }) : null;
  if (last && lastLabel) found.push(setBeside("last", titleOf(last.league), LEAGUE_MEASURES[String(last.league.id)], last.you.value, last.above.value, 1, lastLabel));
  // A year before, where held: a rival that climbed past the website, and a leader that grew more than it did.
  for (const league of leagues) {
    const rows = leagueRows(league), you = rows.find((row) => row.you);
    if (!you || you.before === null || you.placeBefore === null) continue;
    const measure = LEAGUE_MEASURES[String(league.id)];
    const past = rows.find((row) => !row.you && row.placeBefore !== null && row.before !== null && row.placeBefore > you.placeBefore! && row.place < you.place);
    if (past) found.push(rivalMoved(`passed:${league.id}`, past.name, measure, past.value, past.before!, you.value, you.before, 1.5));
    const leader = rows[0];
    if (!leader.you && leader.before && you.before > 0 && changeOf(leader.value, leader.before) - changeOf(you.value, you.before) >= 0.1) found.push(rivalMoved(`grew:${league.id}`, leader.name, measure, leader.value, leader.before, you.value, you.before, 1.1));
  }
  return found;
}

/**
 * A league: the website against its leader, or the website in second when it leads (its headline); against the website
 * just above and the one just below; its share of the league's whole figure; and, where a year before is held, its growth
 * against the leader's and the rival gaining fastest.
 */
export function leagueFindings(data: Row): OwnFound[] {
  const league = isRow(data.league) ? data.league : {};
  const names = namesOf(data);
  const title = word(names, "title");
  const measure = LEAGUE_MEASURES[String(league.id)];
  const rows = leagueRows(league);
  const you = rows.find((row) => row.you);
  if (!title || !measure || !you) return [];
  // On a league's own page the website is the name: the page is the league.
  const found = leagueAgainst(league, "leader", null, names).map((one) => ({ ...one, score: 2 + one.score / 4 }));
  const above = rows.find((row) => row.place === you.place - 1);
  const aboveLabel = above ? filled(word(names, "above"), { name: above.name }) : null;
  if (above && aboveLabel && above !== rows[0] && above.value !== you.value) found.push(setBeside("above", you.name, measure, you.value, above.value, 1.3, aboveLabel));
  const below = rows.find((row) => row.place === you.place + 1);
  const belowLabel = below ? filled(word(names, "below"), { name: below.name }) : null;
  if (below && belowLabel && you.place > 1 && below.value !== you.value) found.push(setBeside("below", you.name, measure, you.value, below.value, 1, belowLabel));
  // Its share of everything the league's websites hold between them: a count only, as a score (strength) never adds up.
  const whole = rows.reduce((sum, row) => sum + row.value, 0);
  if (whole > 0 && rows.length >= 3 && unitOf(measure) === "count") found.push(partOf("share", you.name, measure, you.value, whole, 0.9));
  // A year before, where held.
  const leader = rows[0];
  if (you.before !== null && you.before > 0 && !leader.you && leader.before) found.push(rivalMoved("growth", leader.name, measure, leader.value, leader.before, you.value, you.before, 1.5));
  const fastest = rows.filter((row) => !row.you && row.before !== null && row.before > 0).sort((a, b) => changeOf(b.value, b.before!) - changeOf(a.value, a.before!))[0];
  if (fastest && you.before !== null && fastest !== leader && changeOf(fastest.value, fastest.before!) >= 0.1) found.push(rivalMoved("fastest", fastest.name, measure, fastest.value, fastest.before!, you.value, you.before, 1.2));
  return found;
}

// ---------------------------------------------------------------------------
// AI search
// ---------------------------------------------------------------------------

/**
 * AI search: the visits AI assistants sent over the last three months against a year before (its headline), their
 * enquiries beside; the assistant growing fastest and the one holding most; the assistant where the best rival is named
 * far more often than the website; and the kinds of page AI visitors land on whose share of their enquiries is far from
 * their share of their visits.
 */
export function aiSearchFindings(data: Row): OwnFound[] {
  const read = isRow(data.aiSearch) ? data.aiSearch : {};
  const names = namesOf(data);
  const found: OwnFound[] = [];
  const windows = isRow(read.windows) ? read.windows : {};
  const now = isRow(windows.now) ? windows.now : null;
  const then = isRow(windows.yearAgo) ? windows.yearAgo : isRow(windows.before) ? windows.before : null;
  const span = isRow(windows.yearAgo) ? "the same 3 months a year before" : "the 3 months before";
  const ai = word(names, "ai"), theirs = word(names, "theirEnquiries");
  let aiChange: number | null = null;
  if (now && then && ai && isNumber(now.visits) && isNumber(then.visits) && then.visits > 0) {
    aiChange = changeOf(now.visits, then.visits);
    const other = theirs && isNumber(now.enquiries) && isNumber(then.enquiries) && then.enquiries > 0 ? { name: theirs, change: changeOf(now.enquiries, then.enquiries) } : null;
    found.push(movedFrom("ai", ai, "visits", now.visits, then.visits, moveScore(2, now.visits, then.visits), span, other));
  }
  // Each assistant by name: the one growing fastest against a year before (else the 3 months before), and the one holding most.
  const assistants = rowsOf(read.assistants).filter((row) => named(row) && isNumber(row.now));
  const total = assistants.reduce((sum, row) => sum + (row.now as number), 0);
  const growth = assistants.flatMap((row) => {
    const base = isNumber(row.yearAgo) && row.yearAgo > 0 ? (row.yearAgo as number) : isNumber(row.before) && row.before > 0 ? (row.before as number) : null;
    return base !== null && (row.now as number) >= Math.max(20, total * 0.02) ? [{ name: named(row)!, now: row.now as number, then: base, span: isNumber(row.yearAgo) && row.yearAgo > 0 ? "the same 3 months a year before" : "the 3 months before" }] : [];
  });
  const fastest = [...growth].sort((a, b) => changeOf(b.now, b.then) - changeOf(a.now, a.then))[0];
  if (fastest && Math.abs(changeOf(fastest.now, fastest.then)) >= 0.1) found.push(movedFrom("assistants", fastest.name, "visits", fastest.now, fastest.then, moveScore(1.1, fastest.now, fastest.then), fastest.span, ai && aiChange !== null ? { name: ai, change: aiChange } : null));
  const slowest = [...growth].sort((a, b) => changeOf(a.now, a.then) - changeOf(b.now, b.then))[0];
  if (slowest && slowest !== fastest && changeOf(slowest.now, slowest.then) <= -0.1) found.push(movedFrom("assistantsDown", slowest.name, "visits", slowest.now, slowest.then, moveScore(0.9, slowest.now, slowest.then), slowest.span, ai && aiChange !== null ? { name: ai, change: aiChange } : null));
  const top = [...assistants].sort((a, b) => (b.now as number) - (a.now as number))[0];
  if (top && assistants.length >= 3 && total > 0 && (top.now as number) / total >= 0.4) found.push(partOf("assistantsShare", named(top)!, "aiVisits", top.now as number, total, 0.7 + Math.min(0.4, (top.now as number) / total - 0.4)));
  // Each AI engine's newest month: the share of its answers naming the website, against the best rival's on that engine.
  const engines = isRow(names.engines) ? names.engines : {};
  const sites = rowsOf(read.sites);
  const own = sites.find((row) => row.own === true);
  const ownMonths = own ? rowsOf(own.months) : [];
  const newest = ownMonths.reduce<string | null>((most, row) => (typeof row.month === "string" && (!most || row.month > most) ? row.month : most), null);
  const gaps = ownMonths.filter((row) => row.month === newest && isNumber(row.asked) && (row.asked as number) >= 5 && word(engines, String(row.engine))).flatMap((row) => {
    const asked = row.asked as number;
    const mine = rateOf(isNumber(row.named) ? row.named : 0, asked);
    const best = sites.filter((site) => site !== own && typeof site.host === "string").map((site) => ({ host: String(site.host), named: rowsOf(site.months).find((entry) => entry.month === newest && entry.engine === row.engine)?.named })).filter((one) => isNumber(one.named)).sort((a, b) => (b.named as number) - (a.named as number))[0];
    return best ? [{ engine: word(engines, String(row.engine))!, mine, rival: rateOf(best.named as number, asked), host: best.host }] : [];
  });
  const behind = gaps.filter((one) => one.rival - one.mine >= 10).sort((a, b) => (b.rival - b.mine) - (a.rival - a.mine))[0];
  if (behind) found.push(setBeside("engines", behind.engine, "namedSharePercent", behind.mine, behind.rival, 1.3 + Math.min(0.4, (behind.rival - behind.mine) / 100), behind.host));
  const leading = gaps.filter((one) => one.mine - one.rival >= 10).sort((a, b) => (b.mine - b.rival) - (a.mine - a.rival))[0];
  if (leading) found.push(setBeside("enginesLead", leading.engine, "namedSharePercent", leading.mine, leading.rival, 0.9, leading.host));
  // The kinds of page AI visitors land on: a share of their enquiries far from the share of their visits.
  const visitsShare = word(names, "visitsShare");
  const kinds = rowsOf(read.kinds).filter((row) => isNumber(row.visits) && isNumber(row.enquiries));
  if (visitsShare) {
    const sorted = kinds.filter(sortedKind).map((row) => ({ name: named(row)!, visits: row.visits as number, enquiries: row.enquiries as number }));
    const rest = { name: "", visits: kinds.reduce((sum, row) => sum + (row.visits as number), 0) - sorted.reduce((sum, row) => sum + row.visits, 0), enquiries: kinds.reduce((sum, row) => sum + (row.enquiries as number), 0) - sorted.reduce((sum, row) => sum + row.enquiries, 0) };
    for (const one of sharesApart([...sorted, rest], 20).filter((one) => one.row.name)) found.push(setBeside("kindShares", one.row.name, "enquiriesSharePercent", one.enquiriesShare, one.visitsShare, 1 + Math.min(0.4, one.weight / 100), visitsShare));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Cannibalisation, and a group
// ---------------------------------------------------------------------------

/**
 * Cannibalisation: the group whose recent enquiries fell most against the same three months a year before (its
 * headline), every group's beside; the group clicked far less (or more) for the times it is shown than the others; the
 * group holding most of the times shown; and the group whose recent enquiries rose most.
 */
export function cannibalisationFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const groups = rowsOf(data.groups).filter((row) => named(row) && isNumber(row.shown) && isNumber(row.clicks));
  const found: OwnFound[] = [];
  const recent = groups.filter((row) => isNumber(row.recent) && isNumber(row.recentBefore) && (row.recentBefore as number) > 0);
  const recentNow = recent.reduce((sum, row) => sum + (row.recent as number), 0), recentThen = recent.reduce((sum, row) => sum + (row.recentBefore as number), 0);
  const others = word(names, "otherGroups");
  const span = "the same 3 months a year before";
  const movers = biggestMoves(recent.map((row) => ({ name: named(row)!, now: row.recent as number, then: row.recentBefore as number })), 5, 0.1);
  const fell = movers.find((one) => one.now < one.then), rose = movers.find((one) => one.now > one.then);
  const groupsChange = recentThen > 0 ? changeOf(recentNow, recentThen) : null;
  const every = word(names, "everyGroup");
  const besideAll = every && groupsChange !== null ? { name: every, change: groupsChange } : null;
  if (fell) found.push(movedFrom("recent", fell.name, "enquiries", fell.now, fell.then, moveScore(2, fell.now, fell.then), span, besideAll));
  if (rose) found.push(movedFrom("recentUp", rose.name, "enquiries", rose.now, rose.then, moveScore(fell ? 1 : 2, rose.now, rose.then), span, besideAll));
  // Clicked for the times shown, against every other group together.
  const shown = groups.reduce((sum, row) => sum + (row.shown as number), 0), clicks = groups.reduce((sum, row) => sum + (row.clicks as number), 0);
  if (others && shown > 0) {
    const apart = groups.filter((row) => (row.shown as number) >= shown * 0.03 && shown - (row.shown as number) > 0).map((row) => {
      const ctr = rateOf(row.clicks as number, row.shown as number);
      const rest = rateOf(clicks - (row.clicks as number), shown - (row.shown as number));
      return { row, ctr, rest, ratio: rest > 0 ? ctr / rest : 1 };
    }).filter((one) => one.rest > 0 && (one.ratio <= 1 / 1.5 || one.ratio >= 1.5))
      .sort((a, b) => Math.abs(Math.log(b.ratio)) * Math.sqrt(b.row.shown as number) - Math.abs(Math.log(a.ratio)) * Math.sqrt(a.row.shown as number))[0];
    if (apart) found.push(setBeside("ctr", named(apart.row)!, "ctrPercent", apart.ctr, apart.rest, 1.3 + Math.min(0.4, Math.abs(Math.log(apart.ratio)) / 3), others));
  }
  // The group holding most of the times shown for competing searches.
  const top = [...groups].sort((a, b) => (b.shown as number) - (a.shown as number))[0];
  if (top && groups.length >= 3 && shown > 0 && (top.shown as number) / shown >= 0.15) found.push(partOf("shown", named(top)!, "impressions", top.shown as number, shown, 0.8 + Math.min(0.4, (top.shown as number) / shown - 0.15)));
  const most = [...recent].sort((a, b) => (b.recent as number) - (a.recent as number))[0];
  if (most && recent.length >= 3 && recentNow > 0 && (most.recent as number) / recentNow >= 0.15) found.push(partOf("enquiries", named(most)!, "enquiries", most.recent as number, recentNow, 0.85 + Math.min(0.4, (most.recent as number) / recentNow - 0.15)));
  return found;
}

/**
 * A group of competing pages: a page that isn't the owner taking the most clicks from Google (its headline), or bringing
 * more enquiries than the owner; the owner's share of the group's times shown; the page whose recent enquiries moved most
 * against a year before; and the group's own recent enquiries.
 */
export function cannibalisationGroupFindings(data: Row): OwnFound[] {
  const group = isRow(data.group) ? data.group : {};
  const names = namesOf(data);
  const pages = rowsOf(group.pages).filter((row) => typeof row.path === "string" && isNumber(row.clicks));
  const owner = pages.find((row) => row.path === group.owner);
  if (!owner) return [];
  const found: OwnFound[] = [];
  const ownerLabel = filled(word(names, "owner"), { page: String(owner.path) });
  const byClicks = [...pages].sort((a, b) => (b.clicks as number) - (a.clicks as number))[0];
  if (ownerLabel && byClicks && byClicks !== owner && (byClicks.clicks as number) > (owner.clicks as number)) found.push(setBeside("clicks", String(byClicks.path), "clicks", byClicks.clicks as number, owner.clicks as number, 2.2, ownerLabel));
  const byEnquiries = [...pages].filter((row) => isNumber(row.enquiries)).sort((a, b) => (b.enquiries as number) - (a.enquiries as number))[0];
  if (ownerLabel && byEnquiries && byEnquiries !== owner && (byEnquiries.enquiries as number) > (isNumber(owner.enquiries) ? owner.enquiries : 0)) found.push(setBeside("enquiries", String(byEnquiries.path), "enquiries", byEnquiries.enquiries as number, isNumber(owner.enquiries) ? owner.enquiries : 0, 1.9, ownerLabel));
  // The owner's share of the times Google showed the group's pages for these searches.
  const shown = pages.reduce((sum, row) => sum + (isNumber(row.shown) ? row.shown : 0), 0);
  if (isNumber(owner.shown) && shown > 0 && pages.length >= 2) found.push(partOf("shown", String(owner.path), "impressions", owner.shown, shown, 1 + Math.max(0, 0.5 - owner.shown / shown)));
  // The owner's share clicked for the times it is shown, against the group's other pages together.
  const otherPages = word(names, "otherPages");
  const othersShown = shown - (isNumber(owner.shown) ? owner.shown : 0), othersClicks = pages.reduce((sum, row) => sum + (row.clicks as number), 0) - (owner.clicks as number);
  if (otherPages && isNumber(owner.shown) && owner.shown > 0 && othersShown > 0 && othersClicks >= 0) {
    const mine = rateOf(owner.clicks as number, owner.shown), rest = rateOf(othersClicks, othersShown);
    if (rest > 0 && (mine / rest >= 1.5 || mine / rest <= 1 / 1.5)) found.push(setBeside("ctr", String(owner.path), "ctrPercent", mine, rest, 1.2, otherPages));
  }
  // The group's searches Google splits between its pages, of every search they share.
  const split = word(names, "splitSearches");
  if (split && isNumber(group.split) && isNumber(group.shared) && group.shared > 0 && group.split > 0) found.push(partOf("split", split, "searches", group.split, group.shared, 1 + Math.min(0.4, group.split / group.shared / 2)));
  // The page whose newest three months' enquiries moved most against the same three a year before.
  const movers = biggestMoves(pages.filter((row) => isNumber(row.recent) && isNumber(row.recentBefore)).map((row) => ({ name: String(row.path), now: row.recent as number, then: row.recentBefore as number })), 5, 0.1);
  if (movers[0]) found.push(movedFrom("pages", movers[0].name, "enquiries", movers[0].now, movers[0].then, moveScore(1.1, movers[0].now, movers[0].then), "the same 3 months a year before"));
  if (named(group) && isNumber(group.recent) && isNumber(group.recentBefore) && group.recentBefore > 0 && Math.abs(changeOf(group.recent, group.recentBefore)) >= 0.05) found.push(movedFrom("group", named(group)!, "enquiries", group.recent, group.recentBefore, moveScore(1.3, group.recent, group.recentBefore), "the same 3 months a year before"));
  return found;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/** Days of a window each side: the last 28 against the 28 before. */
const WINDOW_DAYS = 28;
/** A day whose visits for each click fell under this share of the usual day's, while its clicks held half a usual day's: a break. */
const BREAK_SHARE = 0.4;

/**
 * Measurement: Analytics' visits for every 100 Google clicks, the last 28 days against the 28 before (its headline) — a
 * tracking break shows here first; the visits themselves beside the clicks' change; and the day whose visits fell to near
 * nothing while Google's clicks held, against a usual day.
 */
export function measurementFindings(data: Row): OwnFound[] {
  const read = isRow(data.measurement) ? data.measurement : {};
  const names = namesOf(data);
  const days = rowsOf(read.byDay).filter((row) => typeof row.day === "string" && isNumber(row.clicks) && isNumber(row.visits)).sort((a, b) => String(a.day).localeCompare(String(b.day)));
  if (days.length < WINDOW_DAYS + 7) return [];
  const found: OwnFound[] = [];
  const last = days.slice(-WINDOW_DAYS), before = days.slice(-2 * WINDOW_DAYS, -WINDOW_DAYS);
  const sum = (rows: Row[], field: string) => rows.reduce((total, row) => total + (row[field] as number), 0);
  const window = word(names, "last28Days");
  const [clicksNow, clicksThen, visitsNow, visitsThen] = [sum(last, "clicks"), sum(before, "clicks"), sum(last, "visits"), sum(before, "visits")];
  if (window && clicksNow > 0 && clicksThen > 0) {
    const now = rateOf(visitsNow, clicksNow), then = rateOf(visitsThen, clicksThen);
    if (now !== then) found.push(movedFrom("ratio", window, "visitsPerHundredClicks", now, then, moveScore(2, now, then), "the 28 days before"));
  }
  const clicksName = word(names, "clicks");
  if (window && visitsThen > 0 && Math.abs(changeOf(visitsNow, visitsThen)) >= 0.02) found.push(movedFrom("visits", window, "visits", visitsNow, visitsThen, moveScore(1.2, visitsNow, visitsThen), "the 28 days before", clicksName && clicksThen > 0 ? { name: clicksName, change: changeOf(clicksNow, clicksThen) } : null));
  // A day whose visits fell to near nothing while Google's clicks held: against a usual day, its visits for each 100 clicks.
  const usual = word(names, "usualDay");
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const usualClicks = median(days.map((row) => row.clicks as number));
  const usualRatio = median(days.filter((row) => (row.clicks as number) > 0).map((row) => (row.visits as number) / (row.clicks as number)));
  if (usual && usualClicks > 0 && usualRatio > 0) {
    const broken = days.filter((row) => named(row) && (row.clicks as number) >= usualClicks / 2 && (row.visits as number) / (row.clicks as number) <= usualRatio * BREAK_SHARE)
      .sort((a, b) => (a.visits as number) / (a.clicks as number) - (b.visits as number) / (b.clicks as number));
    if (broken[0]) found.push(setBeside("days", named(broken[0])!, "visitsPerHundredClicks", rateOf(broken[0].visits as number, broken[0].clicks as number), 100 * usualRatio, 1.6 + Math.min(0.3, broken.length / 10), usual));
  }
  // Weekends against weekdays, visits for every 100 clicks over every day shown: a gap the two sources keep each week.
  const weekends = word(names, "weekends"), weekdays = word(names, "weekdays");
  const part = (weekend: boolean) => days.filter((row) => [0, 6].includes(new Date(`${String(row.day)}T12:00:00Z`).getUTCDay()) === weekend);
  const [atWeekends, onWeekdays] = [part(true), part(false)];
  if (weekends && weekdays && atWeekends.length >= 4 && onWeekdays.length >= 10 && sum(atWeekends, "clicks") > 0 && sum(onWeekdays, "clicks") > 0) {
    const end = rateOf(sum(atWeekends, "visits"), sum(atWeekends, "clicks")), week = rateOf(sum(onWeekdays, "visits"), sum(onWeekdays, "clicks"));
    if (Math.abs(end - week) / week >= 0.1) found.push(setBeside("weekends", weekends, "visitsPerHundredClicks", end, week, 0.9 + Math.min(0.3, Math.abs(end - week) / week), weekdays));
  }
  return found;
}

// ---------------------------------------------------------------------------
// Opportunities and the page plan
// ---------------------------------------------------------------------------

/**
 * Opportunities: the share of all the monthly searches sitting on opportunities whose page enquires less than the
 * whole website (its headline), one page carrying many of them, the kind of page holding most, and the biggest
 * opportunity's page against the website's enquiry rate.
 */
export function opportunitiesFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const sums = isRow(data.sums) ? data.sums : {};
  const plan = isRow(data.plan) && isRow(data.plan.plan) ? data.plan.plan : {};
  const found: OwnFound[] = [];
  const below = word(names, "belowRate");
  if (below && isNumber(sums.volume) && isNumber(sums.volumeBelow) && sums.volume > 0 && sums.volumeBelow > 0) found.push(partOf("belowRate", below, "volume", sums.volumeBelow, sums.volume, 2 + Math.min(0.5, sums.volumeBelow / sums.volume)));
  const count = isNumber(sums.count) ? sums.count : 0;
  const page = rowsOf(sums.pages).filter((row) => typeof row.page === "string" && isNumber(row.searches)).sort((a, b) => (b.searches as number) - (a.searches as number))[0];
  if (page && count >= 10 && (page.searches as number) >= 3 && (page.searches as number) / count >= 0.1) found.push(partOf("pages", String(page.page), "searches", page.searches as number, count, 1.2 + Math.min(0.4, (page.searches as number) / count)));
  const kind = rowsOf(sums.kinds).filter((row) => named(row) && isNumber(row.searches) && row.sorted !== false).sort((a, b) => (b.searches as number) - (a.searches as number))[0];
  if (kind && count >= 10 && (kind.searches as number) / count >= 0.2) found.push(partOf("kinds", named(kind)!, "searches", kind.searches as number, count, 1 + Math.min(0.3, (kind.searches as number) / count - 0.2)));
  // The biggest opportunity: its page's enquiry rate against the website's.
  const siteRate = percentOf(plan, "siteRate");
  const best = rowsOf(plan.opportunities).find((row) => typeof row.page === "string" && percentOf(row, "rate") !== null);
  if (best && siteRate !== null && siteRate > 0) {
    const rate = percentOf(best, "rate")!;
    if (Math.abs(rate - siteRate) >= RATE_POINTS) found.push(setBeside("best", String(best.page), "enquiryRatePercent", rate, siteRate, 1.1, null));
  }
  return found;
}

/**
 * The page plan: the kind of page with the most pages to merge, redirect or remove (its headline), the enquiries on the
 * pages to rebuild or restore against before, the share of visits on the pages to merge or remove, and the planned page
 * whose enquiries fell most.
 */
export function pagePlanFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const sums = isRow(data.sums) ? data.sums : {};
  const found: OwnFound[] = [];
  // The kind of page with the most pages to merge, redirect or remove; where the plan takes away too few to weigh, the
  // kind with the most pages it would change at all (to improve among them).
  const kinds = rowsOf(sums.kinds).filter((row) => named(row) && row.sorted !== false);
  const going = isNumber(sums.going) ? sums.going : 0, changing = isNumber(sums.changing) ? sums.changing : 0;
  const field = going >= 5 ? "going" : "changing";
  const whole = going >= 5 ? going : changing;
  const top = [...kinds].filter((row) => isNumber(row[field])).sort((a, b) => (b[field] as number) - (a[field] as number))[0];
  if (top && whole >= 5 && (top[field] as number) > 0) found.push(partOf("kinds", named(top)!, going >= 5 ? "pagesGoing" : "pagesToChange", top[field] as number, whole, 2 + Math.min(0.5, (top[field] as number) / whole)));
  const rebuild = word(names, "toRebuild");
  if (rebuild && isNumber(sums.rebuildEnquiries) && isNumber(sums.rebuildEnquiriesBefore) && sums.rebuildEnquiriesBefore > 0 && sums.rebuildEnquiries !== sums.rebuildEnquiriesBefore) found.push(movedFrom("rebuild", rebuild, "enquiries", sums.rebuildEnquiries, sums.rebuildEnquiriesBefore, moveScore(1.5, sums.rebuildEnquiries, sums.rebuildEnquiriesBefore), "what they, or the pages before them, brought in a year"));
  // The visits on the pages the plan takes away, or — where it takes away too few to weigh — on every page it would change.
  const goingName = word(names, going >= 5 ? "toMergeOrRemove" : "toChange");
  const atStake = going >= 5 ? sums.goingVisits : sums.changingVisits;
  if (goingName && isNumber(atStake) && isNumber(sums.visits) && sums.visits > 0 && atStake / sums.visits >= 0.01) found.push(partOf("goingVisits", goingName, "visits", atStake, sums.visits, 1.1 + Math.min(0.3, atStake / sums.visits)));
  // The planned page whose enquiries fell most, and the one that rose most.
  const plan = isRow(data.plan) && isRow(data.plan.plan) ? data.plan.plan : {};
  const movers = biggestMoves(rowsOf(plan.pages).filter((row) => typeof row.page === "string" && isNumber(row.enquiries) && isNumber(row.enquiriesBefore)).map((row) => ({ name: String(row.page), now: row.enquiries as number, then: row.enquiriesBefore as number })), 5, 0.2);
  for (const one of movers) found.push(movedFrom("pages", one.name, "enquiries", one.now, one.then, moveScore(0.9, one.now, one.then), "before"));
  return found;
}

// ---------------------------------------------------------------------------
// Page reviews, and a page's review
// ---------------------------------------------------------------------------

type Reviewed = { name: string; visits: number; enquiries: number; visitsBefore: number | null; enquiriesBefore: number | null; visits90: number | null; enquiries90: number | null };
const reviewedOf = (row: Row): Reviewed | null => (typeof row.page === "string" && isNumber(row.visits) && isNumber(row.enquiries) ? {
  name: row.page, visits: row.visits, enquiries: row.enquiries,
  visitsBefore: isNumber(row.visitsBefore) ? row.visitsBefore : null, enquiriesBefore: isNumber(row.enquiriesBefore) ? row.enquiriesBefore : null,
  visits90: isNumber(row.visits90) ? row.visits90 : null, enquiries90: isNumber(row.enquiries90) ? row.enquiries90 : null,
} : null);
const per = (visits: number, enquiries: number) => (enquiries > 0 ? visits / enquiries : null);

/**
 * Page reviews: the page whose visitors for one enquiry rose most against the 12 months before (its headline), the page
 * that lost most enquiries, the page holding most of the reviewed pages' enquiries, and the page whose last 90 days are
 * furthest from its 12 months.
 */
export function pageReviewsFindings(data: Row): OwnFound[] {
  const read = isRow(data.conversion) ? data.conversion : {};
  const names = namesOf(data);
  const pages = rowsOf(read.pages).map(reviewedOf).filter((row): row is Reviewed => row !== null);
  const found: OwnFound[] = [];
  const span = "the 12 months before";
  const perMoves = pages.flatMap((row) => {
    const now = per(row.visits, row.enquiries), then = row.visitsBefore !== null && row.enquiriesBefore !== null ? per(row.visitsBefore, row.enquiriesBefore) : null;
    return now !== null && then !== null && row.enquiries >= 5 && (row.enquiriesBefore ?? 0) >= 5 && Math.abs(changeOf(now, then)) >= 0.1 ? [{ row, now, then }] : [];
  });
  const harder = perMoves.filter((one) => one.now > one.then).sort((a, b) => changeOf(b.now, b.then) * Math.sqrt(b.row.visits) - changeOf(a.now, a.then) * Math.sqrt(a.row.visits))[0];
  const easier = perMoves.filter((one) => one.now < one.then).sort((a, b) => changeOf(a.now, a.then) * Math.sqrt(a.row.visits) - changeOf(b.now, b.then) * Math.sqrt(b.row.visits))[0];
  const headline = harder ?? easier;
  if (headline) found.push(movedFrom("perEnquiry", headline.row.name, "visitorsPerEnquiry", headline.now, headline.then, moveScore(2, headline.now, headline.then), span));
  if (harder && easier && headline === harder) found.push(movedFrom("perEnquiryDown", easier.row.name, "visitorsPerEnquiry", easier.now, easier.then, moveScore(0.9, easier.now, easier.then), span));
  const movers = biggestMoves(pages.filter((row) => row.enquiriesBefore !== null).map((row) => ({ name: row.name, now: row.enquiries, then: row.enquiriesBefore! })), 5, 0.1);
  const lost = movers.find((one) => one.now < one.then) ?? movers[0];
  if (lost) found.push(movedFrom("enquiries", lost.name, "enquiries", lost.now, lost.then, moveScore(1.3, lost.now, lost.then), span));
  const enquiries = pages.reduce((sum, row) => sum + row.enquiries, 0);
  const top = [...pages].sort((a, b) => b.enquiries - a.enquiries)[0];
  if (top && pages.length >= 3 && enquiries > 0 && top.enquiries / enquiries >= 0.4) found.push(partOf("share", top.name, "enquiries", top.enquiries, enquiries, 0.8));
  // The last 90 days against the 12 months: the page whose enquiry rate is furthest from its own year's.
  const year = word(names, "lastTwelveMonths");
  const recent = pages.flatMap((row) => (row.visits90 !== null && row.enquiries90 !== null && row.visits90 >= 50 && row.visits > 0 ? [{ row, now: rateOf(row.enquiries90, row.visits90), then: rateOf(row.enquiries, row.visits) }] : []))
    .filter((one) => Math.abs(one.now - one.then) >= RATE_POINTS).sort((a, b) => Math.abs(b.now - b.then) * Math.sqrt(b.row.visits90!) - Math.abs(a.now - a.then) * Math.sqrt(a.row.visits90!))[0];
  if (recent && year) found.push(setBeside("recent", recent.row.name, "enquiryRatePercent", recent.now, recent.then, 1.1, year));
  return found;
}

/**
 * A page's review: its visitors for one enquiry against the 12 months before (its headline), its enquiries and visits,
 * its last 90 days against its 12 months, its Google clicks and times shown against before, and the share of its
 * searches' monthly demand where a rival ranks above it.
 */
export function pageReviewFindings(data: Row): OwnFound[] {
  const review = isRow(data.review) ? reviewedOf(data.review) : null;
  const names = namesOf(data);
  if (!review) return [];
  const found: OwnFound[] = [];
  const span = "the 12 months before";
  const now = per(review.visits, review.enquiries), then = review.visitsBefore !== null && review.enquiriesBefore !== null ? per(review.visitsBefore, review.enquiriesBefore) : null;
  if (now !== null && then !== null && now !== then) found.push(movedFrom("perEnquiry", review.name, "visitorsPerEnquiry", now, then, moveScore(2, now, then), span));
  const visitsName = word(names, "visits");
  if (review.enquiriesBefore !== null && review.enquiriesBefore > 0 && review.enquiries !== review.enquiriesBefore) {
    found.push(movedFrom("enquiries", review.name, "enquiries", review.enquiries, review.enquiriesBefore, moveScore(1.3, review.enquiries, review.enquiriesBefore), span, visitsName && review.visitsBefore ? { name: visitsName, change: changeOf(review.visits, review.visitsBefore) } : null));
  }
  const recentName = word(names, "lastNinetyDays"), yearName = word(names, "lastTwelveMonths");
  if (recentName && yearName && review.visits90 !== null && review.enquiries90 !== null && review.visits90 > 0 && review.visits > 0) {
    const recent = rateOf(review.enquiries90, review.visits90), year = rateOf(review.enquiries, review.visits);
    if (Math.abs(recent - year) >= 2) found.push(setBeside("recent", recentName, "enquiryRatePercent", recent, year, 1.4, yearName));
  }
  // Its Google clicks and times shown, the last 12 months against the 12 before (its service's figures).
  const service = isRow(data.service) && isRow(data.service.service) ? data.service.service : {};
  const shownName = word(names, "shownOnGoogle");
  if (isNumber(service.clicks) && isNumber(service.clicksBefore) && service.clicksBefore > 0 && service.clicks !== service.clicksBefore) {
    found.push(movedFrom("clicks", review.name, "clicks", service.clicks, service.clicksBefore, moveScore(1, service.clicks, service.clicksBefore), span, shownName && isNumber(service.impressions) && isNumber(service.impressionsBefore) && service.impressionsBefore > 0 ? { name: shownName, change: changeOf(service.impressions, service.impressionsBefore) } : null));
  }
  // The searches that bring people to it: the share of their monthly searches where a rival ranks above it.
  const searches = isRow(data.service) ? rowsOf(data.service.searches).filter((row) => typeof row.keyword === "string" && isNumber(row.volume) && isNumber(row.position)) : [];
  const volume = searches.reduce((sum, row) => sum + (row.volume as number), 0);
  const above = searches.filter((row) => isNumber(row.rivalPosition) && (row.rivalPosition as number) < (row.position as number));
  const aboveVolume = above.reduce((sum, row) => sum + (row.volume as number), 0);
  const rivalAbove = word(names, "rivalAbove");
  if (rivalAbove && searches.length >= 3 && volume > 0 && aboveVolume > 0) found.push(partOf("rivals", rivalAbove, "volume", aboveVolume, volume, 1.2 + Math.min(0.4, aboveVolume / volume)));
  return found;
}

// ---------------------------------------------------------------------------
// The strategy
// ---------------------------------------------------------------------------

/**
 * The strategy: the service whose enquiries moved most against the 12 months before, every service's beside (its
 * headline); a service Google shows more often while its enquiries fell; the biggest shift in a service's share of
 * enquiries; and the service clicked far less for the times it is shown, and whose enquiry rate is furthest from the
 * other services'.
 */
export function strategyFindings(data: Row): OwnFound[] {
  const read = isRow(data.strategy) ? data.strategy : {};
  const names = namesOf(data);
  type Service = { name: string; enquiries: number; enquiriesBefore: number | null; clicks: number | null; clicksBefore: number | null; shown: number | null; shownBefore: number | null; visits: number | null };
  const services: Service[] = rowsOf(read.services).filter((row) => named(row) && isNumber(row.enquiries)).map((row) => ({
    name: named(row)!, enquiries: row.enquiries as number, enquiriesBefore: isNumber(row.enquiriesBefore) ? row.enquiriesBefore : null,
    clicks: isNumber(row.clicks) ? row.clicks : null, clicksBefore: isNumber(row.clicksBefore) ? row.clicksBefore : null,
    shown: isNumber(row.impressions) ? row.impressions : null, shownBefore: isNumber(row.impressionsBefore) ? row.impressionsBefore : null,
    visits: isNumber(row.visits) ? row.visits : null,
  }));
  const found: OwnFound[] = [];
  const span = "the 12 months before";
  const held = services.filter((row) => row.enquiriesBefore !== null && row.enquiriesBefore > 0);
  const total = held.reduce((sum, row) => sum + row.enquiries, 0), totalBefore = held.reduce((sum, row) => sum + row.enquiriesBefore!, 0);
  const every = word(names, "everyService");
  const all = every && totalBefore > 0 ? { name: every, change: changeOf(total, totalBefore) } : null;
  const top = biggestMoves(held.map((row) => ({ name: row.name, now: row.enquiries, then: row.enquiriesBefore! })), 5, 0.05)[0];
  if (top) found.push(movedFrom("services", top.name, "enquiries", top.now, top.then, moveScore(2, top.now, top.then), span, all));
  // Shown more often by Google while its enquiries fell.
  const shownName = word(names, "shownOnGoogle");
  const shownMore = held.filter((row) => row.shown !== null && row.shownBefore !== null && row.shownBefore > 0 && changeOf(row.shown, row.shownBefore) >= 0.1 && changeOf(row.enquiries, row.enquiriesBefore!) <= -0.05)
    .sort((a, b) => (b.enquiriesBefore! - b.enquiries) - (a.enquiriesBefore! - a.enquiries))[0];
  if (shownMore && shownName) found.push(movedFrom("shownMore", shownMore.name, "enquiries", shownMore.enquiries, shownMore.enquiriesBefore!, 1.8, span, { name: shownName, change: changeOf(shownMore.shown!, shownMore.shownBefore!) }));
  // The service whose Google clicks moved most, its times shown beside.
  const clicked = biggestMoves(services.filter((row) => row.clicks !== null && row.clicksBefore !== null).map((row) => ({ name: row.name, now: row.clicks!, then: row.clicksBefore! })), 20, 0.1)[0];
  const clickedRow = clicked ? services.find((row) => row.name === clicked.name) : undefined;
  if (clicked && clickedRow && shownName) found.push(movedFrom("clicks", clicked.name, "clicks", clicked.now, clicked.then, moveScore(1, clicked.now, clicked.then), span, clickedRow.shown !== null && clickedRow.shownBefore ? { name: shownName, change: changeOf(clickedRow.shown, clickedRow.shownBefore) } : null));
  // The biggest shift in a service's share of every service's enquiries.
  if (total > 0 && totalBefore > 0 && held.length >= 2) {
    const shift = held.map((row) => ({ row, share: rateOf(row.enquiries, total), before: rateOf(row.enquiriesBefore!, totalBefore) })).filter((one) => Math.abs(one.share - one.before) >= 3)
      .sort((a, b) => Math.abs(b.share - b.before) - Math.abs(a.share - a.before))[0];
    if (shift) found.push(shareFrom("shares", shift.row.name, "enquiries", shift.share, shift.before, 1.3 + Math.min(0.4, Math.abs(shift.share - shift.before) / 50), span));
  }
  // Clicked for the times shown, and enquiring for the visits, against every other service together.
  const others = word(names, "otherServices");
  if (others && services.length >= 2) {
    const shown = services.reduce((sum, row) => sum + (row.shown ?? 0), 0), clicks = services.reduce((sum, row) => sum + (row.clicks ?? 0), 0);
    const ctr = services.filter((row) => row.shown !== null && row.clicks !== null && row.shown >= 1000 && shown - row.shown > 0).map((row) => {
      const mine = rateOf(row.clicks!, row.shown!), rest = rateOf(clicks - row.clicks!, shown - row.shown!);
      return { row, mine, rest };
    }).filter((one) => one.rest > 0 && (one.mine / one.rest <= 1 / 1.5 || one.mine / one.rest >= 1.5)).sort((a, b) => Math.abs(Math.log(b.mine / b.rest)) - Math.abs(Math.log(a.mine / a.rest)))[0];
    if (ctr) found.push(setBeside("ctr", ctr.row.name, "ctrPercent", ctr.mine, ctr.rest, 1.1, others));
    const visits = services.reduce((sum, row) => sum + (row.visits ?? 0), 0), enquiries = services.reduce((sum, row) => sum + row.enquiries, 0);
    const rated = services.filter((row) => row.visits !== null && row.visits >= 100 && visits - row.visits > 0).map((row) => ({ row, mine: rateOf(row.enquiries, row.visits!), rest: rateOf(enquiries - row.enquiries, visits - row.visits!) }))
      .filter((one) => one.rest > 0 && Math.abs(one.mine - one.rest) >= RATE_POINTS && (one.mine / one.rest <= 1 / 1.5 || one.mine / one.rest >= 1.5))
      .sort((a, b) => Math.abs(b.mine - b.rest) * Math.sqrt(b.row.visits!) - Math.abs(a.mine - a.rest) * Math.sqrt(a.row.visits!))[0];
    if (rated) found.push(setBeside("rate", rated.row.name, "enquiryRatePercent", rated.mine, rated.rest, 1.2, others));
  }
  return found;
}
