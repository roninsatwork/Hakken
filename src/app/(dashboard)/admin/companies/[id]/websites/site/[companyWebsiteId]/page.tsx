"use client";

import { lazy, Suspense, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Plus, Swords, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDate } from "@/src/lib/dates";
import { WebsiteScheduleOverride } from "./WebsiteScheduleOverride";

const loadDialogs = () => import("./CompetitorDialogs");
const AddCompetitorDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.AddCompetitorDialog })),
);
const RemoveCompetitorDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.RemoveCompetitorDialog })),
);

/**
 * One of a company's websites, and the competitors tracked against it.
 *
 * Competitors live inside a website rather than beside it because a rival is
 * only meaningful relative to the site it is measured against — the shop's
 * competitors are not the trade arm's. They also inherit this website's refresh
 * cadence rather than carrying their own: numbers pulled in different weeks are
 * not a comparison.
 *
 * Every competitor is a shared `websites` record, so stopping tracking here
 * removes this company's interest and nothing else.
 */
export default function CompanyWebsiteDetailPage() {
  const t = useTranslations("admin.companyWebsiteDetail");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const website = useQuery(api.websites.getCompanyWebsiteById, { id: companyWebsiteId });
  const addCompetitor = useMutation(api.websites.addTrackedCompetitor);
  const removeCompetitor = useMutation(api.websites.removeTrackedCompetitor);
  const action = useAdminAction({ scope: "admin-website-competitors" });

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [removing, setRemoving] = useState<{ id: Id<"trackedCompetitors">; host: string } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [dialogsActivated, setDialogsActivated] = useState(false);

  const competitors = useQuery(api.websites.getTrackedCompetitors, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const isLoading = competitors === undefined;
  const websitesHref = `/admin/companies/${companyId}/websites`;

  const activateDialogs = () => {
    void loadDialogs();
    setDialogsActivated(true);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleOpenAdd = () => {
    activateDialogs();
    setUrl("");
    setSubmitError("");
    setIsAddOpen(true);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");

    const outcome = await action.run(
      () => addCompetitor({ companyWebsiteId, url }),
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );

    if (outcome.ok) setIsAddOpen(false);
    else setSubmitError(outcome.message);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setSubmitError("");

    const outcome = await action.run(() => removeCompetitor({ id: removing.id }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.removeFailed"),
    });

    if (outcome.ok) setRemoving(null);
    else setSubmitError(outcome.message);
  };

  if (website === undefined) {
    return <p className="text-[13px] text-secondary">{t("loading")}</p>;
  }
  if (website === null) {
    return <p className="text-[13px] text-destructive">{t("notFound")}</p>;
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("back"), href: websitesHref }}
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={website.displayHost}
        description={t("subtitle")}
        action={
          <PagePrimaryAction icon={<Plus className="h-4 w-4" />} onClick={handleOpenAdd}>
            {t("addCompetitor")}
          </PagePrimaryAction>
        }
      />

      <WebsiteScheduleOverride
        companyWebsiteId={companyWebsiteId}
        companyName={website.companyName}
        companyIntervalStr={website.companyIntervalStr}
        stored={{
          refreshIntervalStr: website.refreshIntervalStr,
          collectionEnabled: website.collectionEnabled,
        }}
        effective={website.effective}
      />

      <DataTable
        rows={isLoading ? undefined : competitors.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[700px]"
        search={{ value: searchTerm, onChange: handleSearch, placeholder: t("searchPlaceholder") }}
        empty={{
          icon: <Swords className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("emptySearch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: competitors?.totalPages ?? 1,
          totalCount: competitors?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("emptySearch") : t("empty") },
        }}
        columns={[
          {
            key: "competitor",
            header: t("competitorColumn"),
            cell: (row) => (
              <span className="block text-[13px] font-medium leading-tight text-foreground">
                {row.displayHost}
              </span>
            ),
          },
          {
            key: "added",
            header: t("addedColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{formatDate(row.createdAt)}</span>
            ),
          },
          {
            key: "actions",
            header: t("actionsColumn"),
            align: "right",
            cell: (row) => (
              <RowActions>
                <RowIconButton
                  label={t("removeTitle")}
                  tone="danger"
                  onClick={() => {
                    activateDialogs();
                    setSubmitError("");
                    setRemoving({ id: row._id, host: row.displayHost });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      {dialogsActivated ? (
        <Suspense fallback={null}>
          <AddCompetitorDialog
            isOpen={isAddOpen}
            onClose={() => setIsAddOpen(false)}
            url={url}
            onUrlChange={setUrl}
            onSubmit={handleAdd}
            isSubmitting={action.isBusy()}
            submitError={submitError}
          />
          <RemoveCompetitorDialog
            host={removing?.host ?? null}
            onClose={() => {
              setRemoving(null);
              setSubmitError("");
            }}
            onConfirm={confirmRemove}
            isSubmitting={action.isBusy()}
            error={submitError}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
