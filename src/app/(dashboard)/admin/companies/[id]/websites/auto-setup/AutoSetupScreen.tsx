"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Layers, Wand2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { SiteMark } from "@/src/app/(dashboard)/app/sites/_components/SiteMark";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useToast } from "@/src/context/ToastContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatTime } from "@/src/lib/dates";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Meter } from "@/src/ui/components/screens/Meter";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TABLE_PAGE_SIZE, matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { SECTION_ICONS } from "../_components/websitesSection";
import { dollars } from "../money";

type Status = NonNullable<FunctionReturnType<typeof api.autoSetupStart.autoSetupStatus>>;
type Row = Status["rows"][number];
type Box = Row["names"];

/**
 * Auto Setup's own page, under Setup (docs/plans/active/auto-setup-plan.md,
 * boards 1–3 as redrawn on 2026-10-19 after "this looks nasty"): the page's
 * one orange action, Run Auto Setup, in its header; one box saying what is
 * empty and what a run does at most — or, while it runs, how far it has got,
 * with a bar that moves with each piece of work and what it is doing now, and
 * once done, what it cost and what is left for a person; then every setup
 * box, a row for the company and one for each website, saying who filled it.
 */
export function AutoSetupScreen({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("admin.autoSetup");
  const tSection = useTranslations("admin.websitesSection");
  const { platformName } = useSystemSettings();
  const locale = useLocale();
  const router = useRouter();
  const { showToast } = useToast();
  const status = useQuery(api.autoSetupStart.autoSetupStatus, { companyId });
  const start = useMutation(api.autoSetupStart.startAutoSetup);
  const action = useAdminAction({ scope: "admin-auto-setup" });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // British English for English: "a, b and c", "16:42" — as Hakken writes everywhere; dollars as this section writes them.
  const region = locale === "en" ? "en-GB" : locale;
  const join = (items: string[]) => new Intl.ListFormat(region, { type: "conjunction" }).format(items);
  const Icon = SECTION_ICONS.autoSetup;

  const run = status?.run ?? null;
  const working = run?.status === "WORKING";
  const press = async () => {
    const outcome = await action.run(() => start({ companyId }), { key: "start", suppressErrorToast: true, fallbackMessage: t("failed") });
    if (outcome.ok) showToast(t(`outcomes.${outcome.data}`), outcome.data === "STARTED" ? "success" : "info");
  };

  const rows = status?.rows;
  const company = rows?.find((row) => row.kind === "COMPANY")?.name ?? "";
  const matching = (rows ?? []).filter((row) => matchesSearchTerm(search, [row.name, row.against]));
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);

  const box = (state: Box, count = 0) => {
    if (state === "NONE") return <NoFigure />;
    if (state === "EMPTY") return <StatusLabel tone="warning">{t("box.EMPTY")}</StatusLabel>;
    if (state === "PERSON") return <StatusLabel tone="success">{t("box.PERSON")}</StatusLabel>;
    if (state === "WRITING") return <StatusLabel tone="neutral">{t("box.WRITING")}</StatusLabel>;
    return <StatusLabel tone="info">{count > 0 ? t("box.HAKKEN_COUNT", { count, platformName }) : t("box.HAKKEN", { platformName })}</StatusLabel>;
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Icon className="h-6 w-6 text-brand" />}
        title={tSection("pages.autoSetup")}
        description={t("pageSubtitle", { company })}
        action={status ? (
          <PagePrimaryAction
            variant="brand"
            icon={<Wand2 className="h-4 w-4" />}
            disabled={working || status.readiness !== "ON" || action.isBusy("start")}
            onClick={() => void press()}
          >
            {working && run ? t("working", { done: run.done, total: run.total }) : t("run")}
          </PagePrimaryAction>
        ) : undefined}
      />

      {status ? <StatusNotices status={status} t={t} join={join} usd={dollars} time={(at) => formatTime(at, { locale: region, options: { hour: "2-digit", minute: "2-digit" } })} onSeeRun={(path) => router.push(path)} /> : null}
      {action.error ? <SaveError>{action.error}</SaveError> : null}

      <PageHeader icon={<Layers className="h-5 w-5 text-brand" />} title={t("table.title")} description={t("table.subtitle", { platformName })} />
      <DataTable
        rows={rows === undefined ? undefined : paged.items}
        rowKey={(row) => row.id}
        search={{
          value: search,
          onChange: (next) => {
            setSearch(next);
            setPage(1);
          },
          placeholder: t("table.search"),
        }}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: t("table.empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: rows === undefined,
          onPageChange: setPage,
          labels: { empty: t("table.empty") },
        }}
        columns={[
          {
            key: "website",
            header: t("table.columns.website"),
            cell: (row) => (
              <span className="flex min-w-0 items-center gap-3">
                {row.kind === "COMPANY" ? null : <SiteMark host={row.name} owned={row.kind === "OWN"} small={row.kind === "RIVAL"} />}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-medium text-foreground">{row.name}</span>
                  <span className="text-[12px] text-secondary">
                    {row.kind === "RIVAL" && row.against ? t("table.kind.RIVAL_OF", { host: row.against }) : t(`table.kind.${row.kind}`)}
                  </span>
                </span>
              </span>
            ),
          },
          { key: "names", header: t("table.columns.names"), cell: (row) => box(row.names, row.namesCount) },
          { key: "profile", header: t("table.columns.profile"), cell: (row) => box(row.profile) },
          { key: "searches", header: t("table.columns.searches"), cell: (row) => box(row.searches, row.searchesCount) },
          { key: "questions", header: t("table.columns.questions"), cell: (row) => box(row.questions, row.questionsCount) },
          { key: "countries", header: t("table.columns.countries"), cell: (row) => box(row.countries) },
        ]}
      />
    </div>
  );
}

type Words = ReturnType<typeof useTranslations<"admin.autoSetup">>;

/**
 * The box under the header: how far a run has got while it works (board 2);
 * once done, when, for what, and what is left for a person (board 3); why it
 * stopped or cannot start; and, while anything is empty, what is and what a
 * run does at most (board 1).
 */
function StatusNotices({ status, t, join, usd, time, onSeeRun }: {
  status: Status;
  t: Words;
  join: (items: string[]) => string;
  usd: (value: number) => string;
  time: (at: number) => string;
  onSeeRun: (path: string) => void;
}) {
  const run = status.run;
  if (run?.status === "WORKING") {
    // The bar moves with each piece of work — a page read, a web search, a rival's rankings, a box written — and the line under it says which.
    const doing = run.doing;
    return (
      <Notice>
        <span className="flex flex-col gap-2">
          <span>{t("runningLine", { done: run.done, total: run.total })}</span>
          <Meter value={run.pieces > 0 ? run.piecesDone / run.pieces : 0} size="md" />
          {doing ? (
            <span className="text-secondary">
              {t("now", { doing: t(`doing.${doing.what}`, { host: doing.host ?? "", at: doing.at ?? 0, of: doing.of ?? 0, count: doing.of ?? 0 }) })}
            </span>
          ) : null}
        </span>
      </Notice>
    );
  }

  const empties = (["names", "profile", "searches", "questions", "countries"] as const);
  const ownItems = status.rows
    .filter((row) => row.kind === "OWN")
    .flatMap((row) => {
      const parts = empties.filter((key) => row[key] === "EMPTY").map((key) => t(`parts.${key}`));
      return parts.length > 0 ? [{ host: row.name, parts }] : [];
    });
  const companyEmpty = status.rows.some((row) => row.kind === "COMPANY" && row.profile === "EMPTY");
  const rivalsEmpty = status.rows.filter((row) => row.kind === "RIVAL" && row.names === "EMPTY").length;
  const boxes = ownItems.reduce((total, item) => total + item.parts.length, 0) + (companyEmpty ? 1 : 0) + rivalsEmpty;
  const items = [
    ...ownItems.map((item) => t("emptyOwn", { host: item.host, parts: join(item.parts) })),
    ...(companyEmpty ? [t("emptyCompany")] : []),
    ...(rivalsEmpty > 0 ? [t("emptyRivals", { count: rivalsEmpty })] : []),
  ];
  const limits = status.limits;
  const explained = boxes > 0
    ? `${t("emptySummary", { count: boxes, list: join(items) })} ${t("limits", {
      pages: limits.pages,
      webSearches: limits.webSearches,
      searches: limits.searches,
      questions: limits.questions,
      runCap: usd(limits.runCapUsd),
      dayCap: usd(limits.dayCapUsd),
    })}`
    : null;

  return (
    <>
      {status.readiness === "AGENT_OFF" ? <Notice tone="warning">{t("agentOff")}</Notice> : null}
      {status.readiness === "DAY_CAP" ? <Notice tone="warning">{t("dayCap")}</Notice> : null}
      {run?.status === "DONE" ? (
        <Notice
          action={run.agentRunId && status.agentId ? (
            <Button variant="quiet" onClick={() => onSeeRun(`/admin/agents/${status.agentId}/observability/${run.agentRunId}`)}>{t("seeRun")}</Button>
          ) : undefined}
        >
          {[
            run.finishedAt !== null ? t("doneLine", { time: time(run.finishedAt), cost: usd(run.costUsd) }) : "",
            run.forPerson.length > 0 ? t("left", { items: join(run.forPerson.map((code) => t(`forPerson.${code}`))) }) : "",
          ].filter(Boolean).join(" ")}
        </Notice>
      ) : null}
      {run?.status === "STOPPED" && run.stopped ? <Notice tone="warning">{t("stopped", { reason: run.stopped })}</Notice> : null}
      {explained ? <Notice>{explained}</Notice> : null}
      {!explained && !run ? <Notice>{t("nothingEmpty")}</Notice> : null}
    </>
  );
}
