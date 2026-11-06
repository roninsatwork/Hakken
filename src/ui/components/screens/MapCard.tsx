"use client";

import type { ReactNode } from "react";
import { SearchConsoleChartCard } from "@/src/app/(dashboard)/app/search-console/_components/SearchConsoleChartCard";
import { ExplorerToolbar, type ExplorerControl } from "./ChartExplorer";

/**
 * A map in its card: the title and hint, its menus, the boxes and a line under them (Anthony, 2026-11-05: "I only want reusable
 * shared components"; docs/plans/active/campaigns-new-page-plan-2026-11-05.md). All pages' map, Visits' map of page groups and
 * Campaigns' map all take it, whichever boxes they draw (`PageMap`, `SiteTreemap`). It's given what to show and reads nothing.
 */
export function MapCard({ title, hint, exportName, csv, host, controls = [], loading = false, message = null, under, children }: {
  title: string;
  hint: ReactNode;
  exportName: string;
  csv: () => string;
  host: string;
  controls?: readonly ExplorerControl[];
  /** The figures are still on their way: the card, with nothing in it. */
  loading?: boolean;
  /** Words in place of the map: nothing to show, or still being collected. */
  message?: string | null;
  /** The line under the map, as its screen writes it. */
  under?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SearchConsoleChartCard title={title} hint={hint} exportName={exportName} csv={csv} host={host} from={null} to={null}>
      {loading ? null : (
        <div className="flex flex-col gap-5">
          {controls.length > 0 ? <ExplorerToolbar controls={controls} /> : null}
          {message !== null ? <p className="py-10 text-center text-[12px] text-muted">{message}</p> : (
            <div className="flex flex-col gap-3">
              {children}
              {under ?? null}
            </div>
          )}
        </div>
      )}
    </SearchConsoleChartCard>
  );
}
