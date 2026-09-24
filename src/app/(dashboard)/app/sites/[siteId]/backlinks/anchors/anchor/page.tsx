"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Quote } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { LinkStatusPill } from "../../../../_components/SiteCells";
import { SiteFigure } from "../../../../_components/SiteFigure";
import { SiteLinkList } from "../../../../_components/SiteLinkList";
import { formatDay, formatNumber } from "../../../../_components/siteFormat";
import { useRecordBack } from "../../../../_components/siteRecordLinks";
import { useSiteId } from "../../../../_components/useSite";

/**
 * One anchor's own screen (Backlinks › Anchors › an anchor): the words other
 * websites link here with, how many links and websites use them, and each of
 * those links in full. The empty anchor is a link with no words — an image —
 * so the address carrying no words at all still means one.
 *
 * Opened from Anchors, never as a modal (Anthony, 2026-09-24: "These are all
 * new screens with a back button").
 */
export default function SiteAnchorPage() {
  const t = useTranslations("sites.anchorRecord");
  const tr = useTranslations("sites.record");
  const params = useSearchParams();
  const siteId = useSiteId();
  const back = useRecordBack("anchor");
  const chosen = params.has("anchor");
  const anchor = params.get("anchor") ?? "";
  const record = useQuery(api.siteLinkRecords.anchorRecord, chosen ? { siteId, anchor } : "skip");

  if (!chosen) {
    return <DetailHeader back={back} icon={<Quote className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }

  const summary = record?.summary ?? null;
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<Quote className="h-6 w-6 text-brand" />}
        title={anchor === "" ? t("noWords") : `“${anchor}”`}
        description={t("description")}
        pills={summary ? <LinkStatusPill status={summary.status} /> : undefined}
      />

      {record === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          {!summary ? (
            <p className="rounded-xl border border-border-dim bg-card/40 px-4 py-3 text-[13px] text-secondary">{t("notInList")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <SiteFigure label={t("figures.links")} value={formatNumber(summary.backlinks)} />
              <SiteFigure label={t("figures.websites")} value={formatNumber(summary.referringDomains)} />
              <SiteFigure label={t("figures.firstSeen")} value={formatDay(summary.firstSeen)} />
              <SiteFigure label={t("figures.spam")} value={formatNumber(summary.spamScore)} detail={<span className="text-muted">{t("figures.spamDetail")}</span>} />
            </div>
          )}

          <SettingsCard title={t("linksTitle")}>
            <p className="text-[12px] text-muted">{t("linksHint")}</p>
            <SiteLinkList links={record.links} />
          </SettingsCard>
        </>
      )}
    </div>
  );
}
