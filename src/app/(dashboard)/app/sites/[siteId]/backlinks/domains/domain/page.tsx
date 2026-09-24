"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Globe } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { LinkStatusPill } from "../../../../_components/SiteCells";
import { SiteFigure } from "../../../../_components/SiteFigure";
import { SiteLinkList } from "../../../../_components/SiteLinkList";
import { SiteFacts, type SiteFact } from "../../../../_components/SiteRecordParts";
import { formatDay, formatNumber } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey } from "../../../../_components/siteRecordLinks";
import { useSiteId } from "../../../../_components/useSite";

/**
 * One linking website's own screen (Backlinks › Referring domains › a
 * website): how strong it is, how many of its links and pages point here,
 * and each of its links in full — the page it is on, the page it links to and
 * with which words, and everything else kept about it.
 *
 * Opened from All backlinks, Referring domains or any link's website — never
 * as a modal (Anthony, 2026-09-24: "These are all new screens with a back
 * button").
 */
export default function SiteLinkingWebsitePage() {
  const t = useTranslations("sites.domainRecord");
  const tr = useTranslations("sites.record");
  const siteId = useSiteId();
  const back = useRecordBack("domain");
  const asked = useRecordKey("domain");
  const record = useQuery(api.siteLinkRecords.linkingWebsiteRecord, asked ? { siteId, domain: asked } : "skip");

  if (!asked) {
    return <DetailHeader back={back} icon={<Globe className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }

  const website = record?.website ?? null;
  const facts: SiteFact[] = website
    ? [
      { key: "firstSeen", label: t("facts.firstSeen"), value: formatDay(website.firstSeen) },
      ...(website.lostDate ? [{ key: "lost", label: t("facts.lost"), value: formatDay(website.lostDate) }] : []),
      ...(website.nofollowPages !== null ? [{ key: "nofollow", label: t("facts.nofollowPages"), value: formatNumber(website.nofollowPages) }] : []),
      ...(website.brokenBacklinks !== null ? [{ key: "broken", label: t("facts.broken"), value: formatNumber(website.brokenBacklinks) }] : []),
      { key: "checked", label: t("facts.checked"), value: formatDay(website.day) },
    ]
    : [];

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={record?.domain ?? asked}
        description={t("description")}
        pills={website ? <LinkStatusPill status={website.status} /> : undefined}
      />

      {record === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          {!website ? (
            <p className="rounded-xl border border-border-dim bg-card/40 px-4 py-3 text-[13px] text-secondary">{t("notInList")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              <SiteFigure label={t("figures.rank")} value={formatNumber(website.rank)} detail={<span className="text-muted">{t("figures.rankDetail")}</span>} />
              <SiteFigure label={t("figures.links")} value={formatNumber(website.backlinks)} />
              <SiteFigure label={t("figures.pages")} value={formatNumber(website.referringPages)} />
              <SiteFigure label={t("figures.spam")} value={formatNumber(website.spamScore)} detail={<span className="text-muted">{t("figures.spamDetail")}</span>} />
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
            <SettingsCard title={t("linksTitle")} className="xl:col-span-2">
              <p className="text-[12px] text-muted">{t("linksHint")}</p>
              <SiteLinkList links={record.links} showWebsite={false} />
            </SettingsCard>
            {website ? (
              <SettingsCard title={t("facts.title")} className="self-start">
                <SiteFacts facts={facts} empty="–" />
              </SettingsCard>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
