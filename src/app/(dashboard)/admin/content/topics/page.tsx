"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Edit2, Plus, Tags, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { TranslationStatus } from "../_components/ContentEditPage";
import { useContentDelete } from "../_components/useContentDelete";

type Topic = FunctionReturnType<typeof api.topics.listTopicsForAdmin>[number];

const BASE = "/admin/content/topics";

const countCell = (count: number) => <span className="font-mono text-[12px] tabular-nums text-foreground">{count.toLocaleString()}</span>;

/**
 * Admin → Content → Topics (docs/plans/active/insights-helpful-content-plan.md,
 * IH20, board 16): the one topic list Knowledge, Helpful content and Who to
 * follow share, in the order Insights' side menu shows it, with how many of
 * each use a topic. New and a topic each open on their own page; deleting asks
 * yes or no first and leaves what used it without a topic.
 */
export default function TopicsAdminPage() {
  const t = useTranslations("admin.topics");
  const router = useRouter();
  const topics = useQuery(api.topics.listTopicsForAdmin, {});
  const deleteTopic = useMutation(api.topics.deleteTopic);
  const remover = useContentDelete({
    scope: "admin-topics",
    remove: deleteTopic,
    argsFor: (topic: Topic) => ({ topicId: topic._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const matching = topics?.filter((topic) => matchesSearchTerm(search, [topic.nameEn]));
  const paged = paginateItems(matching ?? [], page);
  const open = (topic: Topic) => router.push(`${BASE}/${topic._id}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<Tags className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="h-4 w-4" />} onClick={() => router.push(`${BASE}/new`)}>
            {t("create")}
          </PagePrimaryAction>
        }
      />

      <Notice>{t("explanation")}</Notice>

      <DataTable
        rows={topics === undefined ? undefined : paged.items}
        rowKey={(topic) => topic._id}
        onRowClick={open}
        search={{
          value: search,
          onChange: (value) => {
            setSearch(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Tags className="h-8 w-8 text-muted/30" />, label: search ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: topics === undefined,
          onPageChange: setPage,
        }}
        columns={[
          { key: "order", header: t("columns.order"), align: "right", cell: (topic) => <span className="font-mono text-[12px] tabular-nums text-secondary">{topic.order}</span> },
          { key: "topic", header: t("columns.topic"), cell: (topic) => <span className="text-[13px] font-medium text-foreground">{topic.nameEn}</span> },
          { key: "knowledge", header: t("columns.knowledge"), align: "right", cell: (topic) => countCell(topic.uses.knowledge) },
          { key: "helpful", header: t("columns.helpful"), align: "right", cell: (topic) => countCell(topic.uses.helpful) },
          { key: "people", header: t("columns.people"), align: "right", cell: (topic) => countCell(topic.uses.people) },
          { key: "translations", header: t("columns.translations"), cell: (topic) => <TranslationStatus progress={topic.translations} compact /> },
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (topic) => (
              <RowActions>
                <RowIconButton label={t("edit")} navigates onClick={() => open(topic)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("delete")} tone="danger" onClick={() => remover.askDelete(topic)}>
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
          name: remover.deleting?.nameEn ?? "",
          knowledge: remover.deleting?.uses.knowledge ?? 0,
          helpful: remover.deleting?.uses.helpful ?? 0,
          people: remover.deleting?.uses.people ?? 0,
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </div>
  );
}
