import { isNumber, isRow, moved, partOf, rowsOf, type OwnFound, type Row } from "./shared";
import { namesOf, nameIn, changeOf, perHundred, trustedRows, beside, headline, visitMovers, perHundredApart } from "./googleAnalyticsShared";

// Services ------------------------------------------------------------------

/**
 * How many visits a service needs before its own figures are weighed, by how many visits all the services had: a small website's
 * services are small (Ronins' had 13 visits in This week), and a service of 20 visits a year still says something there.
 */
function leastFor(visits: number): number {
  return visits >= 5_000 ? 100 : visits >= 500 ? 20 : 5;
}

/** Visits a service or channel needs before a move or a rate of its own is named: "up 400%, to 5 from 1" says nothing. */
const MOVE_LEAST = 20;
/** A service's fall in visits this deep, with its events going up, is worth saying however small it is. */
const FELL_APART = 0.25;
/** A service's events moving by fewer than this is no news. */
const EVENTS_MOVE_LEAST = 2;

const figure = (row: Row | null, field: string): number | null => (row && isNumber(row[field]) ? (row[field] as number) : null);

/**
 * The busiest service's share of the services' visits beside its share of their events: "AI Agency gets 36 in every 100 visits to
 * your services, and 22 in every 100 events" (Ronins' last 12 months).
 */
function topShare(rows: readonly Row[], visits: number, events: number, least: number, other: string): OwnFound | null {
  if (visits <= 0 || events <= 0) return null;
  const top = trustedRows(rows, least).sort((left, right) => right.visits - left.visits)[0];
  // One with no events at all is said by the rate rule, beside the whole website: never twice in two ways.
  if (!top || (figure(top.row, "events") ?? 0) === 0) return null;
  const visitsShare = (100 * top.visits) / visits;
  const eventsShare = (100 * (figure(top.row, "events") ?? 0)) / events;
  if (Math.abs(eventsShare - visitsShare) < 5) return null;
  return beside("services:top", top.name, "shareOfEvents", eventsShare, visitsShare, 1.0 + Math.min(0.5, Math.abs(eventsShare - visitsShare) / 40), other);
}

/** A service whose visits fell a long way while its events went up: "ChatBot Agency fell from 198 visits to 78, but its events went up from 5 to 8". */
function fewerVisitsMoreEvents(rows: readonly Row[], least: number, visitsName: string): OwnFound | null {
  const best = trustedRows(rows, least).flatMap((one) => {
    const before = figure(one.row, "visitsBefore");
    const events = figure(one.row, "events");
    const eventsBefore = figure(one.row, "eventsBefore");
    if (before === null || events === null || eventsBefore === null || before <= one.visits) return [];
    const fell = (before - one.visits) / before;
    if (fell < FELL_APART || events - eventsBefore < EVENTS_MOVE_LEAST || eventsBefore <= 0) return [];
    return [{ name: one.name, events, eventsBefore, fell, weight: (events - eventsBefore) * fell }];
  }).sort((left, right) => right.weight - left.weight)[0];
  if (!best) return null;
  return moved("services:events", best.name, "events", best.events, best.eventsBefore, 1.0 + Math.min(0.4, best.fell), { name: visitsName, change: -best.fell });
}

/** The services people looked at with no event, and the busiest of them: "20 of the 38 services had no events. Mobile App Developers had 49 visits and none." */
function noEvents(data: Row, website: { name: string; perHundred: number | null }, noneName: string): OwnFound[] {
  const part = isRow(data.noEvents) ? data.noEvents : null;
  const count = figure(part, "services");
  const of = figure(part, "of");
  if (!part || count === null || of === null || of <= 0 || count <= 0) return [];
  const found: OwnFound[] = [partOf("services:noEvents", noneName, "servicesLookedAt", count, of, 0.9 + Math.min(0.4, count / of / 2))];
  const busiest = rowsOf(part.busiest)[0];
  const visits = figure(busiest ?? null, "visits");
  if (busiest && typeof busiest.name === "string" && visits !== null && visits > 0 && website.perHundred !== null && website.perHundred > 0) {
    found.push(beside("services:busiestNoEvents", busiest.name, "eventsPerHundred", 0, website.perHundred, 0.8 + Math.min(0.4, visits / 200), website.name));
  }
  return found;
}

/** The channel bringing visits to services that get people in touch most, or least, for their visits, against every channel together. */
function channelsApart(data: Row, least: number, allName: string): OwnFound[] {
  const rows = rowsOf(data.channels);
  const visits = rows.reduce((sum, row) => sum + (figure(row, "visits") ?? 0), 0);
  const events = rows.reduce((sum, row) => sum + (figure(row, "events") ?? 0), 0);
  return perHundredApart("services:channels", rows, perHundred(events, visits), allName, "events", "eventsPerHundred", least);
}

/**
 * Services (services-new-page-plan-2026-11-07.md, step 6): all the services' visits and events against the dates before and against
 * the whole website, the busiest service's share of events beside its share of visits, the services furthest from the website for
 * events for every 100 visits, those that moved most, one whose visits fell while its events rose, the services nobody got in touch
 * from, the channel furthest from the rest, and the events on pages that aren't services, which no service gets credit for. A
 * service business says events (Anthony, 2026-11-06), never bought. On small dates it still compares what there is.
 */
export function servicesFindings(data: Row): OwnFound[] {
  const names = namesOf(data);
  const allName = nameIn(names, "allServices", "All your services");
  const websiteName = nameIn(names, "website", "The whole website");
  const eventsName = nameIn(names, "events", "Events");
  const visitsName = nameIn(names, "visits", "Visits");
  const all = isRow(data.allServices) ? data.allServices : null;
  const site = isRow(data.website) ? data.website : null;
  const rows = rowsOf(data.services);
  const visits = figure(all, "visits") ?? rows.reduce((sum, row) => sum + (figure(row, "visits") ?? 0), 0);
  const events = figure(all, "events") ?? rows.reduce((sum, row) => sum + (figure(row, "events") ?? 0), 0);
  const visitsBefore = figure(all, "visitsBefore");
  const eventsBefore = figure(all, "eventsBefore");
  const siteVisits = figure(site, "visits");
  const siteEvents = figure(site, "events");
  const sitePerHundred = siteVisits !== null ? perHundred(siteEvents ?? 0, siteVisits) : null;
  const least = leastFor(visits);
  const found: OwnFound[] = [];

  // Nobody looked at a service in these dates: true, and worth saying, against the visits there were and the dates before.
  if (visits === 0) {
    if (siteVisits !== null && siteVisits > 0) found.push(beside("services:none", allName, "visits", 0, siteVisits, 1.5, websiteName));
    if (visitsBefore !== null && visitsBefore > 0) found.push(moved("whole", allName, "visits", 0, visitsBefore, 1.4));
    return found;
  }

  const head = headline("whole", allName, "visits", visits, visitsBefore, { name: eventsName, now: events, before: eventsBefore });
  if (head) found.push(head);
  // The services against the whole website: their share of its events beside their share of its visits.
  if (siteVisits !== null && siteVisits > 0 && siteEvents !== null && siteEvents > 0) {
    const share = (100 * events) / siteEvents;
    const visitsShare = (100 * visits) / siteVisits;
    found.push(beside("services:share", allName, "shareOfEvents", share, visitsShare, 1.2 + Math.min(0.4, Math.abs(share - visitsShare) / 50), nameIn(names, "theirVisits", "their share of all visits")));
  } else if (siteVisits !== null && siteVisits > 0) {
    // No events anywhere: the services' visits beside the whole website's, so the eye still says how big they are.
    found.push(beside("services:size", allName, "visits", visits, siteVisits, 1.1, websiteName));
  }
  const top = topShare(rows, visits, events, least, nameIn(names, "serviceVisitsShare", "its share of all service visits"));
  if (top) found.push(top);
  found.push(...perHundredApart("services", rows, sitePerHundred, websiteName, "events", "eventsPerHundred", least));
  const apart = fewerVisitsMoreEvents(rows, least, visitsName);
  // A service whose events rose as its visits fell already says how far its visits fell.
  found.push(...visitMovers("services", rows, { name: allName, change: changeOf(visits, visitsBefore) }, "visits", Math.max(least, MOVE_LEAST)).filter((one) => one.params.name !== apart?.params.name));
  if (apart) found.push(apart);
  found.push(...noEvents(data, { name: websiteName, perHundred: sitePerHundred }, nameIn(names, "noEvents", "Services with no events")));
  found.push(...channelsApart(data, Math.max(least, MOVE_LEAST), nameIn(names, "startedOnAService", "Every visit that started on a service")));
  // Events on other pages: no service gets the credit for them.
  const elsewhere = isRow(data.elsewhere) ? data.elsewhere : null;
  const elsewhereEvents = figure(elsewhere, "events");
  if (elsewhereEvents !== null && elsewhereEvents > 0 && siteEvents !== null && siteEvents > 0) {
    const page = elsewhere && typeof elsewhere.page === "string" ? elsewhere.page : null;
    const pageEvents = figure(elsewhere, "pageEvents");
    found.push(page && pageEvents !== null && pageEvents >= elsewhereEvents / 2
      ? partOf("services:elsewhere", page, "events", pageEvents, siteEvents, 0.85 + Math.min(0.4, pageEvents / siteEvents))
      : partOf("services:elsewhere", nameIn(names, "elsewhere", "Pages that aren't services"), "events", elsewhereEvents, siteEvents, 0.85 + Math.min(0.4, elsewhereEvents / siteEvents)));
  }
  return found;
}
