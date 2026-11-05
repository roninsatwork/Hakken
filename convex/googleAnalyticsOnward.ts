import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { slotKey } from "./googleAnalyticsCollect";
import { splitChannelKey, type ListRow } from "./googleAnalyticsLists";
import { readSlot, type ShownRow } from "./googleAnalyticsRows";
import type { AnalyticsPeriod } from "./googleAnalyticsSchema";

/** What a landing page's visits did next (landing-pages-flow-plan.md LF4), for the lists that show it (`googleAnalyticsReads.ts`). */

type Reader = { db: QueryCtx["db"] };

/** A landing page's onward figures as kept (`landingOnward`): the visits that went on, the page most opened next and its visits. */
export type Onward = { on: number; next: string; nextVisits: number };

/** Each landing page's onward figures for the dates, device and country; null until a collection has kept them. */
export async function onwardOf(ctx: Reader, holdId: Id<"companyWebsites">, period: AnalyticsPeriod, device: string, country: string): Promise<Map<string, Onward> | null> {
  const kept = await readSlot(ctx, holdId, slotKey("landingOnward", period, "NOW", device, country));
  if (!kept) return null;
  const byPage = new Map<string, Onward>();
  for (const row of kept.rows) {
    const { channel: page, source: next } = splitChannelKey(row.key);
    byPage.set(page, { on: row.visits, next, nextVisits: row.times ?? 0 });
  }
  return byPage;
}

/** A page group's onward figures: its pages' visits that went on added up, and the page most of them opened next. */
export function onwardByGroup(rows: readonly ListRow[], onward: ReadonlyMap<string, Onward>, kindOf: (row: ListRow) => string): Map<string, Onward> {
  const groups = new Map<string, { on: number; nexts: Map<string, number> }>();
  for (const row of rows) {
    const own = onward.get(row.key);
    if (!own) continue;
    const group = groups.get(kindOf(row)) ?? { on: 0, nexts: new Map() };
    group.on += own.on;
    if (own.next) group.nexts.set(own.next, (group.nexts.get(own.next) ?? 0) + own.nextVisits);
    groups.set(kindOf(row), group);
  }
  return new Map([...groups.entries()].map(([group, held]) => {
    const top = [...held.nexts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
    return [group, { on: held.on, next: top?.[0] ?? "", nextVisits: top?.[1] ?? 0 }];
  }));
}

/** A landing page's or group's visits that went on, and the page most opened next, as the collection kept them (LF4). */
export function withOnward(row: ShownRow, own: Onward | undefined, kept: boolean): ShownRow {
  if (!kept) return row;
  // Google counts a visit as engaged if it saw a second page, so a visit that wasn't engaged left without seeing another.
  // A reload looks like going on in the routes, so this keeps Left from reading lower than what really left straight away.
  const engaged = row.engagementRate === null || row.engagementRate === undefined ? row.visits : Math.round(row.visits * row.engagementRate);
  row.onward = own ? Math.min(row.visits, own.on, engaged) : 0;
  row.next = own && own.next && own.on > 0 ? { key: own.next, page: own.next, share: Math.min(1, own.nextVisits / own.on) } : null;
  return row;
}
