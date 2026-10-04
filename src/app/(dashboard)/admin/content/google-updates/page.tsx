"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Edit2, ExternalLink, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatDate } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { TranslationStatus } from "../_components/ContentEditPage";
import { useContentDelete } from "../_components/useContentDelete";

type GoogleUpdate = FunctionReturnType<typeof api.googleUpdates.listGoogleUpdates>[number];

const BASE = "/admin/content/google-updates";

/** A calendar day as the dashboard writes dates, without moving it across a timezone. */
const formatDay = (day: string) => formatDate(`${day}T12:00:00Z`);

/**
 * Admin → Content → Google updates (docs/plans/active/knowledge-news-and-
 * digest-plan.md, D6): entered by hand when Google announces one, each on its
 * own page. Each shows in News at once, and as a marker on every dated Sites
 * chart (phase 10).
 */
export default function GoogleUpdatesAdminPage() {
  const t = useTranslations("admin.googleUpdates");
  const router = useRouter();
  const updates = useQuery(api.googleUpdates.listGoogleUpdates, {});
  const deleteUpdate = useMutation(api.googleUpdates.deleteGoogleUpdate);
  const remover = useContentDelete({
    scope: "admin-google-updates",
    remove: deleteUpdate,
    argsFor: (update: GoogleUpdate) => ({ updateId: update._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const matching = updates?.filter((update) => matchesSearchTerm(search, [update.titleEn]));
  const paged = paginateItems(matching ?? [], page);
  const open = (update: GoogleUpdate) => router.push(`${BASE}/${update._id}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => router.push(`${BASE}/new`)}>
            {t("create")}
          </PagePrimaryAction>
        }
      />

      <DataTable
        rows={updates === undefined ? undefined : paged.items}
        rowKey={(update) => update._id}
        onRowClick={open}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: search ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: updates === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "title",
            header: t("columns.update"),
            cell: (update) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{update.titleEn}</span>
                <span className="line-clamp-1 text-[12px] text-secondary">{update.descriptionEn}</span>
              </span>
            ),
          },
          { key: "started", header: t("columns.started"), cell: (update) => <span className="text-[12px] text-foreground">{formatDay(update.startedOn)}</span> },
          {
            key: "finished",
            header: t("columns.finished"),
            cell: (update) => <span className="text-[12px] text-secondary">{update.finishedOn ? formatDay(update.finishedOn) : t("rollingOut")}</span>,
          },
          { key: "translations", header: t("columns.translations"), cell: (update) => <TranslationStatus progress={update.translations} compact /> },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (update) => (
              <RowActions>
                <a
                  href={update.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={t("open")}
                  aria-label={t("open")}
                  onClick={(event) => event.stopPropagation()}
                  className="rounded-[8px] p-1.5 text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                <RowIconButton label={t("edit")} navigates onClick={() => open(update)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(update)}>
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      <ContentDeleteDialog
        isOpen={remover.deleting !== null}
        title={t("deleteTitle")}
        warning={t("deleteWarning")}
        error={remover.error}
        isSubmitting={remover.isBusy}
        onClose={remover.closeDelete}
        onConfirm={remover.confirmDelete}
      >
        {t.rich("deleteConfirm", {
          title: remover.deleting?.titleEn ?? "",
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </div>
  );
}
