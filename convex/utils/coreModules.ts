/**
 * The platform's own capabilities, switched per company.
 *
 * `companyModules.ts` began as a registry for bespoke, one-client modules —
 * Sales Data was the only entry. Phase 6 of the shared-screen-kit plan extends
 * the same switch to what the platform itself offers, so "this client does not
 * get Properties" is a checkbox rather than a conversation about code. One
 * mechanism for both kinds: a company's list of enabled keys, enforced
 * server-side, read by the navigation.
 *
 * These are keys, not labels. What a reader sees comes from
 * `admin.companies.modules.<key>` in the language files, the same place the
 * provisioning modal reads.
 */
export const CORE_MODULES = {
  tasks: "tasks",
  calls: "calls",
  reception: "reception",
  wiki: "wiki",
} as const;

/**
 * The client menu's sections that can be switched off, for everyone and per
 * company (docs/plans/active/features-switches-plan-2026-11-21.md; Anthony,
 * 2026-11-21). Dashboard, Ask Hakken, Reading room and Usage are always on
 * and have no key.
 *
 * Kept as what is switched OFF — `companies.featuresOff` and
 * `systemSettings.featuresOffForEveryone` — never as an "on" list like
 * `CORE_MODULES`. Every company that predates the switch, and every company a
 * test makes, has all seven: absence can only ever mean "on", so no deploy or
 * missed migration can take a section away from anyone. Switching one off
 * also stops its collection for that company.
 *
 * In menu order. They join `CORE_MODULES` in the effective list
 * (`effectiveModulesFor`), so the menu, the section gates and the server
 * checks read them as they read any module.
 */
export const MENU_FEATURES = {
  insights: "insights",
  visibility: "visibility",
  searchConsole: "searchConsole",
  bingWebmaster: "bingWebmaster",
  googleAnalytics: "googleAnalytics",
  clarity: "clarity",
  hakkenTasks: "hakkenTasks",
} as const;

export type MenuFeature = (typeof MENU_FEATURES)[keyof typeof MENU_FEATURES];

export const MENU_FEATURE_KEYS: readonly MenuFeature[] = Object.values(MENU_FEATURES);

/**
 * Features with no page in the menu, switched off in the same two lists as the
 * menu's (System Settings → Features and a company's Features tab), in a group
 * of their own there. On unless switched off. Ask Hakken in ChatGPT and Claude
 * is the first (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md).
 */
export const OUTSIDE_MENU_FEATURES = {
  chatApps: "chatApps",
} as const;

export type OutsideMenuFeature = (typeof OUTSIDE_MENU_FEATURES)[keyof typeof OUTSIDE_MENU_FEATURES];

export const OUTSIDE_MENU_FEATURE_KEYS: readonly OutsideMenuFeature[] = Object.values(OUTSIDE_MENU_FEATURES);

/** Every feature a switch can turn off: the menu's, then those outside it. */
export type SwitchedFeature = MenuFeature | OutsideMenuFeature;

export const SWITCHED_FEATURE_KEYS: readonly SwitchedFeature[] = [...MENU_FEATURE_KEYS, ...OUTSIDE_MENU_FEATURE_KEYS];

/** A saved or submitted "off" list cleaned: every switchable key, each once, menu first. */
export function normalizeSwitchesOff(keys: readonly string[] | undefined | null): SwitchedFeature[] {
  if (!keys) return [];
  const wanted = new Set(keys.map((key) => (typeof key === "string" ? key.trim() : "")));
  return SWITCHED_FEATURE_KEYS.filter((key) => wanted.has(key));
}

/** A submitted "off" list cleaned: known keys only, each once, in menu order. */
export function normalizeFeaturesOff(keys: readonly string[] | undefined | null): MenuFeature[] {
  if (!keys) return [];
  const wanted = new Set(keys.map((key) => (typeof key === "string" ? key.trim() : "")));
  return MENU_FEATURE_KEYS.filter((key) => wanted.has(key));
}

/** The menu features on for a company: all seven, less its own "off" list and the platform's. */
export function menuFeaturesOn(
  companyOff: readonly string[] | undefined | null,
  offForEveryone: readonly string[] | undefined | null,
): MenuFeature[] {
  const off = new Set([...normalizeFeaturesOff(companyOff), ...normalizeFeaturesOff(offForEveryone)]);
  return MENU_FEATURE_KEYS.filter((key) => !off.has(key));
}

/**
 * Governance is deliberately absent.
 *
 * It was briefly a company capability and should not have been: Anthony's
 * ruling, 2026-08-18 — *"governance is not something to turn on or off per
 * company, it's a platform feature for super admins."* The platform console at
 * `/admin/governance` is the super admin's own oversight, and a workspace's
 * `/app/governance` pages stay gated on the role that opens them — a company
 * administrator or an auditor brought in to examine them — which is what an
 * oversight surface should hang on rather than a purchasable switch.
 */




/**
 * Every capability a company gets unless someone withholds it.
 *
 * New companies start with all of these, and the 2026-08-18 migration seeded
 * them onto every company that existed before the switch did — before that,
 * absence meant "the flag predates the module", and reading it as "withheld"
 * would have switched the whole platform off for everyone in one deploy.
 */
export const DEFAULT_COMPANY_MODULE_KEYS: readonly string[] = [
  ...Object.values(CORE_MODULES),
];
