/** An address as the Library shows it: without the "https://" every one of them starts with. */
export const shortAddress = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

/** A page's language tag ("en-GB") in the reader's words ("British English"); the tag itself when the browser has no name for it. */
export function languageName(tag: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
