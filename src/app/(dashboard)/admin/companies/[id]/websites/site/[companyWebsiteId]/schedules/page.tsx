"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { CalendarClock, ExternalLink, Search } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { SiteSchedule } from "../SiteSchedule";
import { useWebsiteSources, type WebsiteSourcesData } from "../WebsiteSources";
import { siteBase } from "../siteView";

/**
 * One website's Schedules (docs/plans/active/website-schedules-plan.md):
 * everything Hakken collects for it — rankings and AI answers, Search Console,
 * Google Analytics, Bing Webmaster and Clarity — each with its status and its
 * own switch, then when rankings are bought. Rebuilt on 2026-10-15 from the
 * approved drawing (Anthony: "redo the UX of the entire page to make it
 * easier to understand, i don't want toggles just plonked without a
 * rethink"). Where it is watched from is its Market page since 2026-10-03; how
 * much of it is kept is its Limits page since 2026-09-28.
 */
export default function CompanySiteSchedulesPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;
  const data = useQuery(api.websiteSources.getWebsiteSources, { companyWebsiteId });
  if (!data) return null;
  return <SchedulesPage data={data} companyId={companyId} companyWebsiteId={companyWebsiteId} />;
}

function SchedulesPage({ data, companyId, companyWebsiteId }: {
  data: WebsiteSourcesData;
  companyId: Id<"companies">;
  companyWebsiteId: Id<"companyWebsites">;
}) {
  const t = useTranslations("admin.siteView.schedulesPage");
  const { platformName } = useSystemSettings();
  const sources = useWebsiteSources(data, companyWebsiteId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<CalendarClock className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={data.owned
          ? t("subtitle", { host: data.host, platformName })
          : t("subtitleCompetitor", { host: data.host, company: data.companyName, platformName })}
      />
      <div className="flex flex-col gap-3">
        <DataTable
          rows={sources.rows}
          columns={sources.columns}
          rowKey={(row) => row.key}
          empty={{ icon: <Search className="h-5 w-5" />, label: sources.empty }}
          // A fixed list of five sources at most: one page, its count said.
          footer={{
            mode: "paged",
            page: 1,
            totalPages: 1,
            totalCount: sources.rows.length,
            pageSize: Math.max(sources.rows.length, 1),
            isLoading: false,
            onPageChange: () => {},
            labels: { empty: sources.empty, showing: (_start, _end, total) => sources.showing(total) },
          }}
          minWidthClassName=""
        />
        <p className="text-[12px] leading-relaxed text-muted">{sources.note}</p>
        <SaveError>{sources.error}</SaveError>
      </div>
      <SiteSchedule
        data={data}
        companyWebsiteId={companyWebsiteId}
        marketHref={`${siteBase(companyId, companyWebsiteId)}/market`}
        companySchedulesHref={`/admin/companies/${companyId}/websites/schedules`}
        siteSchedulesHref={(siteId) => `${siteBase(companyId, siteId)}/schedules`}
      />
      <Link
        href={`/admin/websites/${data.websiteId}`}
        className="flex w-fit items-center gap-1.5 text-[13px] text-secondary transition-colors hover:text-foreground"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        {t("record", { host: data.host })}
      </Link>
    </div>
  );
}
