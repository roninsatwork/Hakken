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

// template:remove:start salesReports
export const REPORTS_MODULE_KEY = "reports";
// template:remove:end

// template:remove:start properties
export const PROPERTIES_MODULE_KEY = "properties";
// template:remove:end

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
  // template:remove:start salesReports
  REPORTS_MODULE_KEY,
  // template:remove:end
  // template:remove:start properties
  PROPERTIES_MODULE_KEY,
  // template:remove:end
];
