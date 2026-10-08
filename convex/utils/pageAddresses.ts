/**
 * A ranking page's full address, kept once (core-data-normalisation-plan.md
 * §6.2, 2026-10-08). On 97% of dev's rankings it was the website's own host
 * and the page's path — `https://` and the host, or `https://www.` and it —
 * so it is kept only where it is anything else (another host, `http`, a
 * `?…` ending), with `www` saying which of the two it was otherwise. One row
 * a ranking, a page row and a lost ranking each hold it this way.
 */

/** What a row keeps of a page's full address beside its path. */
export type KeptAddress = { address?: string; www?: true };

/** How a full address is kept beside its page's path on a website with this host. */
export function keptAddress(url: string | undefined, host: string, page: string): KeptAddress {
  if (!url) return {};
  if (page && url === `https://${host}${page}`) return {};
  if (page && url === `https://www.${host}${page}`) return { www: true };
  return { address: url };
}

/** A row's full page address again, from what it keeps and its website's host; none for a row with no page. */
export function addressOf(row: { address?: string; www?: boolean; page?: string; url?: string }, host: string): string | undefined {
  // A row not yet moved by `2026-10-08-page-addresses` still holds its whole address.
  if (row.url !== undefined) return row.url;
  if (row.address !== undefined) return row.address;
  if (!row.page) return undefined;
  return `https://${row.www ? "www." : ""}${host}${row.page}`;
}

/** What a row keeps of its address, carried onto another row with the same page. */
export function sameAddress(row: { address?: string; www?: boolean; url?: string }): KeptAddress & { url?: string } {
  return {
    ...(row.address !== undefined ? { address: row.address } : {}),
    ...(row.www ? { www: true as const } : {}),
    // A row not yet moved by `2026-10-08-page-addresses` carries its whole address as it was.
    ...(row.url !== undefined ? { url: row.url } : {}),
  };
}
