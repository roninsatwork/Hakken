"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { formatNumber } from "../../sites/_components/siteFormat";
import { ResearchSection } from "./ResearchCells";

/**
 * Start from a competitor (boards 1 and 6; docs/plans/active/keyword-
 * research-plan.md): each competitor of the website and the searches it
 * ranks for that the website doesn't, from Content gap — what Websites
 * already holds — so nothing is bought.
 */

/** A competitor's gap, for the website it is measured against. */
export const competitorHref = (rivalSiteId: string, siteId: string) => `/app/keyword-research/competitor/${rivalSiteId}?site=${siteId}`;

/**
 * The website's competitors' gaps, asking Websites to prepare its gap list
 * the first time it is wanted — as Content gap does — and reading it once it
 * is there. Building the list buys nothing.
 */
export function useCompetitorStarts(siteId: Id<"companyWebsites"> | null) {
  const starts = useQuery(api.keywordResearchCompetitors.competitorStarts, siteId ? { siteId } : "skip");
  usePreparedGap(siteId, starts?.preparing === true);
  return starts;
}

/** While a website's gap list is not there yet, ask for it to be built — once a visit; a failure leaves the waiting state. */
export function usePreparedGap(siteId: Id<"companyWebsites"> | null, preparing: boolean) {
  const ensure = useMutation(api.siteListCopyBuilders.ensureSiteListCopy);
  useEffect(() => {
    if (!preparing || !siteId) return;
    void ensure({ siteId, list: "gap" }).catch(() => undefined);
  }, [preparing, siteId, ensure]);
}

/** Look up's "Start from a competitor" (board 1): a card for each competitor of the website chosen, opening its gap. */
export function CompetitorStartCards({ siteId, host }: { siteId: Id<"companyWebsites">; host: string }) {
  const t = useTranslations("keywordResearch.start");
  const starts = useCompetitorStarts(siteId);
  return (
    <ResearchSection title={t("title")} description={t("description", { host })}>
      {starts === undefined || starts.preparing ? (
        <div className="h-[104px] animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      ) : starts.rivals.length === 0 ? (
        <p className="text-[13px] text-secondary">{t("noRivals", { host })}</p>
      ) : (
        <FigureRow>
          {starts.rivals.map((rival) => (
            <Figure
              key={rival.rivalSiteId}
              label={rival.host}
              href={competitorHref(rival.rivalSiteId, siteId)}
              value={rival.gap === null ? <NoFigure /> : formatNumber(rival.gap)}
              detail={<span className="text-secondary">{t("cardDetail")}</span>}
            />
          ))}
        </FigureRow>
      )}
    </ResearchSection>
  );
}

/** The competitor whose gap is shown, chosen on its own page (board 6): a different one opens its own address. */
export function CompetitorPicker({ siteId, rivalSiteId, rivals }: {
  siteId: string;
  rivalSiteId: string;
  rivals: ReadonlyArray<{ rivalSiteId: string; host: string }>;
}) {
  const t = useTranslations("keywordResearch.start");
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor="kr-rival">{t("competitor")}</FieldLabel>
      <Select id="kr-rival" value={rivalSiteId} onChange={(next) => router.push(competitorHref(next, siteId))} className="w-[260px]">
        {rivals.map((rival) => <option key={rival.rivalSiteId} value={rival.rivalSiteId}>{rival.host}</option>)}
      </Select>
    </div>
  );
}
