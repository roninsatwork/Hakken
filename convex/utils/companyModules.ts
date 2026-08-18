/**
 * Optional product modules, switched on per workspace.
 *
 * The platform ships one surface to every tenant. Some work is bought by a
 * single client and is meaningless to the rest — a bespoke data import, a
 * client-specific screen — and the honest way to carry that is a flag on the
 * company record rather than a name hardcoded into the navigation. Hardcoding
 * the client is what `no-client-specific-fallbacks.test.ts` exists to stop,
 * and it also means the second client to buy the same thing needs a code
 * change instead of a checkbox.
 *
 * The registry is deliberately dumb: a key, and the vertical it belongs to.
 * The label a workspace sees is its own name, so nothing here needs
 * translating and no client name appears in the platform.
 *
 * Unknown keys stored against a company are ignored rather than rejected.
 * Dropping a vertical from a deployment must not make existing company
 * records invalid.
 */

// template:remove:start salesData
import { SALES_DATA_MODULE_KEY } from "./salesDataModule";
// template:remove:end
import { CORE_MODULES } from "./coreModules";
// template:remove:start salesReports
import { REPORTS_MODULE_KEY } from "./coreModules";
// template:remove:end
// template:remove:start properties
import { PROPERTIES_MODULE_KEY } from "./coreModules";
// template:remove:end

export type CompanyModuleDefinition = {
  key: string;
  /** The template vertical that owns this module's code. */
  vertical: string;
};

export const COMPANY_MODULES: readonly CompanyModuleDefinition[] = [
  { key: CORE_MODULES.tasks, vertical: "base" },
  { key: CORE_MODULES.calls, vertical: "base" },
  { key: CORE_MODULES.reception, vertical: "base" },
  { key: CORE_MODULES.wiki, vertical: "base" },
  { key: CORE_MODULES.governance, vertical: "base" },
  // template:remove:start salesReports
  { key: REPORTS_MODULE_KEY, vertical: "salesReports" },
  // template:remove:end
  // template:remove:start properties
  { key: PROPERTIES_MODULE_KEY, vertical: "properties" },
  // template:remove:end
  // template:remove:start salesData
  { key: SALES_DATA_MODULE_KEY, vertical: "salesData" },
  // template:remove:end
];

export const COMPANY_MODULE_KEYS: readonly string[] = COMPANY_MODULES.map(
  (module) => module.key
);

/**
 * Clean a submitted module list.
 *
 * Trims, drops blanks, drops anything not in the registry, and de-duplicates.
 * Filtering unknown keys on the way in keeps a typo out of the database, where
 * it would read as a module nobody can find.
 */
export function normalizeEnabledModules(
  modules: readonly string[] | undefined | null
): string[] {
  if (!modules) return [];

  const known = new Set(COMPANY_MODULE_KEYS);
  const seen = new Set<string>();

  for (const raw of modules) {
    const key = typeof raw === "string" ? raw.trim() : "";
    if (key && known.has(key)) seen.add(key);
  }

  return [...seen];
}

/** Whether a workspace has a module switched on. */
export function isModuleEnabled(
  company: { enabledModules?: string[] } | null | undefined,
  key: string
): boolean {
  if (!company?.enabledModules) return false;
  return company.enabledModules.includes(key);
}
