"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowUpRight, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import useDebounce from "@/src/hooks/useDebounce";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Field } from "@/src/ui/components/screens/Field";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { AddBar } from "../../companies/[id]/websites/_components/AddBar";
import { ContentDeleteDialog } from "../_components/ContentDialogs";
import { KnowledgeTick, WordsKept } from "../_components/KnowledgeTick";
import { useContentDelete } from "../_components/useContentDelete";
import { topicNameIn, useTopicChoices } from "../_components/TopicSelect";

type Channel = FunctionReturnType<typeof api.followChannels.listChannelsForAdmin>[number];
type ItemChannel = "WEBSITE" | "YOUTUBE" | "X";

const BASE = "/admin/content/who-to-follow";
const ITEM_CHANNELS: ItemChannel[] = ["WEBSITE", "YOUTUBE", "X"];

/**
 * A person in "Who to follow" (docs/plans/active/content-people-knowledge-
 * plan.md, board 2, C2, C3): who they are and why, their figures, their
 * channels — each with its Collect tick and what the News Collector last made
 * of it, more added by hand — and what their channels brought into News,
 * newest first. Edit details opens their editing page.
 */
export function PersonPage({ followId }: { followId: Id<"newsFollows"> }) {
  const t = useTranslations("admin.newsFollows");
  const router = useRouter();
  const follow = useQuery(api.newsFollows.getFollow, { followId });
  const channels = useQuery(api.followChannels.listChannelsForAdmin, { followId });
  const topicChoices = useTopicChoices();

  if (follow === undefined) return <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  if (follow === null) return <HakkenEmptyState icon={UserRound} title={t("back")} description={t("person.missing")} />;

  const collecting = (channels ?? []).filter((channel) => channel.status === "COLLECTING").length;
  const shownOnly = (channels ?? []).filter((channel) => channel.status === "LINKEDIN").length;
  const topicName = topicNameIn(topicChoices, follow.topic);

  return (
    <div className="flex flex-col gap-5">
      <DetailHeader
        back={{ label: t("back"), href: BASE }}
        icon={<UserRound className="h-6 w-6 text-brand" />}
        title={follow.name}
        description={follow.whyEn}
        pills={
          <>
            {channels === undefined ? null : collecting > 0 ? (
              <StatusLabel tone="success">{t("person.collectingFrom", { count: collecting, total: channels.length })}</StatusLabel>
            ) : (
              <StatusLabel tone="neutral">{t("person.collectingNone")}</StatusLabel>
            )}
            {follow.pickedAt !== null ? <StatusLabel tone="info" icon="pinned">{t("person.picked")}</StatusLabel> : null}
            {topicName ? <TagLabel>{topicName}</TagLabel> : null}
          </>
        }
        action={
          <Button variant="quiet" onClick={() => router.push(`${BASE}/${followId}/edit`)}>
            <Pencil className="mr-1.5 inline h-3.5 w-3.5" aria-hidden="true" />
            {t("person.editDetails")}
          </Button>
        }
      />

      <FigureRow>
        <Figure
          label={t("person.figures.channels")}
          value={channels?.length ?? "…"}
          detail={<span className="text-secondary">{t("person.figures.channelsDetail", { collecting, shown: shownOnly })}</span>}
        />
        <Figure
          label={t("person.figures.collected")}
          value={follow.collected.toLocaleString("en-GB")}
          detail={<span className="text-secondary">{t("person.figures.added", { when: formatDate(follow.createdAt) })}</span>}
        />
        <Figure
          label={t("columns.inKnowledge")}
          value={follow.inKnowledge.toLocaleString("en-GB")}
          emphasis
        />
        <Figure
          label={t("person.figures.newest")}
          value={follow.newestAt ? formatDate(follow.newestAt) : t("person.figures.newestNone")}
        />
      </FigureRow>

      <PersonChannels followId={followId} channels={channels} />
      <PersonItems followId={followId} collected={follow.collected} />
    </div>
  );
}

/** The person's channels: Collect ticks, what the collector made of each, added and removed by hand (board 2). */
function PersonChannels({ followId, channels }: { followId: Id<"newsFollows">; channels: Channel[] | undefined }) {
  const t = useTranslations("admin.newsFollows");
  const tKinds = useTranslations("admin.newsFollows.kinds");
  const addChannel = useMutation(api.followChannels.addChannel);
  const setCollect = useMutation(api.followChannels.setChannelCollect);
  const removeChannel = useMutation(api.followChannels.removeChannel);
  const action = useAdminAction({ scope: "admin-follow-channels" });
  const [adding, setAdding] = useState(false);
  const [address, setAddress] = useState("");
  const [addError, setAddError] = useState("");
  const remover = useContentDelete({
    scope: "admin-follow-channel-remove",
    remove: removeChannel,
    argsFor: (channel: Channel) => ({ channelId: channel._id }),
    deleteFailed: t("errors.channelFailed"),
  });

  const add = async () => {
    setAddError("");
    const done = await action.run(() => addChannel({ followId, address }), { suppressErrorToast: true, fallbackMessage: t("errors.channelFailed") });
    if (done.ok) {
      setAddress("");
      setAdding(false);
    } else if (done.message) setAddError(done.message);
  };

  const status = (channel: Channel) => {
    if (channel.status === "COLLECTING") return <StatusLabel tone="success">{t("person.channels.status.COLLECTING")}</StatusLabel>;
    if (channel.status === "PROBLEM") return <StatusLabel tone="warning" wrap>{t("person.channels.status.PROBLEM", { problem: channel.problem ?? "" })}</StatusLabel>;
    if (channel.status === "X_NOT_SET_UP") return <StatusLabel tone="warning">{t("person.channels.status.X_NOT_SET_UP")}</StatusLabel>;
    return <StatusLabel tone="neutral" wrap>{t(`person.channels.status.${channel.status}`)}</StatusLabel>;
  };

  return (
    <>
      {adding ? (
        <AddBar
          label={t("person.channels.addButton")}
          onAdd={() => void add()}
          disabled={!address.trim() || action.isBusy()}
          below={addError ? <p className="text-[12px] text-destructive">{addError}</p> : <p className="text-[11px] leading-relaxed text-muted">{t("person.channels.addHint")}</p>}
          after={<Button variant="ghost" onClick={() => { setAdding(false); setAddress(""); setAddError(""); }}>{t("person.channels.cancel")}</Button>}
        >
          <Field
            label={t("person.channels.addLabel")}
            labelHidden
            wrapperClassName="min-w-[260px] flex-1"
            inputMode="url"
            value={address}
            placeholder={t("person.channels.addPlaceholder")}
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && address.trim()) {
                event.preventDefault();
                void add();
              }
            }}
            autoFocus
          />
        </AddBar>
      ) : null}

      <DataTable
        rows={channels}
        rowKey={(channel) => channel._id}
        cardHeader={
          <TableBar
            footer={{ isLoading: channels === undefined, totalCount: channels?.length ?? 0 }}
            noun="channels"
            actions={
              adding ? null : (
                <Button variant="quiet" onClick={() => setAdding(true)}>
                  <Plus className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                  {t("person.channels.add")}
                </Button>
              )
            }
          >
            <span className="text-[12px] text-secondary">{t("person.channels.hint")}</span>
          </TableBar>
        }
        empty={{ icon: <UserRound className="h-8 w-8 text-muted/30" />, label: t("person.channels.hint") }}
        columns={[
          {
            key: "channel",
            header: t("person.channels.columns.channel"),
            cell: (channel) => <span className="text-[13px] font-medium text-foreground">{tKinds(channel.kind)}</span>,
          },
          {
            key: "address",
            header: t("person.channels.columns.address"),
            cell: (channel) => (
              <a href={channel.address} target="_blank" rel="noopener noreferrer" title={channel.address} className="block truncate text-[12px] text-info hover:underline">
                {channel.address.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            ),
          },
          {
            key: "collect",
            header: t("person.channels.columns.collect"),
            cell: (channel) => (
              <Checkbox
                label={t("person.channels.collectLabel", { address: channel.address })}
                labelHidden
                checked={channel.collect}
                disabled={channel.kind === "LINKEDIN" || action.isBusy(channel._id)}
                onChange={(next) => void action.run(() => setCollect({ channelId: channel._id, collect: next }), { key: channel._id, fallbackMessage: t("errors.channelFailed") })}
              />
            ),
          },
          { key: "status", header: t("person.channels.columns.status"), cell: status },
          {
            key: "lastRead",
            header: t("person.channels.columns.lastRead"),
            cell: (channel) => (channel.lastCheckedAt
              ? <span className="text-[12px] text-secondary">{formatDateTime(channel.lastCheckedAt)}</span>
              : <span className="text-[12px] text-muted">{channel.kind === "LINKEDIN" ? "–" : t("person.channels.never")}</span>),
          },
          {
            key: "found",
            header: t("person.channels.columns.found"),
            align: "right",
            cell: (channel) => <span className="font-mono text-[12px] tabular-nums">{channel.found.toLocaleString("en-GB")}</span>,
          },
          {
            key: "actions",
            header: t("person.channels.columns.actions"),
            align: "right",
            cell: (channel) => (
              <RowActions>
                <RowIconButton label={t("person.channels.remove")} tone="danger" onClick={() => remover.askDelete(channel)}>
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      <ContentDeleteDialog
        isOpen={remover.deleting !== null}
        title={t("person.channels.removeTitle")}
        warning={t("person.channels.removeWarning")}
        error={remover.error}
        isSubmitting={remover.isBusy}
        onClose={remover.closeDelete}
        onConfirm={remover.confirmDelete}
      >
        {t.rich("person.channels.removeConfirm", {
          address: remover.deleting?.address ?? "",
          highlight: (chunks) => <strong className="font-semibold text-foreground">{chunks}</strong>,
        })}
      </ContentDeleteDialog>
    </>
  );
}

/** What the person's channels brought into News, newest first, searched and narrowed on the server (board 2). */
function PersonItems({ followId, collected }: { followId: Id<"newsFollows">; collected: number }) {
  const t = useTranslations("admin.newsFollows");
  const tKinds = useTranslations("admin.newsFollows.kinds");
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const searched = useDebounce(search, 300).trim();
  const narrowed = Boolean(searched || channel);
  const pages = useServerPagedTable(api.newsFollows.listFollowItemsForAdmin, {
    followId,
    ...(searched ? { search: searched } : {}),
    ...(channel ? { channel: channel as ItemChannel } : {}),
    direction,
  }, TABLE_PAGE_SIZE, { fill: Boolean(channel) });
  // An exact total from the count kept as items arrive, whenever no search or filter narrows it.
  const total = narrowed ? pages.loadedCount : collected;

  return (
    <DataTable
      rows={pages.isLoading ? undefined : pages.rows}
      rowKey={(item) => item._id}
      sort={{ key: "published", direction, onSort: () => setDirection((current) => (current === "desc" ? "asc" : "desc")) }}
      search={{ value: search, onChange: setSearch, placeholder: t("person.items.searchPlaceholder") }}
      filters={
        <Select chip={{ label: t("person.items.filters.channel"), choice: channel ? tKinds(channel) : null }} value={channel} onChange={setChannel} aria-label={t("person.items.filters.channel")}>
          <option value="">{t("person.items.filters.allChannels")}</option>
          {ITEM_CHANNELS.map((entry) => <option key={entry} value={entry}>{tKinds(entry)}</option>)}
        </Select>
      }
      cardHeader={
        <TableBar footer={{ isLoading: pages.isLoading, totalCount: total }} noun="articles">
          <span className="text-[12px] text-secondary">{t("person.items.hint")}</span>
        </TableBar>
      }
      empty={{ icon: <UserRound className="h-8 w-8 text-muted/30" />, label: narrowed ? t("person.items.noMatch") : t("person.items.empty") }}
      footer={{
        mode: "paged",
        page: pages.page,
        totalPages: narrowed ? pages.totalPages : Math.max(1, Math.ceil(total / pages.pageSize)),
        totalCount: total,
        pageSize: pages.pageSize,
        isLoading: pages.isBusy,
        onPageChange: pages.goToPage,
      }}
      columns={[
        {
          key: "article",
          header: t("person.items.columns.article"),
          cell: (item) => (
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-foreground">{item.titleEn}</span>
              <span className="line-clamp-2 text-[12px] text-secondary">{item.summaryEn}</span>
            </span>
          ),
        },
        {
          key: "channel",
          header: t("person.items.columns.channel"),
          cell: (item) => <TagLabel>{item.kind === "GOOGLE_UPDATE" ? "Google" : tKinds(item.kind)}</TagLabel>,
        },
        {
          key: "published",
          header: t("person.items.columns.published"),
          sortable: true,
          cell: (item) => <span className="text-[12px] text-secondary">{formatDate(item.publishedAt)}</span>,
        },
        { key: "words", header: t("person.items.columns.words"), align: "right", cell: (item) => <WordsKept knowledge={item.knowledge} /> },
        {
          key: "inKnowledge",
          header: t("person.items.columns.inKnowledge"),
          cell: (item) => <KnowledgeTick itemId={item._id} title={item.titleEn} knowledge={item.knowledge} />,
        },
        {
          key: "actions",
          header: t("person.items.columns.actions"),
          align: "right",
          cell: (item) => (
            <RowActions>
              <RowIconButton label={t("person.items.open")} onClick={() => window.open(item.url, "_blank", "noopener,noreferrer")}>
                <ArrowUpRight className="h-4 w-4" />
              </RowIconButton>
            </RowActions>
          ),
        },
      ]}
    />
  );
}
