import { pageName } from "../../pageNames";
import { isShopPage } from "../../shopPages";
import { viewsCountedDifferently } from "../../viewsCounted";
import { couldBeChance } from "../../insightEditor";
import { pathOfAddress } from "../analytics";
import { MEASURES, measureWords } from "../measures";
import { apartFrom, firstOfEachList, isNumber, isRow, moved, named, partOf, round1, rowsOf, type OwnFound, type Row } from "./shared";

/** Google Analytics' pages with rules of their own (ask-hakken-every-chart-page-plan-2026-11-03.md, section 5). */

// ---------------------------------------------------------------------------
// Visits
// ---------------------------------------------------------------------------

/**
 * Visits' rules pick the biggest things on the page for whatever dates are chosen, never only what passes a bar set from
 * one month (Anthony, 2026-11-03, on Last 3 months, where the old bars found two things: "we have a date selection picker
 * FFS"). The figures below only keep out what is too small to trust; `pageFindings.test.ts` holds them to every period
 * the date menu offers, on More Handles' own figures.
 */
/** A change too small to be news: under this share of the span before. */
const LEAST_CHANGE = 0.02;
/** A group too small to trust: fewer visits than this, or under this share of its list. */
const GROUP_LEAST = 100;
const GROUP_SHARE = 0.05;
/** A group's move worth saying: this share of the span before and this many visits. */
const GROUP_MOVE = 0.05;
/** A group leaving at once this many points more or less than its reference. */
const LEFT_POINTS = 3;
/**
 * A weekend day this far under a weekday, in visits a day, is worth saying (Anthony's Visits eye, 2026-11-03: the writer
 * spotted More Handles' returning visits halving at weekends, which code had not found); on this many days of each.
 */
const WEEKEND_DIP = 0.15;
const WEEKEND_DAYS = 4;
const WEEK_DAYS = 10;
/**
 * The lists a group's move is weighed in: ages, genders and systems (iPhones against Android); never browsers, whose
 * moves are the market's, not the shop's ("is chrome stats the best you can come up with").
 */
const MOVE_LISTS = ["age", "gender", "system"];
/** The lists a group's leaving at once is weighed in, each against the whole website; new against returning directly. */
const LEFT_LISTS = ["browser", "system", "age", "gender"];
/** The groups said at most, of their moves and of their leaving at once: the biggest, from different lists. */
const MOST_GROUPS = 2;

function visitsFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const groups = isRow(data.visitorGroups) ? data.visitorGroups : {};
  const changeOf = (row: Row) => ((row.visits as number) - (row.visitsBefore as number)) / (row.visitsBefore as number);

  // The whole website's visits against the span before, the page's first box: always, past a change too small to be news.
  const whole = isRow(data.visits) ? data.visits : null;
  if (whole && isNumber(whole.visits) && isNumber(whole.visitsBefore) && whole.visitsBefore > 0 && Math.abs(changeOf(whole)) >= LEAST_CHANGE) {
    found.push(moved("whole", typeof whole.name === "string" ? whole.name : "The whole website", "visits", whole.visits, whole.visitsBefore, 1.3));
  }

  // New against returning: the one that moved more, said against the other ("Returning: visits down 7.5%… New: down 0.9%").
  const types = rowsOf(groups.visitorType).filter((row) => named(row) && isNumber(row.visits) && isNumber(row.visitsBefore) && (row.visitsBefore as number) > 0);
  if (types.length === 2) {
    const [big, small] = [...types].sort((left, right) => Math.abs(changeOf(right)) - Math.abs(changeOf(left)));
    if (Math.abs(changeOf(big)) >= LEAST_CHANGE) {
      found.push(moved("visitorType", named(big)!, "visits", big.visits as number, big.visitsBefore as number, 1.4, { name: named(small)!, change: changeOf(small) }));
    }
  }

  // The groups that moved most, weighed by the visits they gained or lost: the biggest from each of two lists.
  const moves = MOVE_LISTS.flatMap((list) => {
    const rows = rowsOf(groups[list]).filter((row) => named(row) && isNumber(row.visits));
    const total = rows.reduce((sum, row) => sum + (row.visits as number), 0);
    return rows
      .filter((row) => isNumber(row.visitsBefore) && (row.visitsBefore as number) > 0 && (row.visits as number) >= Math.max(GROUP_LEAST, total * GROUP_SHARE))
      .filter((row) => Math.abs(changeOf(row)) >= GROUP_MOVE)
      .map((row) => ({ list, row, weight: Math.abs((row.visits as number) - (row.visitsBefore as number)) * Math.min(1, Math.abs(changeOf(row)) * 5) }));
  }).sort((left, right) => right.weight - left.weight);
  for (const one of firstOfEachList(moves, MOST_GROUPS)) {
    found.push(moved(one.list, named(one.row)!, "visits", one.row.visits as number, one.row.visitsBefore as number, 0.8 + Math.min(0.6, Math.abs(changeOf(one.row)))));
  }

  // Leaving at once: new against returning, then the groups furthest from every visit Google placed in their list.
  const leftOf = (row: Row) => 100 * (1 - (row.engaged as number) / (row.visits as number));
  const placed = (list: string) => rowsOf(groups[list]).filter((row) => named(row) && isNumber(row.visits) && isNumber(row.engaged) && (row.visits as number) > 0);
  const typeRows = placed("visitorType").filter((row) => (row.visits as number) >= GROUP_LEAST);
  if (typeRows.length === 2) {
    const [worse, better] = [...typeRows].sort((left, right) => leftOf(right) - leftOf(left));
    const gap = leftOf(worse) - leftOf(better);
    if (gap >= LEFT_POINTS) found.push(apartFrom("visitorType", named(worse)!, "bounceRatePercent", leftOf(worse), leftOf(better), 1.1 + Math.min(0.4, gap / 30), named(better)));
  }
  const gaps = LEFT_LISTS.flatMap((list) => {
    const rows = placed(list);
    const visits = rows.reduce((sum, row) => sum + (row.visits as number), 0);
    const engaged = rows.reduce((sum, row) => sum + (row.engaged as number), 0);
    if (rows.length < 2 || visits <= 0) return [];
    const site = 100 * (1 - engaged / visits);
    return rows
      .filter((row) => (row.visits as number) >= Math.max(GROUP_LEAST, visits * GROUP_SHARE))
      .map((row) => ({ list, row, site, gap: leftOf(row) - site }))
      .filter((one) => Math.abs(one.gap) >= LEFT_POINTS)
      .map((one) => ({ ...one, weight: Math.abs(one.gap) * Math.sqrt(one.row.visits as number) }));
  }).sort((left, right) => right.weight - left.weight);
  for (const one of firstOfEachList(gaps, MOST_GROUPS)) {
    found.push(apartFrom(one.list, named(one.row)!, "bounceRatePercent", leftOf(one.row), one.site, 0.7 + Math.min(0.5, Math.abs(one.gap) / 30), null));
  }

  // Pages not sorted yet are Hakken's own housekeeping, never news for the reader: no rule speaks of them (Anthony,
  // 2026-11-03, on the Visits eye: "this is really poor from the ai"; the writer read them as pages people land on).
  const weekend = weekendOf(data);
  if (weekend) found.push(weekend);
  return found;
}

/**
 * New or returning visits at weekends against weekdays, a day's visits, from the daily line (`days`, handed by date with
 * the screen's own names): the one that dips most, where it dips a quarter or more, said beside the other's own dip.
 */
function weekendOf(data: Row): OwnFound | null {
  const days = isRow(data.days) && isRow(data.days.byDay) ? (data.days.byDay as Row) : null;
  if (!days) return null;
  const names = data.days as Row;
  type Type = "returning" | "new";
  const sums = { weekend: { days: 0, new: 0, returning: 0 }, weekday: { days: 0, new: 0, returning: 0 } };
  for (const [day, figures] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isRow(figures) || !isNumber(figures.new) || !isNumber(figures.returning)) continue;
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    const part = weekday === 0 || weekday === 6 ? sums.weekend : sums.weekday;
    part.days += 1;
    part.new += figures.new;
    part.returning += figures.returning;
  }
  if (sums.weekend.days < WEEKEND_DAYS || sums.weekday.days < WEEK_DAYS) return null;
  const aDay = (type: Type, part: "weekend" | "weekday") => sums[part][type] / sums[part].days;
  const dipOf = (type: Type) => (aDay(type, "weekday") > 0 ? 1 - aDay(type, "weekend") / aDay(type, "weekday") : 0);
  const [type, other] = dipOf("returning") >= dipOf("new") ? (["returning", "new"] as const) : (["new", "returning"] as const);
  const dip = dipOf(type);
  if (dip < WEEKEND_DIP) return null;
  const text = (field: string, fallback: string) => (typeof names[field] === "string" && (names[field] as string).trim() ? (names[field] as string) : fallback);
  // "Returning at weekends: 218 visits a day. On weekdays: 368." — the screen's own words, in the reader's language.
  const name = `${text(`${type}Name`, type === "new" ? "New" : "Returning")} ${text("weekendName", "at weekends")}`;
  const weekdays = text("weekdayName", "On weekdays");
  const value = Math.round(aDay(type, "weekend"));
  const mean = Math.round(aDay(type, "weekday"));
  const otherName = text(`${other}Name`, other === "new" ? "New" : "Returning");
  return {
    id: `rowBelow:weekend:visitsADay:${type}`, kind: "rowBelow", list: "weekend", score: 0.9 + Math.min(0.5, dip - WEEKEND_DIP),
    params: { name, measure: "visitsADay", value, mean, against: "other", other: weekdays },
    facts: [
      { key: "value", value, unit: "count", label: `${name}: visits a day` },
      { key: "mean", value: mean, unit: "count", label: `${text(`${type}Name`, type)}, ${weekdays}: visits a day` },
      { key: "dip", value: round1(dip * 100), unit: "percent", label: `how much fewer ${text(`${type}Name`, type)} visits a weekend day has than a weekday` },
      { key: "otherDip", value: round1(Math.max(0, dipOf(other)) * 100), unit: "percent", label: `how much fewer ${otherName} visits a weekend day has than a weekday` },
    ],
  };
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/** Products put in a basket and never bought, worth saying from this share of the products added. */
const NEVER_BOUGHT_SHARE = 0.25;
/** A product left in baskets this many points more than the others listed, with this many items added or this share. */
const LEFT_IN_BASKET_POINTS = 15;
const LEFT_IN_BASKET_LEAST = 50;
const LEFT_IN_BASKET_SHARE = 0.02;

function productsFindings(data: Row): OwnFound[] {
  const found: OwnFound[] = [];
  const boxes = isRow(data.boxes) ? data.boxes : {};

  // The step the shop loses most at: of the visits that reached it, the share that went on to the sale, against the
  // span before ("26% of visits with Added to basket went on to Bought, against 30% before").
  const sale = typeof boxes.sale === "string" ? boxes.sale : null;
  const bought = isNumber(boxes.visitsThatBought) ? boxes.visitsThatBought : null;
  const boughtBefore = isNumber(boxes.visitsThatBoughtBefore) ? boxes.visitsThatBoughtBefore : null;
  if (sale && bought !== null) {
    const steps = rowsOf(data.steps)
      .filter((row) => named(row) && named(row) !== sale && isNumber(row.visits) && (row.visits as number) > bought)
      .map((row) => {
        const wentOn = (100 * bought) / (row.visits as number);
        const before = boughtBefore !== null && isNumber(row.visitsBefore) && (row.visitsBefore as number) > 0 ? (100 * boughtBefore) / (row.visitsBefore as number) : null;
        return { row, wentOn, before };
      })
      .sort((left, right) => left.wentOn - right.wentOn);
    const worst = steps[0];
    if (worst) {
      const name = named(worst.row)!;
      const fell = worst.before !== null ? worst.before - worst.wentOn : 0;
      found.push({
        id: `step:steps:${name}:${sale}`, kind: "step", list: "steps", score: 1.3 + Math.max(0, Math.min(0.5, fell / 10)),
        params: { from: name, to: sale, wentOn: round1(worst.wentOn), ...(worst.before !== null ? { wentOnBefore: round1(worst.before) } : {}) },
        facts: [
          { key: "wentOn", value: round1(worst.wentOn), unit: "percent", label: `Of the visits with ${name}, the share that went on to ${sale}` },
          ...(worst.before !== null ? [{ key: "before", value: round1(worst.before), unit: "percent" as const, label: `The same, the span before` }] : []),
        ],
      });
    }
  }

  // Products put in a basket and never bought, of every product put in one.
  const never = isNumber(boxes.productsNeverBought) ? boxes.productsNeverBought : null;
  const added = isNumber(boxes.productsAdded) ? boxes.productsAdded : null;
  const neverName = typeof boxes.neverBoughtName === "string" ? boxes.neverBoughtName : "Added but never bought";
  if (never !== null && added !== null && added > 0 && never / added >= NEVER_BOUGHT_SHARE) {
    found.push(partOf("boxes", neverName, "productsAdded", never, added, 0.9 + Math.min(0.4, never / added - NEVER_BOUGHT_SHARE)));
  }

  // A product people put in their basket and leave far more often than the other products listed: the one where most
  // of the items added stayed there, against the rest of the table on screen.
  const table = isRow(data.productsTable) ? data.productsTable : {};
  const products = rowsOf(table).filter((row) => named(row) && isNumber(row.itemsAdded) && isNumber(row.itemsLeft) && (row.itemsAdded as number) > 0);
  const addedAll = products.reduce((sum, row) => sum + (row.itemsAdded as number), 0);
  const leftAll = products.reduce((sum, row) => sum + (row.itemsLeft as number), 0);
  if (products.length >= 3 && addedAll > 0) {
    const others = typeof table.othersName === "string" ? table.othersName : "The other products listed";
    const leftOf = (row: Row) => (100 * (row.itemsLeft as number)) / (row.itemsAdded as number);
    const worst = products
      .filter((row) => (row.itemsAdded as number) >= Math.max(LEFT_IN_BASKET_LEAST, addedAll * LEFT_IN_BASKET_SHARE))
      .map((row) => {
        const restAdded = addedAll - (row.itemsAdded as number);
        const rest = restAdded > 0 ? (100 * (leftAll - (row.itemsLeft as number))) / restAdded : null;
        return { row, left: leftOf(row), rest };
      })
      .filter((one): one is { row: Row; left: number; rest: number } => one.rest !== null && one.left - one.rest >= LEFT_IN_BASKET_POINTS)
      .sort((left, right) => (right.left - right.rest) * (right.row.itemsAdded as number) - (left.left - left.rest) * (left.row.itemsAdded as number))[0];
    if (worst) found.push(apartFrom("productsTable", named(worst.row)!, "leftInBasketPercent", worst.left, worst.rest, 1.1 + Math.min(0.4, (worst.left - worst.rest) / 50), others));
  }
  return found;
}

// ---------------------------------------------------------------------------
// The section's other pages (ask-hakken-every-chart-page-plan-2026-11-03.md, section 5; built 2026-11-04)
// ---------------------------------------------------------------------------

/**
 * Each page's own rules pick the biggest things on it for whatever dates are chosen: its headline against the span
 * before, the rows that moved most, and the rows furthest from their reference (the whole website, the channel, every
 * campaign, the square). The bars below only keep out what is too small to trust. Google Analytics' lists count
 * conversions as times, not visits, so a list's rate can pass 100%: said as conversions for every 100 visits, never a
 * percentage (section 5). Never money (decision 1, Anthony, 2026-11-03: "Take money off"). `googleAnalyticsPeriods.test.ts`
 * holds every page to every period the date menu offers, on More Handles' own figures.
 */
/** A row's rate set apart from its reference by this much, either way, on enough visits to trust. */
const RATE_APART = 1.3;
/** A row leaving at once this many points more or less than its reference. */
const LEFT_APART_POINTS = 5;
/** A row's conversions moving this share of the span before, this far from its visits' own move, by this many. */
const CONVERSIONS_MOVE = 0.25;
const CONVERSIONS_GAP = 0.2;
const CONVERSIONS_LEAST = 10;
/** The few rows said to explain a fall: at most this many, holding at least this share of it. */
const EXPLAIN_ROWS = 3;
const EXPLAIN_SHARE = 0.3;
/** A group's share moved this many points, to be said. */
const SHARE_POINTS = 1.5;
/** A page's share of people or views this many points from the whole website's, to be said. */
const SHARE_APART_POINTS = 3;
/** Pages Hakken has still to sort, the pages of no group and the rest: its housekeeping, never a name in a finding. */
const HOUSEKEEPING = new Set(["NOT_SORTED", "NO_PAGE", "OTHER"]);

type Names = Record<string, string>;
/** The reader's words the page hands for the names its findings use (`googleAnalytics.eyeNames`), else English. */
const namesOf = (data: Row): Names => (isRow(data.names) ? Object.fromEntries(Object.entries(data.names).filter((one): one is [string, string] => typeof one[1] === "string" && one[1].trim() !== "")) : {});
const nameIn = (names: Names, key: string, fallback: string) => names[key] ?? fallback;
const sumOf = (rows: readonly Row[], field: string) => rows.reduce((total, row) => total + (isNumber(row[field]) ? (row[field] as number) : 0), 0);
const changeOf = (now: number, before: number | null) => (before !== null && before > 0 ? (now - before) / before : null);
const perHundred = (conversions: number, visits: number) => (visits > 0 ? (100 * conversions) / visits : null);

/** A list row's visits the span before: kept, or worked back from its change (`changePercent`, as `pageData.ts` hands it). */
function visitsBeforeOf(row: Row): number | null {
  if (isNumber(row.visitsBefore)) return row.visitsBefore;
  if (isNumber(row.changePercent) && isNumber(row.visits) && row.changePercent > -100) return Math.round(row.visits / (1 + row.changePercent / 100));
  return null;
}

/** A row's name as the screen shows it: its own name, its title, else its path; never a code or Hakken's housekeeping. */
function rowNameOf(row: Row): string | null {
  if (typeof row.key === "string" && HOUSEKEEPING.has(row.key)) return null;
  const own = named(row);
  if (own) return /^\d{6,}$/.test(own) ? null : own;
  for (const field of ["title", "label", "address", "path"]) {
    const value = row[field];
    // Never Google's stand-in for no name, a code, a page's number, or a campaign kept by its number ("52536031490414").
    if (typeof value !== "string" || !value.trim() || /^\(.*\)$/.test(value.trim()) || /^[A-Z][A-Z0-9_]+$/.test(value.trim()) || /^~[0-9a-z]+$/.test(value.trim()) || /^\d{6,}$/.test(value.trim())) continue;
    return field === "label" || field === "address" ? pathOfAddress(value.trim()) : value.trim().slice(0, 80);
  }
  return null;
}

/** The rows a list's rules weigh: named, with this many visits and this share of the list's. */
function trustedRows(rows: readonly Row[], least = GROUP_LEAST): Array<{ row: Row; name: string; visits: number }> {
  const named = rows.flatMap((row) => {
    const name = rowNameOf(row);
    return name && isNumber(row.visits) && (row.visits as number) > 0 ? [{ row, name, visits: row.visits as number }] : [];
  });
  const total = named.reduce((sum, one) => sum + one.visits, 0);
  return named.filter((one) => one.visits >= Math.max(least, total * 0.02));
}

/** A figure beside its reference: the whole website's, or another's by its name. */
function beside(list: string, name: string, measure: string, value: number, mean: number, score: number, other: string | null, against: "website" | "group" = "website"): OwnFound {
  const kind = value > mean ? "rowAbove" : "rowBelow";
  const words = measureWords(measure);
  const unit = MEASURES[measure]?.kind === "percent" ? "percent" as const : MEASURES[measure]?.kind === "count" ? "count" as const : "score" as const;
  return {
    id: `${kind}:${list}:${measure}:${name}`, kind, list, score,
    params: { name, measure, value: round1(value), mean: round1(mean), against: other === null ? against : "other", ...(other !== null ? { other } : {}), ...(MEASURES[measure]?.lessIsBetter ? { lessIsBetter: 1 } : {}) },
    facts: [
      { key: "value", value: round1(value), unit, label: `${name}: ${words}` },
      { key: "mean", value: round1(mean), unit, label: `${other ?? (against === "group" ? "similar pages" : "the whole website")}: ${words}` },
    ],
  };
}

/** A rate or a share now against the span before: its facts in its own unit, its size as a share of the span before. */
function rateMoved(list: string, name: string, measure: string, now: number, before: number, score: number, other?: { name: string; change: number }): OwnFound {
  const found = moved(list, name, measure, round1(now), round1(before), score, other);
  const unit = MEASURES[measure]?.kind === "percent" ? "percent" as const : "score" as const;
  return { ...found, facts: found.facts.map((fact) => (fact.key === "change" ? fact : { ...fact, unit })) };
}

/** A share of a whole now against the span before, in points: "New: 68% of all the visits, from 65.4%". */
function shareMovedOf(list: string, name: string, measure: string, share: number, shareBefore: number, score: number): OwnFound {
  const words = measureWords(measure);
  return {
    id: `shareMoved:${list}:${measure}:${name}`, kind: "shareMoved", list, score,
    params: { name, measure, share: round1(share), shareBefore: round1(shareBefore) },
    facts: [
      { key: "share", value: round1(share), unit: "percent", label: `${name}: its share of all the ${words}` },
      { key: "shareBefore", value: round1(shareBefore), unit: "percent", label: `${name}: its share of all the ${words}, the span before` },
    ],
  };
}

/** The whole's visits now against the span before: the page's headline, said whatever its size, with another figure's move. */
function headline(list: string, name: string, measure: string, now: unknown, before: unknown, other?: { name: string; now: unknown; before: unknown }): OwnFound | null {
  if (!isNumber(now) || !isNumber(before) || before <= 0) return null;
  const otherChange = other && isNumber(other.now) && isNumber(other.before) ? changeOf(other.now, other.before) : null;
  const change = Math.abs((now - before) / before);
  return moved(list, name, measure, now, before, 1.3 + Math.min(0.5, change), other && otherChange !== null ? { name: other.name, change: otherChange } : undefined);
}

/**
 * The rows whose visits moved most, the biggest gain and the biggest loss, each set beside its reference's own move (the
 * whole website's, the channel's): a row moving with the whole is no news.
 */
function visitMovers(list: string, rows: readonly Row[], reference: { name: string; change: number | null } | null, measure = "visits", least = GROUP_LEAST): OwnFound[] {
  const listed = trustedRows(rows, least);
  const total = listed.reduce((sum, one) => sum + one.visits, 0);
  const moves = listed.flatMap((one) => {
    const now = measure === "visits" ? one.visits : (one.row[measure] as number);
    const before = measure === "visits" ? visitsBeforeOf(one.row) : isNumber(one.row[`${measure}Before`]) ? (one.row[`${measure}Before`] as number) : null;
    // A row with next to nothing the span before is new, not a mover: "up 22,200%, from 1" says nothing a reader can use.
    if (!isNumber(now) || before === null || before < Math.max(least / 5, now * 0.05)) return [];
    const change = (now - before) / before;
    if (Math.abs(change) < GROUP_MOVE || (reference?.change !== null && reference?.change !== undefined && Math.abs(change - reference.change) < GROUP_MOVE)) return [];
    return [{ ...one, now, before, change, weight: Math.abs(now - before) * Math.min(1, Math.abs(change) * 5) }];
  });
  const out: OwnFound[] = [];
  for (const way of [1, -1]) {
    const best = moves.filter((one) => one.change * way > 0).sort((left, right) => right.weight - left.weight)[0];
    if (!best) continue;
    const other = reference && reference.change !== null ? { name: reference.name, change: reference.change } : undefined;
    out.push(moved(list, best.name, measure, best.now, best.before, 0.8 + Math.min(0.5, Math.abs(best.change)) + Math.min(0.3, total > 0 ? Math.abs(best.now - best.before) / total : 0), other));
  }
  return out;
}

/** The rows furthest above and below their reference in conversions for every 100 visits, weighed by their visits. */
function perHundredApart(list: string, rows: readonly Row[], mean: number | null, other: string | null): OwnFound[] {
  if (mean === null || mean <= 0) return [];
  const listed = trustedRows(rows).filter((one) => isNumber(one.row.conversions));
  const total = listed.reduce((sum, one) => sum + one.visits, 0);
  const scored = listed.map((one) => {
    const rate = perHundred(one.row.conversions as number, one.visits) ?? 0;
    const ratio = Math.max(0.01, rate / mean);
    return { ...one, rate, ratio, weight: Math.sqrt(total > 0 ? one.visits / total : 0) * Math.min(2, Math.abs(Math.log(ratio))) };
  }).filter((one) => one.ratio >= RATE_APART || one.ratio <= 1 / RATE_APART);
  const out: OwnFound[] = [];
  for (const above of [true, false]) {
    const best = scored.filter((one) => (above ? one.ratio > 1 : one.ratio < 1)).sort((left, right) => right.weight - left.weight)[0];
    if (best) out.push(beside(`${list}:perHundred`, best.name, "conversionsPerHundred", best.rate, mean, 0.7 + Math.min(0.7, best.weight), other));
  }
  return out;
}

/** The row whose conversions for every 100 visits moved most against the span before, beside its reference's own move. */
function perHundredMoved(list: string, rows: readonly Row[], reference: { name: string; change: number | null } | null): OwnFound | null {
  const listed = trustedRows(rows).flatMap((one) => {
    const before = visitsBeforeOf(one.row);
    const conversions = one.row.conversions;
    const conversionsBefore = one.row.conversionsBefore;
    if (before === null || before < GROUP_LEAST || !isNumber(conversions) || !isNumber(conversionsBefore) || conversionsBefore < CONVERSIONS_LEAST) return [];
    const now = perHundred(conversions, one.visits) ?? 0;
    const was = perHundred(conversionsBefore, before) ?? 0;
    const change = was > 0 ? (now - was) / was : 0;
    if (Math.abs(change) < CONVERSIONS_MOVE || (reference?.change !== null && reference?.change !== undefined && Math.abs(change - reference.change) < CONVERSIONS_GAP)) return [];
    return [{ ...one, now, was, change, weight: Math.sqrt(one.visits) * Math.min(1, Math.abs(change)) }];
  }).sort((left, right) => right.weight - left.weight);
  const best = listed[0];
  if (!best) return null;
  const other = reference && reference.change !== null ? { name: reference.name, change: reference.change } : undefined;
  return rateMoved(`${list}:perHundredMoved`, best.name, "conversionsPerHundred", best.now, best.was, 0.8 + Math.min(0.5, Math.abs(best.change)), other);
}

/** The row leaving at once furthest from its reference, more or fewer, weighed by its visits. */
function leftApart(list: string, rows: readonly Row[], mean: number | null, other: string | null): OwnFound | null {
  if (mean === null) return null;
  const listed = trustedRows(rows).filter((one) => isNumber(one.row.bounceRatePercent));
  const total = listed.reduce((sum, one) => sum + one.visits, 0);
  const best = listed
    .map((one) => ({ ...one, left: one.row.bounceRatePercent as number, gap: (one.row.bounceRatePercent as number) - mean }))
    .filter((one) => Math.abs(one.gap) >= LEFT_APART_POINTS)
    .map((one) => ({ ...one, weight: Math.sqrt(total > 0 ? one.visits / total : 0) * Math.abs(one.gap) }))
    .sort((left, right) => right.weight - left.weight)[0];
  return best ? beside(`${list}:left`, best.name, "bounceRatePercent", best.left, mean, 0.6 + Math.min(0.6, best.weight / 30), other) : null;
}

/** The row whose conversions moved apart from its visits ("visits held, conversions nearly halved"), the most lost or gained. */
function conversionsApartFromVisits(list: string, rows: readonly Row[], visitsName: string, visitsOf: (row: Row) => { now: number; before: number | null } = (row) => ({ now: row.visits as number, before: visitsBeforeOf(row) })): OwnFound | null {
  const listed = rows.flatMap((row) => {
    const name = rowNameOf(row);
    const conversions = row.conversions;
    const before = row.conversionsBefore;
    if (!name || !isNumber(conversions) || !isNumber(before) || before < CONVERSIONS_LEAST) return [];
    const visits = visitsOf(row);
    const visitsChange = changeOf(visits.now, visits.before);
    const change = (conversions - before) / before;
    // Apart: the conversions a visit moved too, not only the count (a campaign's visits and conversions both up 3,600% is no news).
    const perVisit = visitsChange !== null && visitsChange > -1 ? (1 + change) / (1 + visitsChange) - 1 : null;
    if (visitsChange === null || perVisit === null || visits.now < GROUP_LEAST || Math.abs(conversions - before) < CONVERSIONS_LEAST || Math.abs(change) < CONVERSIONS_MOVE || Math.abs(perVisit) < CONVERSIONS_MOVE) return [];
    return [{ name, conversions, before, change, visitsChange }];
  });
  const total = listed.reduce((sum, one) => sum + Math.max(one.conversions, one.before), 0);
  const best = listed.sort((left, right) => Math.abs(right.conversions - right.before) - Math.abs(left.conversions - left.before))[0];
  if (!best) return null;
  return moved(`${list}:conversions`, best.name, "conversions", best.conversions, best.before, 0.8 + Math.min(0.5, Math.abs(best.change - best.visitsChange)) + Math.min(0.2, total > 0 ? Math.abs(best.conversions - best.before) / total : 0), { name: visitsName, change: best.visitsChange });
}

/** The few rows that lost most, where together they hold much of the whole's fall: "/a, /b and /c: 62% of all the views lost". */
function explainsFall(list: string, rows: ReadonlyArray<{ name: string; now: number; before: number }>, now: number, before: number, measure: string): OwnFound | null {
  const fell = before - now;
  if (fell <= 0 || fell < before * 0.02) return null;
  const losers = rows.filter((row) => row.before > row.now).sort((left, right) => (right.before - right.now) - (left.before - left.now)).slice(0, EXPLAIN_ROWS);
  if (losers.length < 2) return null;
  const lost = losers.reduce((sum, row) => sum + row.before - row.now, 0);
  const share = lost / fell;
  if (share < EXPLAIN_SHARE || share > 1) return null;
  return partOf(list, losers.map((row) => row.name).join(", "), measure, lost, fell, 0.9 + Math.min(0.5, share - EXPLAIN_SHARE));
}

/** The website's figures a page hands for its references (`website`): visits, conversions and engaged visits, now and before. */
function websiteOf(data: Row, names: Names): { name: string; visits: number; visitsBefore: number | null; conversions: number; conversionsBefore: number | null; left: number | null } | null {
  const site = isRow(data.website) ? data.website : null;
  if (!site || !isNumber(site.visits) || !isNumber(site.conversions)) return null;
  return {
    name: nameIn(names, "website", "The whole website"),
    visits: site.visits, visitsBefore: isNumber(site.visitsBefore) ? site.visitsBefore : null,
    conversions: site.conversions, conversionsBefore: isNumber(site.conversionsBefore) ? site.conversionsBefore : null,
    left: isNumber(site.engaged) && site.visits > 0 ? 100 * (1 - site.engaged / site.visits) : null,
  };
}

// Overview ------------------------------------------------------------------

/**
 * Overview: the whole website's visits against the span before, its conversions beside them, the share leaving at once,
 * the channels that moved and that convert furthest from the website, the page groups people leave from most, and who
 * visits as a share that moved. Never the shop's money, never the panels' own top-three cut as a whole.
 */
function overviewFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const website = nameIn(names, "website", "The whole website");
  const figures = isRow(data.figures) ? data.figures : {};
  const now = isRow(figures.now) ? figures.now : null;
  const before = isRow(figures.before) ? figures.before : null;
  const found: OwnFound[] = [];
  if (!now) return found;
  const head = headline("whole", website, "visits", now.visits, before?.visits);
  if (head) found.push(head);
  if (before && isNumber(now.conversions) && isNumber(before.conversions) && before.conversions > 0) {
    const change = Math.abs(changeOf(now.conversions, before.conversions) ?? 0);
    if (change >= LEAST_CHANGE) found.push(moved("conversions", website, "conversions", now.conversions, before.conversions, 1.0 + Math.min(0.5, change), isNumber(now.visits) && isNumber(before.visits) && before.visits > 0 ? { name: nameIn(names, "visits", "Visits"), change: (now.visits - before.visits) / before.visits } : undefined));
  }
  // The share of visits that left at once, as Overview's box counts it (visits not engaged), against the span before.
  if (before && isNumber(now.engaged) && isNumber(now.visits) && isNumber(before.engaged) && isNumber(before.visits) && now.visits > 0 && before.visits > 0) {
    const left = 100 * (1 - now.engaged / now.visits);
    const was = 100 * (1 - before.engaged / before.visits);
    if (Math.abs(left - was) >= SHARE_POINTS) found.push(rateMoved("left", website, "leftAtOncePercent", left, was, 0.9 + Math.min(0.5, Math.abs(left - was) / 20)));
  }
  // The channels, every one (the Channels table's own read, handed as `channelsTable`): the movers and the furthest apart.
  const channels = rowsOf(isRow(data.channelsTable) ? data.channelsTable : null);
  const siteChange = isNumber(now.visits) && before && isNumber(before.visits) ? changeOf(now.visits, before.visits) : null;
  found.push(...visitMovers("channels", channels, { name: website, change: siteChange }).slice(0, 2));
  found.push(...perHundredApart("channels", channels, isNumber(now.conversions) && isNumber(now.visits) ? perHundred(now.conversions, now.visits) : null, null).slice(0, 1));
  // The page groups people land on (Overview's own panel, its busiest three): the one whose visits moved apart from the
  // website's. Never their "left" figure: More Handles' home page read 100% left on Last week and 1.6% on Last month,
  // the onward visits kept against "(not set)" on the short spans (2026-11-04), so it is not one the eye leans on.
  const panels = isRow(data.panels) ? data.panels : {};
  const kinds = rowsOf(isRow(panels.kinds) ? panels.kinds : null).map((row) => ({ ...row, name: typeof row.kindName === "string" ? row.kindName : null }));
  found.push(...visitMovers("kinds", kinds.filter((row) => row.name), { name: website, change: siteChange }).slice(0, 1));
  // Who visits: the group whose share of the visits moved most, in points; never a browser's, which is the market's.
  // Handed as percentages already (`nowPercent`, `beforePercent`), so neither is turned round by `pageData.ts`.
  const who = rowsOf(data.who).filter((row) => named(row) && row.kind !== "browser" && isNumber(row.nowPercent) && isNumber(row.beforePercent));
  const whoBest = who.map((row) => ({ row, points: (row.nowPercent as number) - (row.beforePercent as number) })).sort((left, right) => Math.abs(right.points) - Math.abs(left.points))[0];
  if (whoBest && Math.abs(whoBest.points) >= SHARE_POINTS) found.push(shareMovedOf("who", named(whoBest.row)!, "visits", whoBest.row.nowPercent as number, whoBest.row.beforePercent as number, 0.7 + Math.min(0.5, Math.abs(whoBest.points) / 10)));
  return found;
}

// Channels ------------------------------------------------------------------

/**
 * Channels: the whole website's visits with its conversions beside them, the channels whose visits moved apart from the
 * website's, those converting furthest from it, the one whose conversions for every 100 visits moved most, the one leaving
 * at once furthest from the website, and one whose conversions moved apart from its visits.
 */
function channelsFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const website = nameIn(names, "website", "The whole website");
  const figures = isRow(data.figures) ? data.figures : {};
  const rows = rowsOf(isRow(data.channelsTable) ? data.channelsTable : null);
  const found: OwnFound[] = [];
  const head = headline("whole", website, "visits", figures.visits, figures.visitsBefore, { name: nameIn(names, "conversions", "Conversions"), now: figures.conversions, before: figures.conversionsBefore });
  if (head) found.push(head);
  const visits = isNumber(figures.visits) ? figures.visits : sumOf(rows, "visits");
  const conversions = isNumber(figures.conversions) ? figures.conversions : sumOf(rows, "conversions");
  const siteChange = isNumber(figures.visits) && isNumber(figures.visitsBefore) ? changeOf(figures.visits, figures.visitsBefore) : null;
  const rate = perHundred(conversions, visits);
  const rateBefore = isNumber(figures.conversionsBefore) && isNumber(figures.visitsBefore) ? perHundred(figures.conversionsBefore, figures.visitsBefore) : null;
  found.push(...visitMovers("channels", rows, { name: website, change: siteChange }));
  found.push(...perHundredApart("channels", rows, rate, null));
  const rateMove = perHundredMoved("channels", rows, { name: website, change: rate !== null && rateBefore ? (rate - rateBefore) / rateBefore : null });
  if (rateMove) found.push(rateMove);
  const engaged = rows.reduce((sum, row) => sum + (isNumber(row.visits) && isNumber(row.engagementRatePercent) ? ((row.visits as number) * (row.engagementRatePercent as number)) / 100 : 0), 0);
  const left = leftApart("channels", rows, sumOf(rows, "visits") > 0 ? 100 * (1 - engaged / sumOf(rows, "visits")) : null, null);
  if (left) found.push(left);
  const apart = conversionsApartFromVisits("channels", rows, nameIn(names, "visits", "Visits"));
  if (apart) found.push(apart);
  return found;
}

// A channel's own screen ----------------------------------------------------

/**
 * A channel's own screen: its visits against the span before beside the whole website's, its conversions for every 100
 * visits and its leaving at once against the website's, its page groups that moved and converted furthest from it, one
 * whose conversions moved apart from its visits, and the few pages that explain the visits it lost.
 */
function channelFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const top = isRow(data.figures) ? data.figures : {};
  const figures = isRow(top.figures) ? top.figures : null;
  const channel = nameIn(names, "channel", "This channel");
  const website = nameIn(names, "website", "The whole website");
  const found: OwnFound[] = [];
  if (!figures || !isNumber(figures.visits)) return found;
  const siteChange = isNumber(figures.siteVisits) && isNumber(figures.siteVisitsBefore) ? changeOf(figures.siteVisits, figures.siteVisitsBefore) : null;
  const head = headline("whole", channel, "visits", figures.visits, figures.visitsBefore);
  if (head) found.push(siteChange !== null && isNumber(figures.visitsBefore) ? moved("whole", channel, "visits", figures.visits, figures.visitsBefore, head.score, { name: website, change: siteChange }) : head);
  const rate = isNumber(figures.conversions) ? perHundred(figures.conversions, figures.visits) : null;
  const siteRate = isNumber(figures.siteConversions) && isNumber(figures.siteVisits) ? perHundred(figures.siteConversions, figures.siteVisits) : null;
  if (rate !== null && siteRate !== null && siteRate > 0 && figures.visits >= GROUP_LEAST) {
    const ratio = Math.max(0.01, rate / siteRate);
    if (ratio >= 1.15 || ratio <= 1 / 1.15) found.push(beside("rate", channel, "conversionsPerHundred", rate, siteRate, 0.9 + Math.min(0.5, Math.abs(Math.log(ratio))), null));
  }
  if (isNumber(figures.engaged) && isNumber(figures.siteEngaged) && isNumber(figures.siteVisits) && figures.siteVisits > 0 && figures.visits >= GROUP_LEAST) {
    const left = 100 * (1 - figures.engaged / figures.visits);
    const siteLeft = 100 * (1 - figures.siteEngaged / figures.siteVisits);
    if (Math.abs(left - siteLeft) >= LEFT_APART_POINTS) found.push(beside("left", channel, "bounceRatePercent", left, siteLeft, 0.7 + Math.min(0.5, Math.abs(left - siteLeft) / 30), null));
  }
  const kinds = rowsOf(top.kinds).filter((row) => typeof row.kind !== "string" || !HOUSEKEEPING.has(row.kind));
  const change = changeOf(figures.visits, isNumber(figures.visitsBefore) ? figures.visitsBefore : null);
  found.push(...visitMovers("kinds", kinds, { name: channel, change }).slice(0, 1));
  found.push(...perHundredApart("kinds", kinds, rate, channel).slice(0, 1));
  const apart = conversionsApartFromVisits("kinds", kinds, nameIn(names, "visits", "Visits"));
  if (apart) found.push(apart);
  // The pages behind the change (`movers`): the few that lost most, where together they hold much of what the channel lost.
  const movers = rowsOf(top.movers).flatMap((row) => {
    const name = rowNameOf({ ...row, name: undefined, title: undefined });
    return name && isNumber(row.visits) && isNumber(row.visitsBefore) ? [{ name, now: row.visits as number, before: row.visitsBefore as number }] : [];
  });
  if (isNumber(figures.visitsBefore)) {
    const fall = explainsFall("movers", movers, figures.visits, figures.visitsBefore, "visitsLost");
    if (fall) found.push(fall);
  }
  return found;
}

// Campaigns -----------------------------------------------------------------

/**
 * Campaigns: every campaign's visits together against the span before, the campaigns whose visits moved apart from them,
 * those converting furthest from every campaign visit (a campaign with hundreds of visits and no conversions among them),
 * and the one leaving at once furthest from them. Read from every campaign (`campaignsAll`), else the page on screen.
 */
function campaignsFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const tagged = nameIn(names, "tagged", "All campaign visits");
  const whole = isRow(data.campaignsAll) ? data.campaignsAll : data;
  const rows = rowsOf(whole);
  const found: OwnFound[] = [];
  const visits = sumOf(rows, "visits");
  const before = rows.reduce((sum, row) => sum + (visitsBeforeOf(row) ?? 0), 0);
  const conversions = sumOf(rows, "conversions");
  const conversionsBefore = sumOf(rows, "conversionsBefore");
  const head = headline("whole", tagged, "visits", visits, before, { name: nameIn(names, "conversions", "Conversions"), now: conversions, before: conversionsBefore });
  if (head) found.push(head);
  found.push(...visitMovers("campaigns", rows, { name: tagged, change: changeOf(visits, before) }));
  found.push(...perHundredApart("campaigns", rows, perHundred(conversions, visits), tagged));
  const engaged = rows.reduce((sum, row) => sum + (isNumber(row.visits) && isNumber(row.engagementRatePercent) ? ((row.visits as number) * (row.engagementRatePercent as number)) / 100 : 0), 0);
  const left = leftApart("campaigns", rows, visits > 0 ? 100 * (1 - engaged / visits) : null, tagged);
  if (left) found.push(left);
  const apart = conversionsApartFromVisits("campaigns", rows, nameIn(names, "visits", "Visits"));
  if (apart) found.push(apart);
  return found;
}

// Funnel --------------------------------------------------------------------

/**
 * Funnel (funnel-way-1-plan-2026-11-05.md, step 7): what a shop owner would miss on it, each set against something. The whole
 * website's visits, how many left straight away and how many pages a visit saw, against the dates before; the busy pages people
 * leave, against the website's own leaving; the Classification people leave most; the biggest route between two named pages,
 * against how many reached the first; and the visits with no page known. Whatever the dates, it ranks what's biggest.
 */
function funnelFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const site = websiteOf(data, names);
  const whole = isRow(data.website) ? data.website : {};
  const figures = isRow(data.funnel) ? data.funnel : {};
  const website = nameIn(names, "website", "The whole website");
  // A page by the name the chart and table give it, and never the shop's own pages: nobody chooses to start on a basket.
  const rows = rowsOf(data)
    .filter((row) => !(typeof row.key === "string" && HOUSEKEEPING.has(row.key)) && !(typeof row.label === "string" && isShopPage(row.label)))
    .map((row) => (typeof row.label === "string" && !row.label.startsWith("(") ? { ...row, title: pageName(row.label) } : row));
  const found: OwnFound[] = [];
  // The page's first box always leads, or the warning that its dates can't be trusted.
  if (site) {
    const head = headline("whole", site.name, "visits", site.visits, site.visitsBefore, { name: nameIn(names, "conversions", "Conversions"), now: site.conversions, before: site.conversionsBefore });
    if (head) found.push({ ...head, score: 2.5 });
  }
  // Left straight away, against the dates before: the page's second box.
  if (isNumber(whole.visits) && isNumber(whole.engaged) && isNumber(whole.visitsBefore) && isNumber(whole.engagedBefore) && whole.visits > 0 && whole.visitsBefore > 0) {
    const now = round1((100 * (whole.visits - whole.engaged)) / whole.visits);
    const before = round1((100 * (whole.visitsBefore - whole.engagedBefore)) / whole.visitsBefore);
    if (before > 0 && Math.abs(now - before) / before >= LEAST_CHANGE) found.push(moved("whole", website, "leftAtOncePercent", now, before, 1.6));
  }
  // Pages a visit, or a warning first where views look counted differently on these dates.
  const counted = viewsCountedDifferently({ views: whole.views, viewsBefore: whole.viewsBefore, visits: whole.visits, visitsBefore: whole.visitsBefore });
  if (counted) {
    found.push({
      id: "countedDifferently:whole:views", kind: "countedDifferently", list: "whole", score: 3, params: { now: counted.pagesAVisit, before: counted.pagesAVisitBefore },
      facts: [{ key: "now", value: counted.pagesAVisit, unit: "ratio", label: "Pages a visit, these dates" }, { key: "before", value: counted.pagesAVisitBefore, unit: "ratio", label: "Pages a visit, the span before" }],
    });
  } else if (isNumber(whole.views) && isNumber(whole.viewsBefore) && isNumber(whole.visits) && isNumber(whole.visitsBefore) && whole.visits > 0 && whole.visitsBefore > 0) {
    const now = round1(whole.views / whole.visits);
    const before = round1(whole.viewsBefore / whole.visitsBefore);
    if (before > 0 && Math.abs(now - before) / before >= LEAST_CHANGE) found.push(moved("whole", website, "pagesAVisit", now, before, 1));
  }
  found.push(...visitMovers("landing", rows, site ? { name: site.name, change: changeOf(site.visits, site.visitsBefore) } : null));

  // The busy pages people leave most, against every landing page's leaving.
  const all = isNumber(figures.leftPercent) ? figures.leftPercent : isRow(data.landingAll) && isNumber(data.landingAll.leftPercent) ? (data.landingAll.leftPercent as number) : null;
  // The page says the whole website, not every landing page: Funnel's words have no landing pages in them.
  const allName = website;
  const busy = isRow(figures.busy) ? figures.busy : null;
  const worst = rowsOf(busy?.top).flatMap((row) => (typeof row.name === "string" && isNumber(row.left) && isNumber(row.visits) && isNumber(row.leftPercent) ? [{ name: row.name, left: row.left, percent: row.leftPercent }] : []));
  if (all !== null) {
    worst.slice(0, 2).forEach((one, at) => {
      if (one.percent - all >= LEFT_APART_POINTS) found.push(beside("landing:left", one.name, "leftWithoutAnotherPercent", one.percent, all, 1.4 - at * 0.3, allName));
    });
    // The Classification furthest from the website's own leaving, weighed by its visits.
    const groups = rowsOf(figures.classifications).flatMap((row) => (typeof row.name === "string" && isNumber(row.visits) && isNumber(row.leftPercent) && row.visits >= GROUP_LEAST ? [{ name: row.name, visits: row.visits, percent: row.leftPercent }] : []));
    const biggest = [...groups].filter((one) => Math.abs(one.percent - all) >= LEFT_APART_POINTS).sort((left, right) => Math.abs(right.percent - all) * Math.sqrt(right.visits) - Math.abs(left.percent - all) * Math.sqrt(left.visits))[0];
    if (biggest) found.push(beside("groups:left", biggest.name, "leftWithoutAnotherPercent", biggest.percent, all, 1.3, allName));
  }
  if (busy && isNumber(busy.pages) && isNumber(busy.losing) && isNumber(busy.visits) && busy.pages >= BUSY_LEAST && busy.losing > 0) {
    found.push({
      id: "busyLeaving:busy:left", kind: "busyLeaving", list: "busy", score: 1.5, params: { losing: busy.losing, busy: busy.pages, visits: busy.visits, ...(worst[0] ? { name: worst[0].name } : {}) },
      facts: [{ key: "losing", value: busy.losing, unit: "count", label: "Busy pages people leave more than the website's average" }, { key: "busy", value: busy.pages, unit: "count", label: "Busy pages" }, { key: "visits", value: busy.visits, unit: "count", label: "The visits a page needs to be busy" }],
    });
  }
  // The biggest route between two named pages, against how many reached the first.
  const route = rowsOf(figures.routes).find((row) => typeof row.from === "string" && typeof row.to === "string" && isNumber(row.visits) && isNumber(row.fromVisits) && row.fromVisits >= GROUP_LEAST);
  if (route) {
    found.push({
      id: "routeOn:routes:visits", kind: "routeOn", list: "routes", score: 1.45, params: { name: route.from as string, next: route.to as string, reached: route.fromVisits as number, on: route.visits as number },
      facts: [{ key: "reached", value: route.fromVisits as number, unit: "count", label: `Visits that went to ${String(route.from)} next` }, { key: "on", value: route.visits as number, unit: "count", label: `Of those, visits that then went to ${String(route.to)}` }],
    });
  }
  // Visits with no page known say the tracking missed them.
  if (isNumber(figures.noPageVisits) && isNumber(figures.everyVisit) && figures.everyVisit > 0 && figures.noPageVisits / figures.everyVisit >= NO_PAGE_LEAST) {
    const share = round1((100 * figures.noPageVisits) / figures.everyVisit);
    found.push({
      id: "noPageKnown:whole:visits", kind: "noPageKnown", list: "whole", score: 0.95 + Math.min(0.4, share / 40), params: { visits: figures.noPageVisits, share },
      facts: [{ key: "visits", value: figures.noPageVisits, unit: "count", label: "Visits with no page known" }, { key: "share", value: share, unit: "percent", label: "Their share of all visits" }],
    });
  }
  found.push(...perHundredApart("landing", rows, site ? perHundred(site.conversions, site.visits) : null, null));
  const apart = conversionsApartFromVisits("landing", rows, nameIn(names, "visits", "Visits"));
  if (apart) found.push(apart);
  return found;
}
/** Visits with no page known worth saying: this share of all visits. */
const NO_PAGE_LEAST = 0.02;

// All pages -----------------------------------------------------------------

/**
 * All pages: the whole website's views against the span before, the pages that gained and lost most (from every page, as
 * the server sorts them: `pagesGained`, `pagesLost`), the few that explain the views lost, and a page whose conversions
 * moved apart from its views (`pagesConversionsLost`).
 */
function allPagesFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const site = isRow(data.website) ? data.website : {};
  const website = nameIn(names, "website", "The whole website");
  const found: OwnFound[] = [];
  const head = headline("whole", website, "views", site.views, site.viewsBefore, { name: nameIn(names, "visits", "Visits"), now: site.visits, before: site.visitsBefore });
  if (head) found.push(head);
  // On dates like these, every page's move in views below may not be real: said first (Anthony, 2026-11-04).
  const counted = viewsCountedDifferently({ views: site.views, viewsBefore: site.viewsBefore, visits: site.visits, visitsBefore: site.visitsBefore });
  if (counted) {
    found.push({
      id: "countedDifferently:whole:views", kind: "countedDifferently", list: "whole", score: 3,
      params: { now: counted.pagesAVisit, before: counted.pagesAVisitBefore },
      facts: [
        { key: "now", value: counted.pagesAVisit, unit: "ratio", label: "Pages a visit, these dates" },
        { key: "before", value: counted.pagesAVisitBefore, unit: "ratio", label: "Pages a visit, the span before" },
      ],
    });
  }
  // The page's second box, unless the warning above already says it.
  if (!counted && isNumber(site.views) && isNumber(site.viewsBefore) && isNumber(site.visits) && isNumber(site.visitsBefore) && site.visits > 0 && site.visitsBefore > 0) {
    const now = round1(site.views / site.visits);
    const before = round1(site.viewsBefore / site.visitsBefore);
    if (before > 0 && Math.abs(now - before) / before >= LEAST_CHANGE) found.push(moved("whole", website, "pagesAVisit", now, before, 1.2));
  }
  const viewsChange = isNumber(site.views) && isNumber(site.viewsBefore) ? changeOf(site.views, site.viewsBefore) : null;
  // The shop's search, basket and account pages are spoken of only together (below), never as a page that moved.
  // The home page by its name: "/" says nothing in a sentence.
  const homeName = nameIn(names, "homePage", "The home page");
  const namedPage = (row: Row) => (typeof row.label === "string" && pathOfAddress(row.label) === "/" ? { ...row, label: homeName, title: undefined } : { ...row, title: undefined });
  const pageRows = (value: unknown) => rowsOf(value).filter((row) => typeof row.label !== "string" || !isShopPage(row.label)).flatMap((row) => {
    const name = rowNameOf(namedPage(row));
    return name && isNumber(row.views) && isNumber(row.viewsBefore) ? [{ row, name, now: row.views as number, before: row.viewsBefore as number }] : [];
  });
  const gained = pageRows(data.pagesGained).filter((one) => one.now > one.before);
  const lost = pageRows(data.pagesLost).filter((one) => one.now < one.before);
  const other = viewsChange !== null ? { name: website, change: viewsChange } : undefined;
  const views = isNumber(site.views) ? site.views : 0;
  for (const [one, list] of [[gained[0], "gained"], [lost[0], "lost"]] as const) {
    if (!one || one.before <= 0 || Math.abs(one.now - one.before) < MOVE_LEAST_VIEWS) continue;
    const change = Math.abs((one.now - one.before) / one.before);
    found.push(moved(list, one.name, "views", one.now, one.before, 0.8 + Math.min(0.4, change) + Math.min(0.3, views > 0 ? Math.abs(one.now - one.before) / views * 10 : 0), other));
  }
  if (isNumber(site.views) && isNumber(site.viewsBefore)) {
    const fall = explainsFall("explains", lost, site.views, site.viewsBefore, "viewsLost");
    if (fall) found.push(fall);
  }
  found.push(...allPagesWhole(data, site, website, lost[0], viewsChange));
  const apart = conversionsApartFromVisits("pages", rowsOf(data.pagesConversionsLost).filter((row) => typeof row.label !== "string" || !isShopPage(row.label)).map(namedPage), nameIn(names, "views", "Views"), (row) => ({ now: isNumber(row.views) ? row.views : 0, before: isNumber(row.viewsBefore) ? row.viewsBefore : null }));
  if (apart) found.push(apart);
  return found;
}
/** A classification's move worth saying, in views. */
const CLASSIFICATION_LEAST = 100;
/** How few busy pages are too few to count. */
const BUSY_LEAST = 5;
/** The share of the whole fall the shop's own pages must hold to be said as a share of it. */
const SHOP_SHARE_LEAST = 0.1;

/**
 * What All pages shows beyond its biggest movers (all-pages-way-6-plan-2026-11-04.md, step 7), each set against something:
 * how few pages make half the views, how many busy pages fell, the classifications that moved most, and what the shop's
 * search, basket and account pages lost, spoken of together.
 */
function allPagesWhole(data: Row, site: Row, website: string, biggestFall: { row: Row; name: string } | undefined, viewsChange: number | null): OwnFound[] {
  const found: OwnFound[] = [];
  const names = namesOf(data);
  const half = isRow(data.concentration) ? data.concentration : null;
  if (half && isNumber(half.pagesForHalf) && isNumber(half.pagesForHalfBefore) && half.pagesForHalfBefore > 0) {
    found.push({
      id: "halfOfViews:whole:views", kind: "halfOfViews", list: "whole",
      score: 1.1 + Math.min(0.3, Math.abs(half.pagesForHalf - half.pagesForHalfBefore) / half.pagesForHalfBefore),
      params: { pages: half.pagesForHalf, pagesBefore: half.pagesForHalfBefore },
      facts: [
        { key: "pages", value: half.pagesForHalf, unit: "count", label: "Pages that made half the views, these dates" },
        { key: "pagesBefore", value: half.pagesForHalfBefore, unit: "count", label: "Pages that made half the views, the span before" },
      ],
    });
  }
  const bands = isRow(data.bands) ? data.bands : null;
  if (bands && isNumber(bands.busy) && isNumber(bands.busyFewer) && isNumber(bands.busyVisits) && bands.busy >= BUSY_LEAST) {
    const busyFall = biggestFall && isNumber(biggestFall.row.visits) && biggestFall.row.visits >= bands.busyVisits ? biggestFall.name : undefined;
    found.push({
      id: "busyFewer:busy:views", kind: "busyFewer", list: "busy",
      score: 0.9 + Math.min(0.4, bands.busyFewer / bands.busy / 2),
      params: { fewer: bands.busyFewer, busy: bands.busy, visits: bands.busyVisits, ...(busyFall ? { name: busyFall } : {}) },
      facts: [
        { key: "fewer", value: bands.busyFewer, unit: "count", label: "Busy pages with fewer views" },
        { key: "busy", value: bands.busy, unit: "count", label: "Busy pages" },
        { key: "visits", value: bands.busyVisits, unit: "count", label: "The visits a page needs to be busy" },
      ],
    });
  }
  const other = viewsChange !== null ? { name: website, change: viewsChange } : undefined;
  const kinds = rowsOf(data.classifications).flatMap((row) => {
    const name = named(row);
    if (!name || row.shop === true || row.sorted === false || !isNumber(row.views) || !isNumber(row.viewsBefore) || row.viewsBefore < CLASSIFICATION_LEAST) return [];
    const change = (row.views - row.viewsBefore) / row.viewsBefore;
    if (Math.abs(row.views - row.viewsBefore) < MOVE_LEAST_VIEWS || Math.abs(change) < GROUP_MOVE) return [];
    return [{ name, now: row.views, before: row.viewsBefore, change, weight: Math.abs(row.views - row.viewsBefore) * Math.min(1, Math.abs(change) * 5) }];
  });
  for (const way of [1, -1]) {
    const best = kinds.filter((one) => one.change * way > 0).sort((left, right) => right.weight - left.weight)[0];
    if (best) found.push(moved("classification", best.name, "views", best.now, best.before, 0.85 + Math.min(0.5, Math.abs(best.change)), other));
  }
  const shop = isRow(data.shop) ? data.shop : null;
  if (shop && isNumber(shop.views) && isNumber(shop.viewsBefore) && shop.viewsBefore > 0 && Math.abs(shop.views - shop.viewsBefore) >= MOVE_LEAST_VIEWS) {
    const shopName = nameIn(names, "shopPages", "Search, basket and account pages");
    const lost = shop.viewsBefore - shop.views;
    const fell = isNumber(site.views) && isNumber(site.viewsBefore) ? site.viewsBefore - site.views : 0;
    // How much of the whole fall they make up, where it's much; otherwise only their own move.
    if (lost > 0 && fell > 0 && lost <= fell && lost / fell >= SHOP_SHARE_LEAST) found.push(partOf("shopFall", shopName, "viewsLost", lost, fell, 0.95 + (lost / fell) * 0.7));
    else found.push(moved("shop", shopName, "views", shop.views, shop.viewsBefore, 0.9, other));
  }
  return found;
}

/**
 * At most two findings about one row, its best two: a new landing page bringing hundreds of visits that all leave is one
 * story, not three (More Handles' Last week, 2026-11-04). The page's own subject, by the names it hands, is never held back.
 */
const MOST_ABOUT_ONE = 2;
function fewEach(find: (data: Row) => OwnFound[]): (data: Row) => OwnFound[] {
  return (data) => {
    // The page's own subject (the whole website, this page, the channel, every campaign) is said as often as it moves.
    const subjects = new Set(Object.values(namesOf(data)));
    const said = new Map<string, number>();
    return [...find(data)].sort((left, right) => right.score - left.score).filter((one) => {
      const name = String(one.params.name ?? "");
      said.set(name, (said.get(name) ?? 0) + 1);
      return (said.get(name) ?? 0) <= MOST_ABOUT_ONE || subjects.has(name);
    });
  };
}

/** A page's views moved by fewer than this is no page worth naming. */
const MOVE_LEAST_VIEWS = 50;
// A page's own screen -------------------------------------------------------

/**
 * A page's own screen: its views and the visits that started on it against the span before, the channel whose visits
 * starting here moved most, its visitors who bought and how far it is scrolled against the whole website or its group,
 * and the device furthest from the whole website's share of views.
 */
function pageFindingsOwn(data: Row): OwnFound[] {
  const names = namesOf(data);
  const page = nameIn(names, "thisPage", "This page");
  const boxes = isRow(data.boxes) ? data.boxes : {};
  const found: OwnFound[] = [];
  const head = headline("views", page, "views", boxes.views, boxes.viewsBefore);
  if (head) found.push(head);
  if (isNumber(boxes.visits) && isNumber(boxes.visitsBefore) && boxes.visitsBefore > 0) {
    const change = Math.abs((boxes.visits - boxes.visitsBefore) / boxes.visitsBefore);
    if (change >= LEAST_CHANGE && Math.abs(boxes.visits - boxes.visitsBefore) >= CONVERSIONS_LEAST) found.push(moved("started", page, "visits", boxes.visits, boxes.visitsBefore, 1.0 + Math.min(0.4, change)));
  }
  // A page's channels hold fewer visits than a list's: from a fifth of a list's least.
  const channels = rowsOf(isRow(data.visitorsByChannel) ? data.visitorsByChannel.channels : null);
  const started = isNumber(boxes.visits) && isNumber(boxes.visitsBefore) ? changeOf(boxes.visits, boxes.visitsBefore) : null;
  found.push(...visitMovers("channels", channels, { name: page, change: started }, "visits", GROUP_LEAST / 5).slice(0, 1));
  // Who looks at it: the age group or gender furthest from its share of the whole website's people.
  const people = [...rowsOf(data.ages), ...rowsOf(data.genders)].filter((row) => named(row) && isNumber(row.peopleSharePercent) && isNumber(row.websitePeopleSharePercent));
  const group = people.map((row) => ({ row, gap: (row.peopleSharePercent as number) - (row.websitePeopleSharePercent as number) })).sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap))[0];
  if (group && Math.abs(group.gap) >= SHARE_APART_POINTS) found.push(beside("people", named(group.row)!, "peopleSharePercent", group.row.peopleSharePercent as number, group.row.websitePeopleSharePercent as number, 0.6 + Math.min(0.5, Math.abs(group.gap) / 30), null));
  if (isNumber(boxes.boughtRatePercent) && isNumber(boxes.websiteBoughtRatePercent) && boxes.websiteBoughtRatePercent > 0 && isNumber(boxes.visits) && boxes.visits >= GROUP_LEAST) {
    const ratio = Math.max(0.01, boxes.boughtRatePercent / boxes.websiteBoughtRatePercent);
    if (ratio >= RATE_APART || ratio <= 1 / RATE_APART) found.push(beside("bought", page, "boughtRatePercent", boxes.boughtRatePercent, boxes.websiteBoughtRatePercent, 0.9 + Math.min(0.5, Math.abs(Math.log(ratio))), null));
  }
  if (isNumber(boxes.scrolledToBottomRatePercent) && isNumber(boxes.groupScrolledToBottomRatePercent) && Math.abs(boxes.scrolledToBottomRatePercent - boxes.groupScrolledToBottomRatePercent) >= LEFT_APART_POINTS) {
    found.push(beside("scrolled", page, "scrolledToBottomRatePercent", boxes.scrolledToBottomRatePercent, boxes.groupScrolledToBottomRatePercent, 0.7 + Math.min(0.4, Math.abs(boxes.scrolledToBottomRatePercent - boxes.groupScrolledToBottomRatePercent) / 30), null, "group"));
  }
  const devices = rowsOf(data.devices).filter((row) => named(row) && isNumber(row.viewsSharePercent) && isNumber(row.websiteViewsSharePercent));
  const device = devices.map((row) => ({ row, gap: (row.viewsSharePercent as number) - (row.websiteViewsSharePercent as number) })).sort((left, right) => Math.abs(right.gap) - Math.abs(left.gap))[0];
  if (device && Math.abs(device.gap) >= SHARE_APART_POINTS) {
    found.push(beside("devices", named(device.row)!, "viewsSharePercent", device.row.viewsSharePercent as number, device.row.websiteViewsSharePercent as number, 0.6 + Math.min(0.5, Math.abs(device.gap) / 30), null));
  }
  return found;
}

// The pages behind a square -------------------------------------------------

/**
 * The pages behind one square of the Conversions map: the few pages that made most of the square's conversions, and the
 * busy pages converting furthest above and below the square as a whole. Visits that did it, never times: a real rate.
 */
function conversionPagesFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const square = nameIn(names, "square", "Every page in this square");
  const rows = rowsOf(data).flatMap((row) => {
    const name = rowNameOf({ ...row, title: undefined, name: undefined });
    return name && isNumber(row.visits) && isNumber(row.did) ? [{ row, name, visits: row.visits as number, did: row.did as number }] : [];
  });
  const found: OwnFound[] = [];
  const did = rows.reduce((sum, one) => sum + one.did, 0);
  const visits = isNumber(data.visits) && data.visits > 0 ? (data.visits as number) : rows.reduce((sum, one) => sum + one.visits, 0);
  // Its headline: the two pages that made most of the square's conversions, and their share of them, whatever its size.
  if (rows.length >= 3 && did >= CONVERSIONS_LEAST / 2) {
    const top = [...rows].sort((left, right) => right.did - left.did).slice(0, 2);
    const share = top.reduce((sum, one) => sum + one.did, 0) / did;
    found.push(partOf("pages", top.map((one) => one.name).join(", "), "visitsThatDidIt", top.reduce((sum, one) => sum + one.did, 0), did, 1.3 + Math.min(0.4, share)));
  }
  const mean = visits > 0 ? (100 * did) / visits : null;
  if (mean !== null && mean > 0) {
    const total = rows.reduce((sum, one) => sum + one.visits, 0);
    // A page's own visits are fewer than a list's: from a fifth of a list's least, or a fiftieth of the square's.
    // Never a rate chance could give: its visits that did it against what the square's rate would give it.
    const scored = rows.filter((one) => one.visits >= Math.max(GROUP_LEAST / 5, total * 0.02) && !couldBeChance(one.did, (mean / 100) * one.visits)).map((one) => {
      const rate = (100 * one.did) / one.visits;
      const ratio = Math.max(0.01, rate / mean);
      return { ...one, rate, ratio, weight: Math.sqrt(one.visits / total) * Math.min(2, Math.abs(Math.log(ratio))) };
    }).filter((one) => one.ratio >= RATE_APART || one.ratio <= 1 / RATE_APART);
    // The two furthest above and the two furthest below, each a page of its own.
    for (const above of [true, false]) {
      for (const best of scored.filter((one) => (above ? one.ratio > 1 : one.ratio < 1)).sort((left, right) => right.weight - left.weight).slice(0, 2)) {
        found.push(beside(`rate:${above ? "above" : "below"}`, best.name, "conversionRatePercent", best.rate, mean, 0.8 + Math.min(0.6, best.weight), square));
      }
    }
  }
  return found;
}

// Live ----------------------------------------------------------------------

/**
 * Live: the people on the website in the last 30 minutes against a usual half hour last month, worked out
 * from the days Hakken keeps (`googleAnalyticsLiveUsual.ts`), never a second ask of Google (decision 3, Anthony,
 * 2026-11-03: "Yes, write one"); the views and conversions beside theirs; and a page holding far more of the people now
 * than of last month's views.
 */
function liveFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const usual = isRow(data.usual) ? data.usual : null;
  const now = nameIn(names, "rightNow", "Right now");
  const half = nameIn(names, "usualHalfHour", "A usual half hour last month");
  const found: OwnFound[] = [];
  if (!usual) return found;
  if (isNumber(data.people) && isNumber(usual.people) && usual.people > 0) {
    found.push(beside("now", now, "peopleInHalfHour", data.people, usual.people, 1.6, half));
  }
  if (isNumber(data.views) && isNumber(usual.views) && usual.views > 0) {
    const ratio = Math.max(0.01, data.views / usual.views);
    found.push(beside("views", now, "views", data.views, usual.views, 0.8 + Math.min(0.5, Math.abs(Math.log(ratio))), half));
  }
  const conversions = isRow(data.conversions) && isNumber(data.conversions.count) ? (data.conversions.count as number) : null;
  if (conversions !== null && isNumber(usual.conversions) && usual.conversions >= 1) {
    const ratio = Math.max(0.01, conversions / usual.conversions);
    found.push(beside("conversions", now, "conversions", conversions, usual.conversions, 0.7 + Math.min(0.5, Math.abs(Math.log(ratio))), half));
  }
  // The list on screen is pages: the page holding far more of the people now than of last month's views.
  if (data.list === "pages") {
    const shares = new Map(rowsOf(usual.pages).flatMap((row) => (typeof row.title === "string" && isNumber(row.viewsSharePercent) ? [[row.title, row.viewsSharePercent as number] as const] : [])));
    const rows = rowsOf(data).filter((row) => typeof row.name === "string" && isNumber(row.people));
    const people = rows.reduce((sum, row) => sum + (row.people as number), 0);
    const best = rows.flatMap((row) => {
      const before = shares.get(row.name as string) ?? 0;
      const share = people > 0 ? (100 * (row.people as number)) / people : 0;
      return (row.people as number) >= LIVE_PAGE_LEAST && share - before >= LIVE_PAGE_POINTS ? [{ row, share, before }] : [];
    }).sort((left, right) => (right.share - right.before) - (left.share - left.before))[0];
    if (best) {
      found.push(beside("pages", best.row.name as string, "peopleSharePercent", best.share, best.before, 0.9 + Math.min(0.5, (best.share - best.before) / 50), nameIn(names, "viewsShare", "Its share of views last month")));
    }
  }
  return found;
}
/** A page with this many people now, holding this many points more of them than of last month's views. */
const LIVE_PAGE_LEAST = 5;
const LIVE_PAGE_POINTS = 15;

/** Google Analytics' pages with their own rules, by the eye's key for them. */
export const GOOGLE_ANALYTICS_OWN: Readonly<Record<string, { general: boolean; find: (data: Row) => OwnFound[] }>> = {
  "googleAnalytics.visitors": { general: false, find: visitsFindings },
  "googleAnalytics.products": { general: true, find: productsFindings },
  "googleAnalytics.overview": { general: false, find: fewEach(overviewFindings) },
  "googleAnalytics.live": { general: false, find: fewEach(liveFindings) },
  "googleAnalytics.channelsPage": { general: false, find: fewEach(channelsFindings) },
  "googleAnalytics.channelPage": { general: false, find: fewEach(channelFindings) },
  "googleAnalytics.campaigns": { general: false, find: fewEach(campaignsFindings) },
  "googleAnalytics.landing": { general: false, find: fewEach(funnelFindings) },
  "googleAnalytics.allPages": { general: false, find: fewEach(allPagesFindings) },
  "googleAnalytics.page": { general: false, find: fewEach(pageFindingsOwn) },
  "googleAnalytics.conversionPages": { general: false, find: fewEach(conversionPagesFindings) },
};
