"use client";

import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import type { api } from "@/convex/_generated/api";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { ExternalUrlCell, PositionCell } from "../../sites/_components/SiteCells";
import { MarkedHost } from "../../sites/_components/SiteMark";
import { readableAddress } from "./researchWords";

type Beyond = NonNullable<FunctionReturnType<typeof api.keywordResearch.lookupResults>>["beyond"];

/** Whose a result is, beside its address: the website's own, or one of its competitors'. */
export function WhoLabel({ who }: { who: "YOU" | "RIVAL" | null }) {
  const t = useTranslations("keywordResearch.results");
  if (!who) return null;
  return <TagLabel>{t(who === "YOU" ? "you" : "rival")}</TagLabel>;
}

/**
 * Where the website and its competitors are in Google's top 100 (board 3,
 * "Further down"): each one's place and page, or "Not in the top 100". Only
 * for a lookup measured against a website.
 */
export function WhereYouAre({ beyond }: { beyond: Beyond }) {
  const t = useTranslations("keywordResearch.results");
  const tc = useTranslations("keywordResearch.columns");
  if (beyond.length === 0) return null;
  return (
    <ChartCard title={t("whereTitle")} hint={t("whereHint")}>
      <CompactList
        rows={beyond}
        rowKey={(row) => row.domain}
        density="tight"
        empty={t("empty")}
        columns={[
          {
            key: "website",
            header: tc("website"),
            cell: (row) => (
              <MarkedHost host={row.domain} iconUrl={row.iconUrl} owned={row.who === "YOU"}>
                <span className="flex items-center gap-2 text-[13px] text-foreground">
                  {row.domain}
                  <WhoLabel who={row.who} />
                </span>
              </MarkedHost>
            ),
          },
          { key: "position", header: tc("position"), align: "right", cell: (row) => <PositionCell position={row.position} /> },
          {
            key: "page",
            header: tc("page"),
            className: "max-w-0 w-[45%]",
            cell: (row) => (row.url ? <ExternalUrlCell url={row.url} label={readableAddress(row.url)} cut /> : <NoFigure />),
          },
        ]}
      />
    </ChartCard>
  );
}
