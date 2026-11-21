"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Network } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { WikiQuickSwitcher } from "./WikiQuickSwitcher";
import { WikiConstellation } from "./WikiConstellation";
import { buildConstellation } from "./constellationGeometry";
import type { WikiMapLayout } from "./wikiMapLayout";

/**
 * Wiki map: the wiki as a living constellation you can turn round, fly through, search, watch grow and fill the window
 * with (wiki-sonae-catch-up-plan-2026-11-21.md, S3, from the upstream framework's map of 2026-11-12). The flat layout
 * still decides which pages sit together; `constellationGeometry.ts` lifts it into 3D and `WikiConstellation.tsx` draws it
 * on a canvas at a fixed height in real pixels, so it never stretches with a wide screen as the old SVG map did.
 *
 * Says whose wiki it is, as the pages list does: the two maps look alike, and an empty platform map was read upstream as
 * lost pages. The map is its own line in the AI menus, "Wiki map" beside the wiki's pages (S0 and S2), so it has no way
 * back of its own: the menu is the way back.
 */

const EMPTY_LAYOUT: WikiMapLayout = { nodes: [], edges: [] };

export function WikiMapScreen({
  companyId,
  basePath,
}: {
  companyId?: Id<"companies">;
  basePath: string;
}) {
  const t = useTranslations("aiPages");
  const { platformName } = useSystemSettings();
  // Two doors, one mounted: both hooks are called, the unused door skipped.
  const globalRows = useQuery(api.wikiPages.listPagesForMapForGlobal, companyId ? "skip" : {});
  const companyRows = useQuery(api.wikiPages.listPagesForMapForCompany, companyId ? { companyId } : "skip");
  const rows = companyId ? companyRows : globalRows;

  const [calculated, setCalculated] = useState<{ rows: typeof rows; layout: WikiMapLayout } | null>(null);
  const layout = calculated !== null && calculated.rows === rows ? calculated.layout : EMPTY_LAYOUT;

  useEffect(() => {
    if (!rows || rows.length === 0) return;
    let cancelled = false;
    void import("./wikiMapLayout").then(({ runForceLayout }) => {
      if (!cancelled) setCalculated({ rows, layout: runForceLayout(rows) });
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  const constellation = useMemo(
    () =>
      buildConstellation(
        layout,
        new Map((rows ?? []).map((row) => [row.pageId as string, { usage: row.usageCount, learnedAt: row.learnedAt }])),
      ),
    [layout, rows],
  );

  const empty = rows !== undefined && rows.length === 0;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <WikiQuickSwitcher companyId={companyId} basePath={basePath} />
      <PageHeader icon={<Network className="h-6 w-6 text-brand" />} title={t("map.title")} description={t("map.subtitle")} />
      <Notice>
        <p>{companyId ? t("scopeCompany") : t("map.scopePlatform")}</p>
      </Notice>
      {empty ? (
        <div className="flex flex-col items-center gap-3 py-24 text-secondary">
          <Network className="h-6 w-6" />
          <p className="max-w-md text-center text-[13px]">
            {companyId ? t("map.empty", { platformName }) : t("map.emptyPlatform")}
          </p>
        </div>
      ) : (
        <WikiConstellation constellation={constellation} basePath={basePath} />
      )}
    </div>
  );
}
