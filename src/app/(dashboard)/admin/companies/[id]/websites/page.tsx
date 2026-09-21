"use client";

import { lazy, Suspense, useState, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Plus, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate, formatDateTime } from "@/src/lib/dates";

const loadDialogs = () => import("./CompanyWebsiteDialogs");
const AddCompanyWebsiteDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.AddCompanyWebsiteDialog })),
);
const RemoveCompanyWebsiteDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.RemoveCompanyWebsiteDialog })),
);

/**
 * A company's own websites.
 *
 * The top of the structure everything else hangs from: a customer adds their
 * website, and the competitors they want it measured against go inside that
 * record rather than beside it. Open a row to reach them.
 *
 * Each row points at a `websites` record shared with every other company
 * holding or tracking the same host, which is why removing one says "remove
 * from this company" and never "delete". Deleting a website outright lives on
 * All Websites, worded so the two cannot be confused.
 *
 * Super admin only for now, and shaped so the customer-facing version is a
 * second door onto the same functions rather than a rewrite.
 */
export default function CompanyWebsitesPage() {
  const t = useTranslations("admin.companyWebsites");
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;

  const addWebsite = useMutation(api.websites.addCompanyWebsite);
  const removeWebsite = useMutation(api.websites.removeCompanyWebsite);
  const action = useAdminAction({ scope: "admin-company-websites" });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [removing, setRemoving] = useState<{ id: Id<"companyWebsites">; host: string } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [dialogsActivated, setDialogsActivated] = useState(false);

  const websitesTable = useServerPagedTable(
    api.websites.getCompanyWebsites,
    { companyId },
    TABLE_PAGE_SIZE,
  );

  const activateDialogs = () => {
    void loadDialogs();
    setDialogsActivated(true);
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

    const outcome = await action.run(() => addWebsite({ companyId, url }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.saveFailed"),
    });

    if (outcome.ok) {
      setIsAddOpen(false);
      // Straight into it: adding the site is half the job and the next thing
      // anyone wants is its competitors.
      router.push(`/admin/companies/${companyId}/websites/site/${outcome.data}`);
    } else {
      setSubmitError(outcome.message);
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setSubmitError("");

    const outcome = await action.run(() => removeWebsite({ id: removing.id }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.removeFailed"),
    });

    if (outcome.ok) setRemoving(null);
    else setSubmitError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction icon={<Plus className="h-4 w-4" />} onClick={handleOpenAdd}>
            {t("addWebsite")}
          </PagePrimaryAction>
        }
      />

      <DataTable
        rows={websitesTable.isLoading ? undefined : websitesTable.rows}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[820px]"
        onRowClick={(row) =>
          router.push(`/admin/companies/${companyId}/websites/site/${row._id}`)
        }
        empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: websitesTable.page,
          totalPages: websitesTable.totalPages,
          totalCount: websitesTable.loadedCount,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: websitesTable.isBusy,
          onPageChange: websitesTable.goToPage,
          labels: { empty: t("empty") },
        }}
        columns={[
          {
            key: "website",
            header: t("websiteColumn"),
            cell: (row) => (
              <span className="block text-[13px] font-medium leading-tight text-foreground">
                {row.displayHost}
              </span>
            ),
          },
          {
            key: "competitors",
            header: t("competitorsColumn"),
            cell: (row) => (
              <div className="flex w-fit items-center gap-1.5 rounded-full border border-border-dim bg-foreground/5 px-2 py-0.5">
                <span className="font-mono text-[10px] uppercase tracking-widest text-foreground/80">
                  {t("competitors", { count: row.competitorCount })}
                  {row.competitorCountIsCapped ? "+" : ""}
                </span>
              </div>
            ),
          },
          {
            key: "refresh",
            header: t("refreshColumn"),
            cell: (row) => (
              row.collecting && row.nextRunAt ? (
                <StatusPill tone="info">{formatDateTime(row.nextRunAt)}</StatusPill>
              ) : (
                <StatusPill tone="neutral">{t("notCollecting")}</StatusPill>
              )
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
          <AddCompanyWebsiteDialog
            isOpen={isAddOpen}
            onClose={() => setIsAddOpen(false)}
            url={url}
            onUrlChange={setUrl}
            onSubmit={handleAdd}
            isSubmitting={action.isBusy()}
            submitError={submitError}
          />
          <RemoveCompanyWebsiteDialog
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
