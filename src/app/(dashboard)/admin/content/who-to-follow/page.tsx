"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Edit2, Plus, Trash2, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import type { FollowKind } from "@/convex/newsSchema";
import useDebounce from "@/src/hooks/useDebounce";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable, type DataTableSort } from "@/src/ui/components/screens/DataTable";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { useContentDelete } from "../_components/useContentDelete";
import { TopicSelect, topicNameIn, useTopicChoices } from "../_components/TopicSelect";
import { XConnectionPanel } from "./XConnectionPanel";

type FollowPage = FunctionReturnType<typeof api.newsFollows.listFollowsForAdmin>;
type Follow = FollowPage["rows"][number];
type SortKey = "name" | "topic" | "collected" | "inKnowledge" | "newest";

const BASE = "/admin/content/who-to-follow";
const KINDS: FollowKind[] = ["WEBSITE", "YOUTUBE", "X", "LINKEDIN"];
/** "Our picks" (insights-helpful-content-plan.md, IH14): the server refuses a fifth. */
const MAX_PICKS = 4;
/** Each heading's first press: names and topics A to Z, numbers and days the most first. */
const FIRST_DIRECTION: Record<SortKey, "asc" | "desc"> = { name: "asc", topic: "asc", collected: "desc", inKnowledge: "desc", newest: "desc" };

/**
 * Admin → Content → Who to follow (docs/plans/active/content-people-
 * knowledge-plan.md, board 1): the people Hakken reads, one row each — their
 * channels, topic, how much they have brought into News and when — searched,
 * filtered and sorted by any heading over the whole list, on the server. A row
 * opens the person's page, where their channels and what they published are;
 * "Add a person" opens Add a person. Beneath the list, whether X can be read
 * and Anthony's own X bookmarks (moved here from News sources, C2).
 */
export default function WhoToFollowAdminPage() {
  const t = useTranslations("admin.newsFollows");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const picks = useQuery(api.newsFollows.listPicksForAdmin, {});
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
  const [channel, setChannel] = useState("");
  const [topic, setTopic] = useState("");
  const [show, setShow] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "name", direction: "asc" });
  const [page, setPage] = useState(1);
  const searched = useDebounce(search, 300).trim();
  const args = {
    ...(searched ? { search: searched } : {}),
    ...(channel ? { channel: channel as FollowKind } : {}),
    ...(topic ? { topic } : {}),
    ...(show === "PICKS" ? { picks: true } : {}),
    sort: sort.key,
    direction: sort.direction,
  };
  const listKey = JSON.stringify(args);
  const answer = useQuery(api.newsFollows.listFollowsForAdmin, { ...args, page, rows: TABLE_PAGE_SIZE });
  // While the next page or order loads, the last one stays on screen rather than a blank table.
  const [held, setHeld] = useState<{ listKey: string; result: FollowPage } | null>(null);
  if (answer !== undefined && (held?.result !== answer || held.listKey !== listKey)) setHeld({ listKey, result: answer });
  const shown = answer ?? (held?.listKey === listKey ? held.result : undefined);

  // A new search, filter or order starts at page one.
  const narrow = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };
  const tableSort: DataTableSort = {
    key: sort.key,
    direction: sort.direction,
    onSort: (pressed) => {
      const key = pressed as SortKey;
      setSort((current) => current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: FIRST_DIRECTION[key] });
      setPage(1);
    },
  };
  const pickCount = picks?.length ?? 0;
  const open = (follow: Follow) => router.push(`${BASE}/${follow._id}`);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        divider
        icon={<UserPlus className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle", { platformName })}
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
        rows={shown?.rows}
        rowKey={(follow) => follow._id}
        onRowClick={open}
        sort={tableSort}
        search={{ value: search, onChange: narrow(setSearch), placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("filters.channel"), choice: channel ? t(`kinds.${channel}`) : null }} value={channel} onChange={narrow(setChannel)} aria-label={t("filters.channel")}>
              <option value="">{t("filters.allChannels")}</option>
              {KINDS.map((entry) => (
                <option key={entry} value={entry}>{t(`kinds.${entry}`)}</option>
              ))}
            </Select>
            <TopicSelect chip={{ label: t("filters.topic") }} value={topic} onChange={narrow(setTopic)} noneLabel={t("filters.allTopics")} aria-label={t("filters.topic")} />
            <Select chip={{ label: t("filters.show"), choice: show ? t("filters.picks") : null }} value={show} onChange={narrow(setShow)} aria-label={t("filters.show")}>
              <option value="">{t("filters.everyone")}</option>
              <option value="PICKS">{t("filters.picks")}</option>
            </Select>
          </>
        }
        cardHeader={<TableBar footer={{ isLoading: shown === undefined, totalCount: shown?.total ?? 0 }} noun="people" />}
        empty={{ icon: <UserPlus className="h-8 w-8 text-muted/30" />, label: searched || channel || topic || show ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: shown?.page ?? page,
          totalPages: shown?.pages ?? 1,
          totalCount: shown?.total ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: answer === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "name",
            header: t("columns.person"),
            sortable: true,
            cell: (follow) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-foreground">{follow.name}</span>
                <span className="line-clamp-2 text-[12px] text-secondary">{follow.whyEn}</span>
              </span>
            ),
          },
          {
            key: "channels",
            header: t("columns.channels"),
            cell: (follow) => (
              <span className="flex flex-wrap gap-x-3 gap-y-1">
                {follow.channelKinds.map((kind, index) => <TagLabel key={`${kind}-${index}`}>{t(`kinds.${kind}`)}</TagLabel>)}
              </span>
            ),
          },
          {
            key: "topic",
            header: t("columns.topic"),
            sortable: true,
            cell: (follow) => (topicNameIn(topicChoices, follow.topic) ? <TagLabel>{topicNameIn(topicChoices, follow.topic)}</TagLabel> : <NoFigure />),
          },
          {
            key: "collected",
            header: t("columns.collected"),
            align: "right",
            sortable: true,
            cell: (follow) => <span className="font-mono text-[12px] tabular-nums">{follow.collected.toLocaleString("en-GB")}</span>,
          },
          {
            key: "inKnowledge",
            header: t("columns.inKnowledge"),
            align: "right",
            sortable: true,
            cell: (follow) => <span className="font-mono text-[12px] tabular-nums">{follow.inKnowledge.toLocaleString("en-GB")}</span>,
          },
          {
            key: "newest",
            header: t("columns.newest"),
            sortable: true,
            cell: (follow) => (follow.newestAt ? <span className="text-[12px] text-secondary">{formatDate(follow.newestAt)}</span> : <NoFigure />),
          },
          {
            key: "pick",
            header: t("columns.pick"),
            cell: (follow) => {
              const picked = follow.pickedAt !== null;
              const full = !picked && pickCount >= MAX_PICKS;
              return (
                // The tick is its own action: it must not open the person's page.
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
          {
            key: "actions",
            header: t("columns.actions"),
            align: "right",
            cell: (follow) => (
              <RowActions>
                <RowIconButton label={t("edit", { name: follow.name })} navigates onClick={() => router.push(`${BASE}/${follow._id}/edit`)}>
                  <Edit2 className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={t("delete", { name: follow.name })} tone="danger" onClick={() => remover.askDelete(follow)}>
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      {/* It reads how an X sign-in came back from the address, so it waits for it. */}
      <Suspense fallback={null}>
        <XConnectionPanel />
      </Suspense>

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
