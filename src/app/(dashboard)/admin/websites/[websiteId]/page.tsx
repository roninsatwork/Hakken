"use client";

import { lazy, Suspense, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Trash2 } from "lucide-react";
import Link from "next/link";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";
import { BrandNames } from "./BrandNames";

const loadDeleteDialog = () => import("./DeleteWebsiteDialog");
const DeleteWebsiteDialog = lazy(() =>
  loadDeleteDialog().then((module) => ({ default: module.DeleteWebsiteDialog })),
);

/**
 * One website, and everyone watching it.
 *
 * The only screen in the product that shows one company's setup to somebody
 * looking at another company's. That is unavoidable if a super admin is to
 * delete a shared record responsibly — the alternative is deleting blind — and
 * it is why the whole route is closed to everyone else.
 */
export default function WebsiteDetailPage() {
  const t = useTranslations("admin.websiteDetail");
  const scheduleSummary = useScheduleSummary();
  const params = useParams();
  const router = useRouter();
  const websiteId = params.websiteId as Id<"websites">;

  const website = useQuery(api.websites.getWebsiteById, { id: websiteId });
  const deleteWebsite = useMutation(api.websites.deleteWebsite);
  const action = useAdminAction({ scope: "admin-website-detail" });

  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState("");
  const [dialogActivated, setDialogActivated] = useState(false);

  if (website === undefined) {
    return <p className="text-[13px] text-secondary">{t("loading")}</p>;
  }
  if (website === null) {
    return <p className="text-[13px] text-destructive">{t("notFound")}</p>;
  }

  const handleOpenDelete = () => {
    void loadDeleteDialog();
    setDialogActivated(true);
    setError("");
    setIsDeleting(true);
  };

  const confirmDelete = async () => {
    setError("");
    const outcome = await action.run(() => deleteWebsite({ id: websiteId }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.deleteFailed"),
    });

    if (outcome.ok) {
      setIsDeleting(false);
      router.push("/admin/websites");
    } else {
      setError(outcome.message);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("back"), href: "/admin/websites" }}
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={website.displayHost}
        description={
          website.nextPullAt
            ? t("nextPullAt", { when: formatDateTime(website.nextPullAt) })
            : t("notFetched")
        }
        pills={
          <StatusPill tone={website.nextPullAt ? "info" : "neutral"}>
            {website.nextPullAt ? t("scheduled") : t("notFetched")}
          </StatusPill>
        }
        action={
          <PagePrimaryAction icon={<Trash2 className="h-4 w-4" />} onClick={handleOpenDelete}>
            {t("deleteWebsite")}
          </PagePrimaryAction>
        }
      />

      {/*
        `?? []` rather than passing the field through: the panel cannot tell
        "still loading" from "this site has no names yet" if both arrive as
        undefined, and the second case has to show an empty row to type into.
        By here the website itself has loaded, so absent means none.
      */}
      <BrandNames websiteId={websiteId} saved={website.brandNames ?? []} />

      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("watchersTitle")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">{t("watchersSubtitle")}</p>
      </div>

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

      {dialogActivated ? (
        <Suspense fallback={null}>
          <DeleteWebsiteDialog
            host={isDeleting ? website.displayHost : null}
            affected={website.watchers.map((watcher) => ({
              companyName: watcher.companyName,
              detail: watcher.againstHost
                ? t("lostAsCompetitorOf", { host: watcher.againstHost })
                : t("lostAsTheirOwn"),
            }))}
            onClose={() => {
              setIsDeleting(false);
              setError("");
            }}
            onConfirm={confirmDelete}
            isSubmitting={action.isBusy()}
            error={error}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
