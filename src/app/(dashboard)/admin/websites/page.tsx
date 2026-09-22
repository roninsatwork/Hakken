"use client";

import { lazy, Suspense, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Plus } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDate, formatDateTime } from "@/src/lib/dates";

const loadAddDialog = () => import("./AddWebsiteDialog");
const AddWebsiteDialog = lazy(() =>
  loadAddDialog().then((module) => ({ default: module.AddWebsiteDialog })),
);

/**
 * Every website Hakken holds, once each.
 *
 * This is the screen that shows the model working: a host three clients watch
 * is one row, not three. It is also the first place to look when the DataForSEO
 * bill is higher than expected, because the Fetched column names the client
 * whose cadence is driving each pull — a host is fetched at the rate of its
 * keenest watcher, and that watcher is worth being able to find.
 *
 * It crosses company boundaries by design, which is exactly why it is closed to
 * everyone but a super admin.
 */
export default function AllWebsitesPage() {
  const t = useTranslations("admin.websites");
  const router = useRouter();

  const createWebsite = useMutation(api.websites.createWebsite);
  const action = useAdminAction({ scope: "admin-websites" });

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [dialogActivated, setDialogActivated] = useState(false);

  const websitesTable = useServerPagedTable(
    api.websites.getPaginatedWebsites,
    { searchTerm: debouncedSearch },
    TABLE_PAGE_SIZE,
  );

  const handleOpenAdd = () => {
    void loadAddDialog();
    setDialogActivated(true);
    setUrl("");
    setSubmitError("");
    setIsAddOpen(true);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");

    const outcome = await action.run(() => createWebsite({ url }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.saveFailed"),
    });

    if (outcome.ok) {
      setIsAddOpen(false);
      // Straight to its own screen: adding a host here is only half the job,
      // and the next thing anyone wants is to put it in a division.
      router.push(`/admin/websites/${outcome.data.websiteId}`);
    } else {
      setSubmitError(outcome.message);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction
            variant="brand"
            icon={<Plus className="h-4 w-4" />}
            onClick={handleOpenAdd}
          >
            {t("addWebsite")}
          </PagePrimaryAction>
        }
      />

      <DataTable
        rows={websitesTable.isLoading ? undefined : websitesTable.rows}
        rowKey={(website) => website._id}
        minWidthClassName="min-w-[900px]"
        onRowClick={(website) => router.push(`/admin/websites/${website._id}`)}
        search={{ value: searchTerm, onChange: setSearchTerm, placeholder: t("searchPlaceholder") }}
        empty={{
          icon: <Globe className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("emptySearch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page: websitesTable.page,
          totalPages: websitesTable.totalPages,
          totalCount: websitesTable.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: websitesTable.isBusy,
          onPageChange: websitesTable.goToPage,
          labels: { empty: searchTerm ? t("emptySearch") : t("empty") },
        }}
        columns={[
          {
            key: "website",
            header: t("websiteColumn"),
            cell: (website) => (
              <span className="block text-[13px] font-medium leading-tight text-foreground">
                {website.displayHost}
              </span>
            ),
          },
          {
            key: "watchers",
            header: t("watchersColumn"),
            cell: (website) => (
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] text-secondary">
                  {website.watchersCapped
                    ? t("watchersMany", { count: website.companyCount })
                    : t("watchers", { count: website.companyCount })}
                </span>
                {website.watcherCount > 0 ? (
                  <span className="text-[11px] text-muted">
                    {t("holdings", {
                      owned: website.ownedCount,
                      tracked: website.trackedCount,
                      // Both halves are conditional, so the separator has to be
                      // too — "· 2 track it" with nothing before it reads as a
                      // typo.
                      separator: website.ownedCount > 0 && website.trackedCount > 0 ? " · " : "",
                    })}
                  </span>
                ) : null}
              </div>
            ),
          },
          {
            key: "fetched",
            header: t("fetchedColumn"),
            cell: (website) => (
              website.nextPullAt ? (
                <div className="flex flex-col gap-0.5">
                  <StatusPill tone="info">{formatDateTime(website.nextPullAt)}</StatusPill>
                  {website.fetchedFor ? (
                    <span className="text-[11px] text-muted">
                      {t("fetchedFor", {
                        company: website.fetchedFor.companyName,
                        context: website.fetchedFor.context,
                      })}
                    </span>
                  ) : null}
                </div>
              ) : (
                <StatusPill tone="neutral">{t("notFetched")}</StatusPill>
              )
            ),
          },
          {
            key: "firstSeen",
            header: t("addedColumn"),
            cell: (website) => (
              <span className="text-[12px] text-secondary">{formatDate(website.firstSeenAt)}</span>
            ),
          },
        ]}
      />

      {dialogActivated ? (
        <Suspense fallback={null}>
          <AddWebsiteDialog
            isOpen={isAddOpen}
            onClose={() => setIsAddOpen(false)}
            url={url}
            onUrlChange={setUrl}
            onSubmit={handleAdd}
            isSubmitting={action.isBusy()}
            submitError={submitError}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
