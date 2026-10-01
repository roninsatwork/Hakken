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

/** The letter a website is marked with in the Sites lists. */
export function siteInitial(host: string): string {
  return host.replace(/^www\./, "").charAt(0).toUpperCase();
}
