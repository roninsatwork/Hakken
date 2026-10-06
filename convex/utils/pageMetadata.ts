/** What Firecrawl says about a page beside its words: its meta tags, as it read them. */
export type PageMetadata = Record<string, unknown>;

/** A meta tag's value as one line, from the first key the page has: Firecrawl gives a repeated tag as a list, and its first is the page's. */
export function metadataText(metadata: PageMetadata, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = metadata[key];
    const first = Array.isArray(value) ? value.find((entry) => typeof entry === "string" && entry.trim()) : value;
    if (typeof first === "string" && first.trim()) return first.trim();
  }
  return undefined;
}
