/**
 * The workspace's own name, as a URL segment.
 *
 * The section's routes read `/app/comax/spreadsheet-import` for Comax and
 * `/app/northwind/spreadsheet-import` for the next client, because the segment
 * is derived from the company record rather than written down. That is the same
 * rule the nav label already follows: the workspace sees its own name and the
 * platform never stores the string, so a second client is a company record and
 * not a code change.
 *
 * Lowercase, spaces and punctuation collapsed to single hyphens, edges trimmed.
 * Accented letters are folded to their base form so `Café Group` is reachable
 * by typing `cafe-group`.
 */
export function workspaceSlug(companyName: string): string {
  return companyName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Whether a URL segment names this workspace.
 *
 * Compared as slugs rather than raw text so a company renamed from `Comax` to
 * `Comax Ltd` does not have to match character for character on the way in.
 */
export function matchesWorkspace(segment: string, companyName: string): boolean {
  return workspaceSlug(decodeURIComponent(segment)) === workspaceSlug(companyName);
}

/**
 * Whether a path belongs to the workspace section, whatever name precedes it.
 *
 * The nav highlighting used to test a fixed prefix, which stops working once
 * the first segment is the company's name. The pages the section owns are
 * fixed, so those are what it matches on.
 */
export function isWorkspaceSectionPath(pathname: string): boolean {
  return /^\/app\/[^/]+\/(spreadsheet-import|import-data)(\/|$)/.test(pathname);
}
