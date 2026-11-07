/**
 * Where Services' four groups split, for any dates (services-new-page-plan-2026-11-07.md, step 3). One rule, shared by the
 * page, What Hakken sees and Ask Hakken, so all three put a service in the same group under the same name.
 *
 * The groups are named by their numbers, never busy or quiet (Anthony, 2026-11-07: "Dont call them busy or quiet jsut show
 * the facts in the numbers"). The line across is the middle service's figure for the dates picked, tidied to a number people
 * can say, so it means the same on a week as on a year: a fixed 40 visits put every Ronins service under it on This week. The
 * line up is the whole website's figure for every 100 visits, to one place. Half or twice either can be picked instead.
 */

/** The four groups, in the boxes' order: right of the line across and above the line up first. Dots' own names (`DotGroups`). */
export const SERVICE_GROUPS = ["rightHigh", "rightLow", "leftHigh", "leftLow"] as const;
export type ServiceGroup = (typeof SERVICE_GROUPS)[number];

/** The lines on offer: half the middle service (or the website), the middle itself, and twice it. */
export const SPLIT_PICKS = ["half", "middle", "twice"] as const;
export type SplitPick = (typeof SPLIT_PICKS)[number];
const TIMES: Record<SplitPick, number> = { half: 0.5, middle: 1, twice: 2 };

/** A figure people can say: whole numbers under 10 (never under 1), then to the nearest 5, then to the nearest 10. */
export function tidy(value: number): number {
  if (value < 10) return Math.max(1, Math.round(value));
  if (value < 100) return Math.max(5, Math.round(value / 5) * 5);
  return Math.round(value / 10) * 10;
}

/** The middle of some figures: the one in the middle, or the two either side of it halved. Nought for none. */
export function middleOf(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) return 0;
  const at = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[at] : (sorted[at - 1] + sorted[at]) / 2;
}

/** A figure for every 100 visits, to one place: "1.6". Nought with no visits. */
export function perHundredOf(count: number, visits: number): number {
  return visits > 0 ? Math.round((1000 * count) / visits) / 10 : 0;
}

/** The three lines across on offer, tidied: half the middle service, the middle service, twice it. */
export function acrossLines(figures: readonly number[]): Record<SplitPick, number> {
  const middle = tidy(middleOf(figures.filter((figure) => figure > 0)));
  return { half: tidy(middle / 2), middle, twice: tidy(middle * 2) };
}

/** The three lines up on offer, to one place: half the website's figure for every 100 visits, the figure itself, twice it. */
export function upLines(websitePerHundred: number): Record<SplitPick, number> {
  const line = (pick: SplitPick) => Math.round(websitePerHundred * TIMES[pick] * 10) / 10;
  return { half: line("half"), middle: line("middle"), twice: line("twice") };
}

/** Which group a service falls in. A service on a line counts as past it, as a dot does. */
export function serviceGroupOf(point: { x: number; y: number }, split: { x: number; y: number }): ServiceGroup {
  if (point.x >= split.x) return point.y >= split.y ? "rightHigh" : "rightLow";
  return point.y >= split.y ? "leftHigh" : "leftLow";
}

/** A service as the groups read it: its figure across, and its figure for every 100 visits. */
export type GroupPoint = { x: number; y: number };

/**
 * The split for some services: the lines on offer, the two picked, and each group's services. Only services with some of
 * the figure across take part, as only they are drawn.
 */
export function serviceSplit<Service>(services: readonly Service[], read: (service: Service) => GroupPoint, website: number, picks: { across?: SplitPick; up?: SplitPick } = {}) {
  const shown = services.filter((service) => read(service).x > 0);
  const across = acrossLines(shown.map((service) => read(service).x));
  const up = upLines(website);
  const split = { x: across[picks.across ?? "middle"], y: up[picks.up ?? "middle"] };
  const groups = Object.fromEntries(SERVICE_GROUPS.map((group) => [group, [] as Service[]])) as Record<ServiceGroup, Service[]>;
  for (const service of shown) groups[serviceGroupOf(read(service), split)].push(service);
  return { across, up, split, shown, groups };
}

/**
 * The groups as the page opens: each service's visits across, its events for every 100 visits up, split at the middle service and
 * the whole website. The eye and Ask Hakken read this one, so their groups are the boxes' as the page first shows them.
 */
export function openingSplit<Service extends { now: { visits: number; events: number } }>(services: readonly Service[], website: { visits: number; events: number }) {
  return serviceSplit(services, (service) => ({ x: service.now.visits, y: perHundredOf(service.now.events, service.now.visits) }), perHundredOf(website.events, website.visits));
}

/** What a group's name says, as figures, for a writer to put into words: more or fewer than each line. */
export function groupSides(group: ServiceGroup): { more: boolean; higher: boolean } {
  return { more: group === "rightHigh" || group === "rightLow", higher: group === "rightHigh" || group === "leftHigh" };
}

/**
 * A group's name in English, by its numbers alone, for the eye's and Ask Hakken's words: "30 visits or more, and 1.6 or more
 * events for every 100". The page says the same from `messages/<language>.json` (`googleAnalytics.services.groups`).
 */
export function groupNameInEnglish(group: ServiceGroup, split: { x: number; y: number }, unit = "visits", per = "events for every 100"): string {
  const { more, higher } = groupSides(group);
  const counted = `${formatWhole(split.x)} ${split.x === 1 ? unit.replace(/s$/, "") : unit}`;
  const across = more ? `${counted} or more` : `Under ${counted}`;
  const up = higher ? `${split.y.toFixed(1)} or more ${per}` : `under ${split.y.toFixed(1)} ${per}`;
  return `${across}, and ${up}`;
}

const formatWhole = (value: number) => Math.round(value).toLocaleString("en-GB");
