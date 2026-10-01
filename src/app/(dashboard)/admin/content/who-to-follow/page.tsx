"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Edit2, Plus, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { TranslationStatus } from "../_components/ContentEditPage";
import { useContentDelete } from "../_components/useContentDelete";

type Follow = FunctionReturnType<typeof api.newsFollows.listFollowsForAdmin>[number];

const BASE = "/admin/content/who-to-follow";

/**
 * Admin → Content → Who to follow (docs/plans/active/knowledge-news-and-
 * digest-plan.md, phase 3): the people and channels Anthony recommends, as the
 * News page shows them, in the order they were added. Each opens on its own
 * page.
 */
export default function WhoToFollowAdminPage() {
  const t = useTranslations("admin.newsFollows");
  const router = useRouter();
  const follows = useQuery(api.newsFollows.listFollowsForAdmin, {});
  const deleteFollow = useMutation(api.newsFollows.deleteFollow);
  const remover = useContentDelete({
    scope: "admin-news-follows",
    remove: deleteFollow,
    argsFor: (follow: Follow) => ({ followId: follow._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const matching = follows?.filter((follow) => matchesSearchTerm(search, [follow.name]));
  const paged = paginateItems(matching ?? [], page);
  const open = (follow: Follow) => router.push(`${BASE}/${follow._id}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<UserPlus className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => router.push(`${BASE}/new`)}>
            {t("create")}
          </PagePrimaryAction>
        }
      />

      <DataTable
        rows={follows === undefined ? undefined : paged.items}
        rowKey={(follow) => follow._id}
        minWidthClassName="min-w-[760px]"
        onRowClick={open}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <UserPlus className="h-8 w-8 text-muted/30" />, label: search ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: follows === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "name",
            header: t("columns.name"),
            cell: (follow) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{follow.name}</span>
                <span className="text-[12px] text-secondary">{t(`kinds.${follow.kind}`)}</span>
              </span>
            ),
          },
          { key: "why", header: t("columns.why"), cell: (follow) => <span className="line-clamp-2 text-[12px] text-secondary">{follow.whyEn}</span> },
          { key: "translations", header: t("columns.translations"), cell: (follow) => <TranslationStatus progress={follow.translations} compact /> },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (follow) => (
              <RowActions>
                <RowIconButton label={t("edit")} navigates onClick={() => open(follow)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(follow)}>
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
