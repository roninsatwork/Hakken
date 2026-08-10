export const SETTINGS_ROOT = "/admin/settings";

/**
 * Where each of the old single-page tabs now lives.
 *
 * `audit` is here because the audit trail moved to Governance long before the
 * tabs did, leaving a `?tab=audit` link behind in the app; it lands on the
 * default screen rather than nowhere. `economics` was a tab label that never
 * had a section.
 */
const LEGACY_TAB_ROUTES: Record<string, string> = {
  identity: `${SETTINGS_ROOT}/identity`,
  appearance: `${SETTINGS_ROOT}/identity/aesthetics`,
  security: `${SETTINGS_ROOT}/security`,
  purges: `${SETTINGS_ROOT}/security/retention`,
  options: `${SETTINGS_ROOT}/options`,
};

export const DEFAULT_SETTINGS_ROUTE = LEGACY_TAB_ROUTES.identity;

export function resolveLegacySettingsRoute(tab: string | null): string {
  if (!tab) return DEFAULT_SETTINGS_ROUTE;
  return LEGACY_TAB_ROUTES[tab] ?? DEFAULT_SETTINGS_ROUTE;
}
