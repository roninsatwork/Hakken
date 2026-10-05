/**
 * A company's websites as the Sites screens show them (docs/plans/active/
 * sites-website-switcher-plan.md, W1 and W2): each website it owns, followed
 * by the competitors measured against it; then the competitors watched against
 * none of them, on their own. One grouping for the Sites list and the
 * switcher, so the two never disagree about where a competitor belongs.
 */

type Groupable = {
  siteId: string;
  relationship: "OWNED" | "TRACKED";
  /** The owned site's hold a competitor belongs to, when it does. */
  ofSiteId: string | null;
};

export type SiteGroup<Hold> = { owner: Hold; competitors: Hold[] };

/** Groups the holds in the order given: each owned one, its competitors in that order beneath it. */
export function groupHolds<Hold extends Groupable>(holds: readonly Hold[]): { groups: SiteGroup<Hold>[]; alone: Hold[] } {
  const owned = holds.filter((hold) => hold.relationship === "OWNED");
  const ownedIds = new Set(owned.map((hold) => hold.siteId));
  return {
    groups: owned.map((owner) => ({
      owner,
      competitors: holds.filter((hold) => hold.relationship === "TRACKED" && hold.ofSiteId === owner.siteId),
    })),
    alone: holds.filter((hold) => hold.relationship === "TRACKED" && !(hold.ofSiteId && ownedIds.has(hold.ofSiteId))),
  };
}

type IconHold = { siteId: string; host: string; iconUrl?: string | null };

/** A host as two lists compare it: one may write it with capitals or a leading `www.`. */
function hostKey(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * The icon of one of the company's own holds, found by its hold or its host,
 * for a list whose rows do not carry one (`SiteMark`). A host the company does
 * not hold has none here and keeps its letter: whether another company holds
 * it is not this one's to learn.
 */
export function heldIcon(
  holds: readonly IconHold[] | undefined,
  by: { siteId?: string | null; host?: string | null },
): string | null {
  if (!holds) return null;
  const key = by.host ? hostKey(by.host) : null;
  const hold = holds.find((entry) => (by.siteId && entry.siteId === by.siteId) || (key !== null && hostKey(entry.host) === key));
  return hold?.iconUrl ?? null;
}

/** The letter a website is marked with in the Sites lists. */
export function siteInitial(host: string): string {
  return host.replace(/^www\./, "").charAt(0).toUpperCase();
}
