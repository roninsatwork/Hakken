/**
 * How Helpful content shows an article's address and language, in Admin and
 * in Insights (insights-helpful-content-plan.md): shared, so the two never
 * word them differently.
 */

/** An address as Helpful content shows it: without the "https://" every one of them starts with. */
export const shortAddress = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

/** A page's language tag ("en-GB") in the reader's words ("British English"); the tag itself when the browser has no name for it. */
export function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}

/** The site an article is on, as "Read it on …" names it: "nachomascort.com". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return shortAddress(url).split("/")[0];
  }
}
