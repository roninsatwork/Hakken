/**
 * Navigation visibility for white-label deployments.
 *
 * `getWhiteLabelNavigationProfiles` in `convex/settingsService.ts` describes
 * three profiles with `visible` / `owner` / `hide` lists, and the settings
 * screen renders them. Nothing consumed them: `SidebarNavigation.tsx` is
 * hardcoded JSX, so "Navigation Profiles" was guidance presented as a feature.
 *
 * This turns the same lists into an actual decision. It is deliberately pure
 * and free of React, so the rule is testable on its own and the component only
 * has to ask `isNavItemVisible(key)`.
 *
 * Deny-by-default is the wrong choice here: an item nobody has classified must
 * keep showing, otherwise adding a nav item to the app and forgetting to add it
 * to a profile would silently remove it for every deployment on that profile.
 * Only an explicit `hide` entry removes something.
 */

export type NavigationProfileKey = "customerWorkspace" | "supportWidget" | "operatorConsole";

export type NavigationProfile = {
  key: NavigationProfileKey;
  visible: string[];
  owner: string[];
  hide: string[];
};

export type NavigationVisibilityInput = {
  /** The profile a deployment has selected, if any. */
  profile?: NavigationProfile | null;
  /** Per-deployment overrides, applied after the profile. */
  hiddenNavKeys?: string[] | null;
};

function normalizeKeys(keys: string[] | null | undefined) {
  return new Set((keys ?? []).map((key) => key.trim()).filter(Boolean));
}

/**
 * Resolve which navigation keys are hidden.
 *
 * An explicit override wins over the profile in both directions: a key listed
 * in the profile's `visible` or `owner` set is never hidden by that profile,
 * but a deployment-level `hiddenNavKeys` entry still removes it.
 */
export function resolveHiddenNavKeys(input: NavigationVisibilityInput): Set<string> {
  const hidden = new Set<string>();

  if (input.profile) {
    const shown = new Set([
      ...normalizeKeys(input.profile.visible),
      ...normalizeKeys(input.profile.owner),
    ]);

    for (const key of normalizeKeys(input.profile.hide)) {
      // A profile listing a key as both shown and hidden is a configuration
      // mistake; showing it is the safer reading.
      if (!shown.has(key)) hidden.add(key);
    }
  }

  for (const key of normalizeKeys(input.hiddenNavKeys)) {
    hidden.add(key);
  }

  return hidden;
}

/** Whether a navigation item should render. Unclassified keys always render. */
export function isNavItemVisible(key: string | undefined, hidden: Set<string>) {
  if (!key) return true;
  return !hidden.has(key);
}

/**
 * A navigation entry as far as visibility is concerned. Callers add their own
 * fields (label, icon, href); those pass through untouched.
 */
export type NavigationEntry = {
  navKey?: string;
  children?: NavigationEntry[];
  [key: string]: unknown;
};

/**
 * Filter a list of navigation entries, dropping any parent left with no
 * children — a section whose every item is hidden should not render as an
 * empty heading.
 */
export function filterNavigationTree<T extends NavigationEntry>(
  entries: readonly T[],
  hidden: Set<string>,
): T[] {
  const result: T[] = [];

  for (const entry of entries) {
    if (!isNavItemVisible(entry.navKey, hidden)) continue;

    if (entry.children && entry.children.length > 0) {
      const children = filterNavigationTree(entry.children, hidden);
      // The parent had children; if all of them are hidden it becomes an empty
      // heading, so drop it too.
      if (children.length === 0) continue;
      result.push({ ...entry, children });
      continue;
    }

    result.push(entry);
  }

  return result;
}
