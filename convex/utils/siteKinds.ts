/**
 * What kind of website a cited one is, from its address alone (docs/plans/
 * active/discovery-local-reputation-ai-plan.md, step 4: Websites AI cites):
 * the well-known directories, review sites, forums, news sites and video —
 * the places a business can get itself listed or talked about. Anything else
 * is a plain website. A guide for filtering, not a judgement.
 */
export type SiteKind = "DIRECTORY" | "REVIEWS" | "FORUM" | "NEWS" | "VIDEO" | "REFERENCE" | "WEBSITE";

const KNOWN: ReadonlyArray<[SiteKind, readonly string[]]> = [
  ["DIRECTORY", ["clutch.co", "designrush.com", "sortlist.co.uk", "sortlist.com", "goodfirms.co", "themanifest.com", "yell.com", "thomsonlocal.com", "freeindex.co.uk", "cylex-uk.co.uk", "checkatrade.com", "bark.com", "threebestrated.co.uk", "upcity.com", "agencyspotter.com", "expertise.com", "yelp.co.uk", "yelp.com", "trustedtraders.which.co.uk", "ratedpeople.com", "hotfrog.co.uk", "scoot.co.uk", "192.com", "companieshouse.gov.uk", "find-and-update.company-information.service.gov.uk"]],
  ["REVIEWS", ["trustpilot.com", "uk.trustpilot.com", "reviews.io", "feefo.com", "tripadvisor.co.uk", "tripadvisor.com", "g2.com", "capterra.com", "capterra.co.uk", "glassdoor.co.uk", "which.co.uk"]],
  ["FORUM", ["reddit.com", "quora.com", "mumsnet.com", "stackexchange.com", "stackoverflow.com"]],
  ["VIDEO", ["youtube.com", "vimeo.com", "tiktok.com"]],
  ["REFERENCE", ["wikipedia.org", "en.wikipedia.org", "britannica.com", "gov.uk"]],
  ["NEWS", ["bbc.co.uk", "bbc.com", "theguardian.com", "telegraph.co.uk", "independent.co.uk", "forbes.com", "thetimes.co.uk", "ft.com", "reuters.com", "standard.co.uk", "dailymail.co.uk", "cityam.com", "businessinsider.com"]],
];

/** A host's kind: a known one by its own name or as its parent's, a news site by its name, else a website. */
export function siteKindOf(host: string): SiteKind {
  const name = host.toLowerCase().replace(/^www\./, "");
  for (const [kind, hosts] of KNOWN) {
    if (hosts.some((known) => name === known || name.endsWith(`.${known}`))) return kind;
  }
  if (/(^|\.)forums?\.|forum/.test(name)) return "FORUM";
  if (/news/.test(name)) return "NEWS";
  return "WEBSITE";
}
