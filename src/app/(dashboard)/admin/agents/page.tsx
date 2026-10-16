"use client";

import { useQuery, useMutation } from "convex/react";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { api } from "@/convex/_generated/api";
import { lazy, Suspense, useState } from "react";
import type { Doc } from "@/convex/_generated/dataModel";
import { Bot, Workflow, Plus, Trash2, Settings } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  AGENT_RUN_KINDS,
  AGENT_WORK_KINDS,
  agentWorkOf,
  type AgentRunKind,
  type AgentWork,
  type AgentWorkKind,
} from "@/convex/utils/agentWork";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { SectionMenu } from "../../app/_components/SectionMenu";
import { CUT_COLUMN } from "../../app/sites/_components/SiteCells";
import { useSiteSearch } from "../../app/sites/_components/useSiteParam";
import { useScheduleSummary } from "../_lib/useScheduleSummary";

type Agent = Doc<"agents">;
type Status = "working" | "active" | "draft";
const STATUSES: readonly Status[] = ["working", "active", "draft"];
/** One agent as the list shows it: what it does, when it runs, and its status now. */
type Row = { agent: Agent; work: AgentWork; runs: string; status: Status };
type Filters = { what: "all" | AgentWorkKind; when: "all" | AgentRunKind; status: "all" | Status };

const loadAgentDeleteDialog = () => import("./AgentDeleteDialog");
const AgentDeleteDialog = lazy(() =>
  loadAgentDeleteDialog().then((module) => ({ default: module.AgentDeleteDialog })),
);

/** A choice from the address, or every one. */
const chosen = <Value extends string>(raw: string | null, allowed: readonly Value[]): Value | "all" =>
  raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as Value) : "all";

/**
 * Agents (docs/plans/active/agents-and-clarity-plan.md, Part 5; drawn on the
 * Hakken — Agents canvas and liked 2026-10-16, after Conterra's agents list):
 * the filters down the left — what an agent does, when it runs, its status —
 * each with its count, following the other choices; then the list itself,
 * every agent's work and when it runs read from its role (`agentWork.ts`) and
 * the Schedules page's own rows, 15 a page. The choices stay in the address.
 *
 * The list is narrowed and paged on the server (`agents.getPaginatedAgents`),
 * as every admin inventory is; the counts beside each choice and the exact
 * total come from one small query beside it (`agentInventory.getAgentFilterCounts`).
 */
export default function AgentsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = useTranslations("admin.agents");
  const scheduleSummary = useScheduleSummary();
  const schedules = useQuery(api.scheduler.getSchedules);
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "agent" });
  const activeModels = activeModelsData || [];
  // Asked once for the whole page, not once per row.
  const inheritedModels = useQuery(api.agents.getInheritedAgentModels);
  // Live, so the list changes while an agent works instead of saying
  // "Active" identically for a working agent and an idle one.
  const workingAgentIds = useQuery(api.agentRuns.getWorkingAgentIds);
  const deleteAgent = useMutation(api.agents.deleteAgent);
  const action = useAdminAction({ scope: "admin-agents-delete" });

  const [search, setSearch, term] = useSiteSearch();
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);
  const [deleteDialogActivated, setDeleteDialogActivated] = useState(false);

  const filters: Filters = {
    what: chosen(params.get("what"), AGENT_WORK_KINDS),
    when: chosen(params.get("when"), AGENT_RUN_KINDS),
    status: chosen(params.get("status"), STATUSES),
  };

  /** When the agent runs, in words: its row on the Schedules page, the timer it runs on, or what sets it off. */
  const runsOf = (work: AgentWork, schedule: { intervalStr: string; isActive: boolean } | undefined): string => {
    if (schedule) {
      const words = scheduleSummary(schedule.intervalStr);
      return schedule.isActive ? words : t("runs.paused", { schedule: words });
    }
    const timer = work.timer;
    if (timer && "every" in timer) {
      if (timer.every.minutes) return t("runs.everyMinutes", { minutes: timer.every.minutes });
      return timer.every.hours === 1 ? t("runs.everyHour") : t("runs.everyHours", { hours: timer.every.hours ?? 0 });
    }
    const clock = (hour: number, minute: number) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (timer && "daily" in timer) return t("runs.daily", { time: clock(timer.daily.hourUTC, timer.daily.minuteUTC) });
    if (timer && "monthly" in timer) return t("runs.monthly", { day: timer.monthly.day, time: clock(timer.monthly.hourUTC, timer.monthly.minuteUTC) });
    if (work.when === "team") return t("runs.team");
    if (work.when === "never") return t("runs.never");
    if (work.when === "schedule") return t("runs.noSchedule");
    return t(`runs.${work.trigger ?? "asked"}`);
  };

  const scheduleOf = new Map((schedules ?? []).filter((schedule) => schedule.agentId).map((schedule) => [schedule.agentId as string, schedule]));
  const working = new Set<string>(workingAgentIds ?? []);
  const rowOf = (agent: Agent): Row => {
    const schedule = scheduleOf.get(agent._id);
    const work = agentWorkOf(agent.systemKey, Boolean(schedule));
    return { agent, work, runs: runsOf(work, schedule), status: working.has(agent._id) ? "working" : agent.isActive ? "active" : "draft" };
  };

  // Narrowed and paged on the server, 15 a page; the counts beside each choice, and the exact total, asked once beside it.
  const asked = {
    searchTerm: term || undefined,
    ...(filters.what !== "all" ? { what: filters.what } : {}),
    ...(filters.when !== "all" ? { when: filters.when } : {}),
    ...(filters.status !== "all" ? { status: filters.status } : {}),
  };
  const agents = useServerPagedTable(api.agents.getPaginatedAgents, asked, TABLE_PAGE_SIZE, { fill: true });
  const counts = useQuery(api.agentInventory.getAgentFilterCounts, asked);
  const pageRows = agents.isLoading ? undefined : agents.rows.map(rowOf);
  const total = counts?.total ?? agents.loadedCount;
  const totalPages = counts ? Math.max(1, Math.ceil(counts.total / TABLE_PAGE_SIZE)) : agents.totalPages;

  const hrefWith = (key: keyof Filters, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === "all") next.delete(key);
    else next.set(key, value);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  /** A choice's count, and "+" when the counts reached the catalogue's limit. */
  const countFor = (key: keyof Filters, value: string) => {
    if (!counts) return null;
    const count = counts[key][value] ?? 0;
    return `${count}${counts.capped ? "+" : ""}`;
  };
  const group = (key: keyof Filters, values: readonly string[], label: (value: string) => string) => ({
    id: key,
    label: t(`filters.${key}`),
    items: ["all", ...values]
      // "Your own agents" appears once there is one, or while it is the choice.
      .filter((value) => key !== "what" || value !== "own" || filters.what === "own" || (counts?.what.own ?? 0) > 0)
      .map((value) => ({ id: `${key}:${value}`, label: label(value), href: hrefWith(key, value), count: countFor(key, value) })),
  });
  const chosenLabels = [
    filters.what !== "all" ? t(`what.${filters.what}`) : null,
    filters.when !== "all" ? t(`when.${filters.when}`) : null,
    filters.status !== "all" ? t(`statusFilter.${filters.status}`) : null,
  ].filter(Boolean);

  /**
   * What this agent actually runs. The runtime applies an agent's own model
   * only when its mode is "override"; an inheriting agent runs the platform's
   * default, named here, never a stored model it does not touch.
   */
  const describeAgentModel = (agent: Agent): { model: string; inherited: boolean } => {
    if (agent.modelSelectionMode === "override") {
      const ownModel = activeModels.find((model) => model.modelId === agent.modelId);
      return { model: ownModel?.friendlyName || ownModel?.displayName || agent.modelId, inherited: false };
    }
    const inherited = agent.workflowId ? inheritedModels?.workflow : inheritedModels?.agent;
    if (!inheritedModels) return { model: "", inherited: false };
    return inherited ? { model: inherited.displayName, inherited: true } : { model: t("table.platformDefaultNotSet"), inherited: false };
  };

  // Creating an agent is its own screen, not a box over this one: it collects
  // ten fields, and work typed into a modal is lost to a stray backdrop click.
  const handleOpenAdd = () => router.push("/admin/agents/new");

  const confirmDelete = async () => {
    if (!deletingAgent) return;
    const outcome = await action.run(() => deleteAgent({ id: deletingAgent._id }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.delete"),
    });
    if (outcome.ok) setDeletingAgent(null);
  };

  const openDelete = (agent: Agent) => {
    void loadAgentDeleteDialog();
    setDeleteDialogActivated(true);
    setDeletingAgent(agent);
  };

  const isLoading = agents.isLoading || activeModelsData === undefined;
  const footer = {
    mode: "paged" as const,
    page: agents.page,
    totalPages,
    totalCount: total,
    pageSize: TABLE_PAGE_SIZE,
    isLoading: agents.isBusy,
    onPageChange: agents.goToPage,
    labels: {
      empty: t("table.noneMatch"),
      showing: (start: number, end: number, count: number) => t("table.showing", { start, end, total: count }),
    },
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        divider
        icon={<Workflow className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={
          <PagePrimaryAction variant="brand" icon={<Plus className="w-4 h-4" />} onClick={handleOpenAdd}>
            {t("new")}
          </PagePrimaryAction>
        }
      />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-4 lg:self-start">
          <SectionMenu
            label={t("filters.label")}
            groups={[
              group("what", AGENT_WORK_KINDS, (value) => t(`what.${value}`)),
              group("when", AGENT_RUN_KINDS, (value) => t(`when.${value}`)),
              group("status", ["active", "working", "draft"], (value) => t(`statusFilter.${value}`)),
            ]}
            currentId=""
            currentIds={[`what:${filters.what}`, `when:${filters.when}`, `status:${filters.status}`]}
            openAtFirst={["what", "when", "status"]}
          />
          <p className="hidden px-3 pt-4 text-[12px] text-muted lg:block">{t("filters.kept")}</p>
        </aside>

        <section className="flex min-w-0 flex-col gap-3">
          <DataTable
            rows={isLoading ? undefined : pageRows}
            rowKey={(row) => row.agent._id}
            search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
            onRowClick={(row) => router.push(`/admin/agents/${row.agent._id}`)}
            cardHeader={<TableBar footer={footer} noun="agents" title={chosenLabels.length ? chosenLabels.join(" · ") : t("table.allAgents")} />}
            empty={{ icon: <Bot className="w-8 h-8 text-muted/30" />, label: term || chosenLabels.length ? t("table.noneMatch") : t("table.empty") }}
            footer={footer}
            columns={[
              {
                key: "agent",
                header: t("table.agent"),
                className: CUT_COLUMN.first,
                cell: (row) => (
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="font-medium text-[13px] text-foreground leading-tight">{row.agent.name}</span>
                    {row.agent.description ? (
                      <span className="truncate text-[12px] text-secondary" title={row.agent.description}>{row.agent.description}</span>
                    ) : null}
                  </div>
                ),
              },
              { key: "what", header: t("table.whatItDoes"), cell: (row) => <TagLabel>{t(`what.${row.work.what}`)}</TagLabel> },
              { key: "runs", header: t("table.runs"), cell: (row) => <span className="text-[12px] text-secondary">{row.runs}</span> },
              {
                key: "model",
                header: t("table.model"),
                cell: (row) => {
                  // Not lowercased: a published model name such as
                  // "MoonshotAI: Kimi K3" is not the platform's to restyle.
                  const { model, inherited } = describeAgentModel(row.agent);
                  return (
                    <span className="flex flex-col">
                      <span className="whitespace-nowrap text-[12px] text-foreground/85">{model}</span>
                      {inherited ? <span className="text-[11px] text-muted">{t("table.platformDefault")}</span> : null}
                    </span>
                  );
                },
              },
              {
                key: "status",
                header: t("table.status"),
                cell: (row) => (
                  <StatusLabel tone={row.status === "working" ? "info" : row.status === "active" ? "success" : "neutral"} icon={row.status === "working" ? "working" : undefined}>
                    {row.status === "working" ? t("table.working") : row.status === "active" ? t("table.active") : t("table.draft")}
                  </StatusLabel>
                ),
              },
              {
                key: "actions",
                header: t("table.actions"),
                align: "right",
                cell: (row) => (
                  <RowActions>
                    <RowIconButton navigates label={t("table.configure")} onClick={() => router.push(`/admin/agents/${row.agent._id}`)}>
                      <Settings className="w-4 h-4" />
                    </RowIconButton>
                    {/* An agent holding a role is switched off, never deleted (`agents.deleteAgent` refuses it), so only one a person made offers it. */}
                    {row.agent.systemKey ? null : (
                      <RowIconButton label={t("buttons.delete")} tone="danger" onClick={() => openDelete(row.agent)}>
                        <Trash2 className="w-4 h-4" />
                      </RowIconButton>
                    )}
                  </RowActions>
                ),
              },
            ]}
          />
        </section>
      </div>

      {deleteDialogActivated && (
        <Suspense fallback={null}>
          <AgentDeleteDialog
            agentName={deletingAgent?.name ?? ""}
            isOpen={Boolean(deletingAgent)}
            isSubmitting={action.isBusy()}
            error={action.error ?? ""}
            onClose={() => {
              setDeletingAgent(null);
              action.clearError();
            }}
            onConfirm={confirmDelete}
          />
        </Suspense>
      )}
    </div>
  );
}
