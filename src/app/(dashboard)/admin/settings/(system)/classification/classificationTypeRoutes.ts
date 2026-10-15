/** Where System Settings → Classification lives; a type's own page is under it, and a new one's at `/new`. */
export const CLASSIFICATION_TYPES_ROOT = "/admin/settings/classification";

/** A type's own page. Its key is a shipped type's (INFORMATIONAL, …) or an added type's id, both safe in an address. */
export function classificationTypeHref(key: string): string {
  return `${CLASSIFICATION_TYPES_ROOT}/${encodeURIComponent(key)}`;
}
