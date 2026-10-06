"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Edit2, Plus, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { FollowKind } from "@/convex/newsSchema";
import useDebounce from "@/src/hooks/useDebounce";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { TranslationStatus } from "../_components/ContentEditPage";
import { useContentDelete } from "../_components/useContentDelete";
import { TopicSelect, topicNameIn, useTopicChoices } from "../_components/TopicSelect";

type Follow = FunctionReturnType<typeof api.newsFollows.listFollowsForAdminPage>["page"][number];

const BASE = "/admin/content/who-to-follow";
const KINDS: FollowKind[] = ["X", "YOUTUBE", "LINKEDIN", "WEBSITE"];
/** "Our picks" (insights-helpful-content-plan.md, IH14): the server refuses a fifth. */
const MAX_PICKS = 4;

/**
 * Admin → Content → Who to follow (docs/plans/active/knowledge-news-and-
 * digest-plan.md, phase 3): the people and channels Anthony recommends, as the
 * News page shows them, in the order they were added. Each opens on its own
 * page. Each has an optional topic from the shared list and can be one of
 * "Our picks" — up to four, ticked here or on its page, shown first in
 * Insights in the order picked (insights-helpful-content-plan.md, IH14, board
 * 14).
 */
export default function WhoToFollowAdminPage() {
  const t = useTranslations("admin.newsFollows");
  const router = useRouter();
  const picks = useQuery(api.newsFollows.listPicksForAdmin, {});
  const totals = useQuery(api.newsFollows.getFollowTotals, {});
  const topicChoices = useTopicChoices();
  const deleteFollow = useMutation(api.newsFollows.deleteFollow);
  const setPick = useMutation(api.newsFollows.setFollowPick);
  const pickAction = useAdminAction({ scope: "admin-news-follow-pick" });
  const remover = useContentDelete({
    scope: "admin-news-follows",
    remove: deleteFollow,
    argsFor: (follow: Follow) => ({ followId: follow._id }),
    deleteFailed: t("errors.deleteFailed"),
  });

  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("");
  const [topic, setTopic] = useState("");
  const [show, setShow] = useState("");
  const searched = useDebounce(search, 300).trim();
  // The server searches, filters and pages, A to Z (IH21); a new search or filter starts at page one.
  const pages = useServerPagedTable(api.newsFollows.listFollowsForAdminPage, {
    ...(show === "PICKS" ? { picks: true } : {}),
    ...(searched ? { search: searched } : {}),
    ...(kind ? { kind: kind as FollowKind } : {}),
    ...(topic ? { topic } : {}),
  }, TABLE_PAGE_SIZE);
  // An exact total from the counts kept as the list changes, whenever no search is narrowing it.
  const total = show === "PICKS"
    ? picks?.length
    : searched || !totals
      ? undefined
      : kind && topic ? totals.byKindTopic[`${kind}__${topic}`] ?? 0 : kind ? totals.byKind[kind] ?? 0 : topic ? totals.byTopic[topic] ?? 0 : totals.all;
  const choose = (set: (value: string) => void) => (value: string) => set(value);
  const pickCount = picks?.length ?? 0;
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

      {picks === undefined ? null : (
        <Notice>
          {picks.length
            ? t("picksNotice", { names: picks.map((pick) => pick.name).join(", "), count: picks.length, max: MAX_PICKS })
            : t("picksNone", { max: MAX_PICKS })}
        </Notice>
      )}

      <DataTable
        rows={pages.isLoading ? undefined : pages.rows}
        rowKey={(follow) => follow._id}
        onRowClick={open}
        search={{
          value: search,
          onChange: setSearch,
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <>
            <Select chip={{ label: t("filters.where"), choice: kind ? t(`kinds.${kind}`) : null }} value={kind} onChange={choose(setKind)} aria-label={t("filters.where")}>
              <option value="">{t("filters.allPlaces")}</option>
              {KINDS.map((entry) => (
                <option key={entry} value={entry}>{t(`kinds.${entry}`)}</option>
              ))}
            </Select>
            <TopicSelect chip={{ label: t("filters.topic") }} value={topic} onChange={choose(setTopic)} noneLabel={t("filters.allTopics")} aria-label={t("filters.topic")} />
            <Select chip={{ label: t("filters.show"), choice: show ? t("filters.picks") : null }} value={show} onChange={choose(setShow)} aria-label={t("filters.show")}>
              <option value="">{t("filters.everyone")}</option>
              <option value="PICKS">{t("filters.picks")}</option>
            </Select>
          </>
        }
        cardHeader={<TableBar footer={{ isLoading: pages.isLoading, totalCount: total ?? pages.loadedCount }} noun="people" />}
        empty={{ icon: <UserPlus className="h-8 w-8 text-muted/30" />, label: search ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: pages.page,
          totalPages: total === undefined ? pages.totalPages : Math.max(1, Math.ceil(total / pages.pageSize)),
          totalCount: total ?? pages.loadedCount,
          pageSize: pages.pageSize,
          isLoading: pages.isBusy,
          onPageChange: pages.goToPage,
        }}
        columns={[
          {
            key: "name",
            header: t("columns.name"),
            cell: (follow) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{follow.name}</span>
                <span className="text-[12px] text-secondary">{t(`kinds.${follow.kind}`)}</span>
                {follow.pickedAt !== null ? <StatusLabel tone="info" icon="pinned" className="mt-1">{t("picked")}</StatusLabel> : null}
              </span>
            ),
          },
          {
            key: "topic",
            header: t("columns.topic"),
            cell: (follow) => (topicNameIn(topicChoices, follow.topic) ? <TagLabel>{topicNameIn(topicChoices, follow.topic)}</TagLabel> : <NoFigure />),
          },
          { key: "why", header: t("columns.why"), cell: (follow) => <span className="line-clamp-2 text-[12px] text-secondary">{follow.whyEn}</span> },
          {
            key: "pick",
            header: t("columns.pick"),
            cell: (follow) => {
              const picked = follow.pickedAt !== null;
              const full = !picked && pickCount >= MAX_PICKS;
              return (
                // The tick is its own action: it must not open the entry's page.
                <span onClick={(event) => event.stopPropagation()} className="inline-flex">
                  <Checkbox
                    label={t("pickLabel", { name: follow.name })}
                    labelHidden
                    checked={picked}
                    disabled={full || pickAction.isBusy(follow._id)}
                    title={full ? t("pickFull", { max: MAX_PICKS }) : undefined}
                    onChange={(next) => void pickAction.run(() => setPick({ followId: follow._id, picked: next }), { key: follow._id, fallbackMessage: t("errors.pickFailed") })}
                  />
                </span>
              );
            },
          },
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
