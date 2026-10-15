"use client";

import type { ReactNode } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowUpRight, ChartLine, Globe, MousePointerClick, Search, TrendingUp } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import type { DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Switch } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { formatDate } from "@/src/lib/dates";
import { useShortScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";

export type WebsiteSourcesData = NonNullable<FunctionReturnType<typeof api.websiteSources.getWebsiteSources>>;
type SourceRow = WebsiteSourcesData["sources"][number];
type Key = "RANKINGS" | SourceRow["source"];

type Row = {
  key: Key;
  status: ReactNode;
  how: string | null;
  next: number | null;
  last: number | null;
  paid: boolean;
  control: ReactNode;
};

const ICON = "mt-0.5 h-4 w-4 shrink-0 text-secondary";
const ICONS: Record<Key, ReactNode> = {
  RANKINGS: <TrendingUp className={ICON} aria-hidden="true" />,
  SEARCH_CONSOLE: <Search className={ICON} aria-hidden="true" />,
  GOOGLE_ANALYTICS: <ChartLine className={ICON} aria-hidden="true" />,
  BING: <Globe className={ICON} aria-hidden="true" />,
  CLARITY: <MousePointerClick className={ICON} aria-hidden="true" />,
};

/** Where the company connects each free source, inside its own workspace. */
const CONNECTION_PATHS: Record<SourceRow["source"], string> = {
  SEARCH_CONSOLE: "search-console",
  GOOGLE_ANALYTICS: "analytics",
  BING: "bing-webmaster",
  CLARITY: "clarity",
};

/** A day in the reader's own format, short: "Thu 1 Oct". */
const day = (at: number) => formatDate(at, { options: { weekday: "short", day: "numeric", month: "short" } });

/**
 * "What Hakken collects" for one website (docs/plans/active/website-schedules-plan.md,
 * WS1–WS5): a row per source, each with its status, how often, the next and
 * the last collection, its cost and its own switch, which acts at once. A
 * source not connected offers Connect instead: the company connects it from
 * its own workspace, so the link switches into it first. The rows and
 * columns; the page draws the table under its own header.
 */
export function useWebsiteSources(data: WebsiteSourcesData, companyWebsiteId: Id<"companyWebsites">) {
  const t = useTranslations("admin.siteView.schedulesPage.sources");
  const short = useShortScheduleSummary();
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const setSourceOn = useMutation(api.websiteSources.setSourceOn);
  const setRankingsOn = useMutation(api.websiteSources.setRankingsOn);
  const impersonate = useMutation(api.users.impersonateCompany);
  const action = useAdminAction({ scope: "admin-website-sources" });

  const name = (key: Key) => t(`names.${key}`);
  const company = data.companyName;

  const flip = (key: Key, on: boolean) => action.run(
    () => (key === "RANKINGS"
      ? setRankingsOn({ companyWebsiteId, on })
      : setSourceOn({ companyWebsiteId, source: key, on })),
    { suppressErrorToast: true, fallbackMessage: t("errors.switchFailed") },
  );

  const connect = (source: SourceRow["source"]) => action.run(
    async () => {
      await impersonate({ companyId: data.companyId });
      router.push(`/app/${CONNECTION_PATHS[source]}/${companyWebsiteId}/connection`);
    },
    { suppressErrorToast: true, fallbackMessage: t("errors.connectFailed", { company }) },
  );

  const toggle = (key: Key, checked: boolean) => (
    <Switch
      label={t("switchTip", { source: name(key), host: data.host })}
      checked={checked}
      disabled={action.isBusy()}
      onChange={(next) => void flip(key, next)}
    />
  );

  const linkTo = (source: SourceRow["source"], words: string) => (
    <Button
      variant="ghost"
      title={t("connectTip", { company, source: name(source) })}
      disabled={action.isBusy()}
      onClick={() => void connect(source)}
      className="inline-flex items-center gap-1.5 whitespace-nowrap p-0 text-[12px] font-normal hover:bg-transparent"
    >
      {words}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Button>
  );

  const rankings = data.rankings;
  const rankingsStatus = !data.companyOn
    ? <StatusLabel tone="warning">{t("status.companyOff", { company })}</StatusLabel>
    : !rankings.on
      ? <StatusLabel tone="neutral">{t("status.off")}</StatusLabel>
      : rankings.collecting
        ? <StatusLabel tone="success">{t("status.collecting")}</StatusLabel>
        : <StatusLabel tone="warning">{t("status.notScheduled")}</StatusLabel>;

  const rows: Row[] = [
    {
      key: "RANKINGS",
      status: rankingsStatus,
      how: rankings.pairedWith
        ? t("pairedWith", { host: rankings.pairedWith.displayHost })
        : rankings.intervalStr ? short(rankings.intervalStr) : null,
      next: rankings.nextRunAt,
      last: rankings.lastCollectedAt,
      paid: true,
      control: toggle("RANKINGS", rankings.on),
    },
    ...data.sources.map((source): Row => {
      const connected = source.state === "CONNECTED";
      const status = source.state === "NOT_CONNECTED"
        ? <StatusLabel tone="info">{t("status.notConnected")}</StatusLabel>
        : source.state === "SETTING_UP"
          ? <StatusLabel tone="info" icon="waiting">{t("status.settingUp")}</StatusLabel>
          : source.state === "CONNECT_AGAIN"
            ? <StatusLabel tone="warning">{t("status.connectAgain")}</StatusLabel>
            : !source.on
              ? <StatusLabel tone="neutral">{t("status.off")}</StatusLabel>
              : source.scheduled
                ? <StatusLabel tone="success">{t("status.collecting")}</StatusLabel>
                : <StatusLabel tone="warning">{t("status.notScheduled")}</StatusLabel>;
      const control = connected
        ? toggle(source.source, source.on)
        : linkTo(source.source, t(source.state === "NOT_CONNECTED" ? "connect" : source.state === "SETTING_UP" ? "finish" : "reconnect"));
      return {
        key: source.source,
        status,
        how: source.intervalStr ? short(source.intervalStr) : null,
        next: source.nextRunAt,
        last: source.lastCollectedAt,
        paid: false,
        control,
      };
    }),
  ];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "source",
      header: t("columns.source"),
      className: "w-[32%]",
      cell: (row) => (
        <span className="flex items-start gap-3">
          {ICONS[row.key]}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[13px] font-medium text-foreground">{name(row.key)}</span>
            <span className="text-[12px] leading-snug text-muted">{t(`gives.${row.key}`)}</span>
          </span>
        </span>
      ),
    },
    { key: "status", header: t("columns.status"), cell: (row) => row.status },
    {
      key: "how",
      header: t("columns.howOften"),
      cell: (row) => (row.how ? <span className="whitespace-nowrap text-[13px] text-secondary">{row.how}</span> : <NoFigure />),
    },
    {
      key: "next",
      header: t("columns.next"),
      cell: (row) => (row.next ? <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-foreground">{day(row.next)}</span> : <NoFigure />),
    },
    {
      key: "last",
      header: t("columns.last"),
      cell: (row) => (row.last ? <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-secondary">{day(row.last)}</span> : <NoFigure />),
    },
    { key: "cost", header: t("columns.cost"), cell: (row) => <TagLabel>{t(row.paid ? "cost.paid" : "cost.free")}</TagLabel> },
    { key: "on", header: t("columns.on"), cell: (row) => row.control },
  ];

  return {
    rows,
    columns,
    /** A switch that failed, said under the table. */
    error: action.error,
    note: data.owned ? t("noteOwned", { platformName }) : t("noteCompetitor", { company, platformName }),
    showing: (count: number) => t("showing", { count }),
    empty: t("empty"),
  };
}
