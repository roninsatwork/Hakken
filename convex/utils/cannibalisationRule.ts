/**
 * Keyword cannibalisation's rule, kept in one place so Insights and Search Console say the same thing (Anthony,
 * 20 November 2026: "i want it to be called keyword cannibalisation", then "i want the data to reflect this page intent
 * too"). Insights groups the pages (`competingGroups`, `insightCompeting.ts`); Search Console's Keyword cannibalisation
 * lists the keywords (`searchConsoleViews.ts`, `searchConsoleKeywordTable.ts`). Both leave out the home page, which
 * Google shows for everything, and searches for the website's own name, and both count a keyword only when two or
 * more pages each take at least 1 in 10 of the times Google showed it. Plain code: no reads, so a screen's tests and the
 * client can use it too.
 */

/** A page takes at least this share of a search's showings among the pages shown for it to count as splitting it. */
export const SPLIT_SHARE = 0.1;

/** The home page brings enquiries for everything, so it is never counted in a group. */
export function isHome(path: string): boolean {
  return path === "/" || /^\/(index|home|default)(\.[a-z]+)?\/?$/i.test(path);
}

/** A page's address without its section, kept by its path. */
export function pathOfPage(address: string): string {
  const match = /^https?:\/\/[^/]+(\/[^#]*)?/i.exec(address.trim());
  return match ? match[1] || "/" : address.trim().split("#")[0];
}

/** Whether a page shown `impressions` times splits a keyword whose pages, the home page left out, were shown `total` times. */
export function splitsKeyword(impressions: number, total: number): boolean {
  return total > 0 && impressions / total >= SPLIT_SHARE;
}

/** The home page's usual addresses on a website, for a list naming its pages by number: each looked up in its book. */
export function homeAddressesOf(host: string): string[] {
  const bare = host.toLowerCase().replace(/^www\./, "");
  if (!bare || bare === "site") return [];
  const paths = ["/", "/index", "/index/", "/index.html", "/index.htm", "/index.php", "/home", "/home/", "/home.html", "/home.php", "/default.aspx", "/default.html", "/default.htm"];
  return [`https://www.${bare}`, `https://${bare}`, `http://www.${bare}`, `http://${bare}`].flatMap((origin) => paths.map((path) => `${origin}${path}`));
}

/**
 * One keyword's pages by the rule: the home page left out, those taking at least 1 in 10 of its impressions, the most
 * shown first (then the most clicked, then A to Z), and the impressions of every page counted. Fewer than two, and the
 * keyword isn't cannibalised.
 */
export function splitPagesOf<Page extends { page: string; clicks: number; impressions: number }>(pages: readonly Page[]): { pages: Page[]; shown: number } {
  const own = pages.filter((page) => !isHome(pathOfPage(page.page)));
  const shown = own.reduce((sum, page) => sum + page.impressions, 0);
  const split = own
    .filter((page) => splitsKeyword(page.impressions, shown))
    .sort((left, right) => right.impressions - left.impressions || right.clicks - left.clicks || (left.page < right.page ? -1 : left.page > right.page ? 1 : 0));
  return { pages: split, shown };
}
