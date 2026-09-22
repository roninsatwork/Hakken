"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Globe, Users } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";

/**
 * Every company holding or tracking this website.
 *
 * **The only private thing in the model, and the reason it is a tab of its
 * own.** Everything else on this record is shared with every client attached to
 * the host, deliberately: what a site is called, what it is asked, what it is
 * checked against and who it competes with are all observable from outside, and
 * a client seeing a rival's set of those is what they are paying for. Who is
 * watching whom is not. A competitor list is a strategy and a client book.
 *
 * So this page crosses companies where no other does, which is why the whole
 * route is closed to everyone but a platform administrator.
 */
export default function WebsiteWatchersPage() {
  const t = useTranslations("admin.websiteDetail");
  const scheduleSummary = useScheduleSummary();
  const params = useParams();
  const websiteId = params.websiteId as Id<"websites">;

  const website = useQuery(api.websites.getWebsiteById, { id: websiteId });

  if (website === undefined) {
    return <p className="text-[13px] text-secondary">{t("loading")}</p>;
  }
  if (website === null) {
    return <p className="text-[13px] text-destructive">{t("notFound")}</p>;
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Users className="h-6 w-6 text-brand" />}
        title={t("watchersTitle")}
        description={t("watchersSubtitle")}
      />

      <DataTable
        rows={website.watchers}
        rowKey={(watcher) => watcher.key}
        minWidthClassName="min-w-[760px]"
        empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: t("noWatchers") }}
        footer={{
          // `loadMore` rather than `paged`: the watchers arrive with the
          // website in one read, so there is no second page to fetch — what the
          // footer is here for is the count and the empty state's wording.
          mode: "loadMore",
          visibleCount: website.watchers.length,
          canLoadMore: false,
          isLoading: false,
          onLoadMore: () => undefined,
          labels: { empty: t("noWatchers") },
        }}
        columns={[
          {
            key: "company",
            header: t("companyColumn"),
            cell: (watcher) => (
              <Link
                href={`/admin/companies/${watcher.companyId}`}
                className="text-[13px] font-medium text-foreground hover:text-brand"
              >
                {watcher.companyName}
              </Link>
            ),
          },
          {
            key: "against",
            header: t("againstColumn"),
            cell: (watcher) => (
              watcher.againstHost ? (
                <Link
                  href={`/admin/companies/${watcher.companyId}/websites/site/${watcher.companyWebsiteId}`}
                  className="text-[13px] text-secondary hover:text-brand"
                >
                  {watcher.againstHost}
                </Link>
              ) : (
                <span className="text-[12px] text-muted">{t("theirOwnSite")}</span>
              )
            ),
          },
          {
            key: "type",
            header: t("typeColumn"),
            cell: (watcher) => (
              <StatusPill tone={watcher.relationship === "OWNED" ? "success" : "neutral"}>
                {watcher.relationship === "OWNED" ? t("owned") : t("tracked")}
              </StatusPill>
            ),
          },
          {
            key: "schedule",
            header: t("cadenceColumn"),
            cell: (watcher) => (
              <span className="text-[12px] text-secondary">
                {watcher.collecting && watcher.intervalStr
                  ? scheduleSummary(watcher.intervalStr)
                  : t("paused")}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
