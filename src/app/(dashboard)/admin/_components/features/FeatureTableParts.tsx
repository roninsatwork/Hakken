"use client";

import { useTranslations } from "next-intl";

import { MENU_FEATURES, type MenuFeature } from "@/convex/utils/coreModules";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { DataTableColumn } from "@/src/ui/components/screens/DataTable";

/**
 * The client menu as both Features pages list it, in menu order
 * (features-switches-plan-2026-11-21.md): System Settings → Features and a
 * company's Features tab. `feature` is null for the four that are always on.
 * Names are the menu's own words (`sidebar.*`), so the pages and the menu
 * can't call a section two things.
 */
const MENU_ROWS: readonly { id: string; feature: MenuFeature | null; name: string; description: string }[] = [
  { id: "dashboard", feature: null, name: "dashboard", description: "dashboard" },
  { id: "askPlatform", feature: null, name: "askPlatform", description: "askPlatform" },
  { id: "insights", feature: MENU_FEATURES.insights, name: "insights", description: "insights" },
  { id: "visibility", feature: MENU_FEATURES.visibility, name: "sites", description: "visibility" },
  { id: "searchConsole", feature: MENU_FEATURES.searchConsole, name: "searchConsole", description: "searchConsole" },
  { id: "bingWebmaster", feature: MENU_FEATURES.bingWebmaster, name: "bingWebmaster", description: "bingWebmaster" },
  { id: "googleAnalytics", feature: MENU_FEATURES.googleAnalytics, name: "googleAnalytics", description: "googleAnalytics" },
  { id: "clarity", feature: MENU_FEATURES.clarity, name: "clarity", description: "clarity" },
  { id: "readingRoom", feature: null, name: "learn", description: "readingRoom" },
  { id: "hakkenTasks", feature: MENU_FEATURES.hakkenTasks, name: "hakkenTasks", description: "hakkenTasks" },
  { id: "usage", feature: null, name: "usage", description: "usage" },
];

export type FeatureRow = {
  id: string;
  /** The switch, or null for a feature that is always on. */
  feature: MenuFeature | null;
  name: string;
  description: string;
};

/** The 11 menu rows with their words, for the platform's page and a company's. */
export function useMenuFeatureRows(): FeatureRow[] {
  const tSidebar = useTranslations("sidebar");
  const t = useTranslations("admin.features.descriptions");
  const { platformName } = useSystemSettings();
  return MENU_ROWS.map((row) => ({
    id: row.id,
    feature: row.feature,
    name: tSidebar(row.name, { platformName }),
    description: t(row.description),
  }));
}

/** The name and "What it does" columns, cut to one line with the whole on hover, as the lean table rule asks. */
export function featureWordColumns<Row extends { name: string; description: string }>(headers: {
  feature: string;
  what: string;
}): DataTableColumn<Row>[] {
  return [
    {
      key: "feature",
      header: headers.feature,
      className: "w-[200px] min-w-[160px] max-w-0",
      cell: (row) => (
        <span title={row.name} className="block truncate text-[13px] font-medium text-foreground">{row.name}</span>
      ),
    },
    {
      key: "description",
      header: headers.what,
      className: "max-w-0",
      cell: (row) => (
        <span title={row.description} className="block truncate text-[12px] text-secondary">{row.description}</span>
      ),
    },
  ];
}

/** A feature nobody can switch off. */
export function AlwaysOnLabel() {
  const t = useTranslations("admin.features");
  return <StatusLabel tone="neutral" icon="locked">{t("alwaysOn")}</StatusLabel>;
}
