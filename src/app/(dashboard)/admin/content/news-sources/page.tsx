"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Edit2, Plus, Radio, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatDateTime } from "@/src/lib/dates";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { useContentDelete } from "../_components/useContentDelete";
import { XConnectionPanel } from "./XConnectionPanel";

type NewsSource = FunctionReturnType<typeof api.newsSources.listNewsSources>[number];

const BASE = "/admin/content/news-sources";

/**
 * Admin → Content → News sources (docs/plans/active/knowledge-news-and-digest-
 * plan.md, A10): what the News Collector reads (phase 5), each with when it
 * was last read and when it last brought something new. Each opens on its own
 * page.
 */
export default function NewsSourcesAdminPage() {
  const t = useTranslations("admin.newsSources");
  const router = useRouter();
  const sources = useQuery(api.newsSources.listNewsSources, {});
  const deleteSource = useMutation(api.newsSources.deleteNewsSource);
  const remover = useContentDelete({
    scope: "admin-news-sources",
    remove: deleteSource,
    argsFor: (source: NewsSource) => ({ sourceId: source._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const matching = sources?.filter((source) => matchesSearchTerm(search, [source.name, source.address]));
  const paged = paginateItems(matching ?? [], page);
  const never = <span className="text-[12px] text-muted">{t("never")}</span>;
  const open = (source: NewsSource) => router.push(`${BASE}/${source._id}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<Radio className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => router.push(`${BASE}/new`)}>
            {t("create")}
          </PagePrimaryAction>
        }
      />

      {/* It reads how a sign-in came back from the address, so it waits for it. */}
      <Suspense fallback={null}>
        <XConnectionPanel />
      </Suspense>

      <DataTable
        rows={sources === undefined ? undefined : paged.items}
        rowKey={(source) => source._id}
        minWidthClassName="min-w-[860px]"
        onRowClick={open}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Radio className="h-8 w-8 text-muted/30" />, label: search ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: sources === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "source",
            header: t("columns.source"),
            cell: (source) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{source.name}</span>
                <span className="text-[12px] text-secondary">{source.kind === "X_ACCOUNT" ? `@${source.address}` : source.address}</span>
              </span>
            ),
          },
          { key: "kind", header: t("columns.kind"), cell: (source) => <span className="text-[12px] text-foreground">{t(`kinds.${source.kind}`)}</span> },
          {
            key: "on",
            header: t("columns.read"),
            cell: (source) => <StatusLabel tone={source.isOn ? "success" : "neutral"}>{source.isOn ? t("on") : t("off")}</StatusLabel>,
          },
          {
            key: "checked",
            header: t("columns.checked"),
            cell: (source) => (source.lastCheckedAt ? <span className="text-[12px] text-secondary">{formatDateTime(source.lastCheckedAt)}</span> : never),
          },
          {
            key: "lastItem",
            header: t("columns.lastItem"),
            cell: (source) => (source.lastItemAt ? <span className="text-[12px] text-secondary">{formatDateTime(source.lastItemAt)}</span> : never),
          },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (source) => (
              <RowActions>
                <RowIconButton label={t("edit")} navigates onClick={() => open(source)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(source)}>
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
          name: remover.deleting?.name ?? "",
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </div>
  );
}
