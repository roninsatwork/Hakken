"use client";

import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { DatabaseZap } from "lucide-react";
import { PaginationFooter } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import {
  describeInteractionType,
  describeRunStatus,
  describeTrigger,
  formatCount,
  formatDuration,
  formatMoney,
  formatRelativeTime,
  summariseLogContent,
  type LabelRef,
} from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import { classifyLogEntry, type LogCategory } from "@/convex/agentLogGroupingService";

type FilterKey = "ALL" | "THINKING" | "TOOLS" | "PROBLEMS";
type LogsData = FunctionReturnType<typeof api.agentLogs.getJobGroups>;

export function AgentLogsResults({
  data,
  hasSearch,
  filter,
  page,
  now,
  openEntryId,
  onToggleEntry,
  onOpenJob,
  onFocusFailure,
  onPageChange,
  renderOpenJob,
  renderEntryToggle,
  renderSeeOthers,
}: {
  data: LogsData;
  hasSearch: boolean;
  filter: FilterKey;
  page: number;
  now: number;
  openEntryId: string | null;
  onToggleEntry: (entryId: string) => void;
  onOpenJob: (runId: Id<"agentRuns">) => void;
  onFocusFailure?: (failureKey: string) => void;
  onPageChange: (page: number) => void;
  renderOpenJob: (props: { onClick: () => void; children: ReactNode }) => ReactNode;
  renderEntryToggle: (props: {
    isOpen: boolean;
    onClick: () => void;
    children: ReactNode;
  }) => ReactNode;
  renderSeeOthers: (props: { onClick: () => void; children: ReactNode }) => ReactNode;
}) {
  const t = useTranslations("admin.agents.details.logs.raw");
  const groups = data.groups;

  return (
    <>
      {groups.length === 0 ? (
        <EmptyLogs hasSearch={hasSearch} filter={filter} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <JobGroup
              key={group.runId ?? `${group.startedAt}-${group.entries[0]?._id}`}
              group={group}
              now={now}
              failureCounts={data.failureCounts}
              openEntryId={openEntryId}
              onToggleEntry={onToggleEntry}
              onOpenJob={onOpenJob}
              onFocusFailure={onFocusFailure}
              renderOpenJob={renderOpenJob}
              renderEntryToggle={renderEntryToggle}
              renderSeeOthers={renderSeeOthers}
            />
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <PaginationFooter
          page={page}
          totalPages={data.totalPages}
          totalCount={data.totalGroups}
          pageSize={TABLE_PAGE_SIZE}
          isLoading={false}
          onPageChange={onPageChange}
          labels={{
            previous: t("footer.previous"),
            next: t("footer.next"),
            empty: t("footer.empty"),
            page: (current, total) => t("footer.page", { current, total }),
            showing: (start, end, total) => t("footer.showing", { start, end, total }),
          }}
        />
      )}

      {data.windowTruncated && (
        <p className="text-[12px] text-muted">
          {t("truncated")}
        </p>
      )}
    </>
  );
}

function EmptyLogs({ hasSearch, filter }: { hasSearch: boolean; filter: FilterKey }) {
  const t = useTranslations("admin.agents.details.logs.raw");
  const message = hasSearch
    ? { title: t("empty.searchTitle"), body: t("empty.searchBody") }
    : filter === "PROBLEMS"
      ? { title: t("empty.problemsTitle"), body: t("empty.problemsBody") }
      : filter !== "ALL"
        ? { title: t("empty.kindTitle"), body: t("empty.kindBody") }
        : {
            title: t("empty.allTitle"),
            body: t("empty.allBody"),
          };

  return (
    <div className="w-full min-h-[280px] border border-border-dim bg-card rounded-[14px] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <DatabaseZap className="w-9 h-9 text-muted/40" />
      <div className="flex flex-col gap-1.5 items-center">
        <span className="text-[15px] font-semibold text-foreground tracking-tight">{message.title}</span>
        <span className="text-secondary text-[13px] max-w-md">{message.body}</span>
      </div>
    </div>
  );
}

type Group = {
  runId?: string;
  startedAt: number;
  lastAt: number;
  job: {
    objective: string;
    status: string;
    startedAt: number;
    completedAt?: number;
    costGBP?: number;
    triggerType: string;
  } | null;
  entries: Array<{
    _id: string;
    interactionType: string;
    promptContent: string;
    responseContent: string;
    outcome?: string;
    durationMs?: number;
    failureKey?: string;
    createdAt: number;
  }>;
};

function JobGroup({
  group,
  now,
  failureCounts,
  openEntryId,
  onToggleEntry,
  onOpenJob,
  onFocusFailure,
  renderOpenJob,
  renderEntryToggle,
  renderSeeOthers,
}: {
  group: Group;
  now: number;
  failureCounts: Record<string, number>;
  openEntryId: string | null;
  onToggleEntry: (entryId: string) => void;
  onOpenJob: (runId: Id<"agentRuns">) => void;
  onFocusFailure?: (failureKey: string) => void;
  renderOpenJob: (props: { onClick: () => void; children: ReactNode }) => ReactNode;
  renderEntryToggle: (props: {
    isOpen: boolean;
    onClick: () => void;
    children: ReactNode;
  }) => ReactNode;
  renderSeeOthers: (props: { onClick: () => void; children: ReactNode }) => ReactNode;
}) {
  const t = useTranslations("admin.agents.details.logs.raw");
  const tLabels = useTranslations("admin.agents.labels");
  // The pure formatters return catalogue keys, not words; this says them.
  const label = (ref: LabelRef) => tLabels(ref.key, ref.params);
  const { job } = group;
  const durationMs = job?.completedAt ? job.completedAt - job.startedAt : undefined;

  return (
    <div className="border border-border-dim rounded-[14px] bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-white/[0.02] border-b border-border-dim min-w-0">
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 w-[86px] text-center ${statusTone(job?.status)}`}>
          {job ? label(describeRunStatus(job.status)) : t("noJob")}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] text-foreground truncate">
            {job?.objective ?? t("outsideJob")}
          </p>
          <p className="text-[11.5px] text-muted truncate">
            {job ? `${label(describeTrigger(job.triggerType))} · ` : ""}
            {label(formatRelativeTime(group.startedAt, now))} · {t("entries", { formatted: formatCount(group.entries.length), count: group.entries.length })}
            {durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : ""}
            {job?.costGBP !== undefined ? ` · ${formatMoney(job.costGBP)}` : ""}
          </p>
        </div>
        {group.runId &&
          renderOpenJob({
            onClick: () => onOpenJob(group.runId as Id<"agentRuns">),
            children: t("openJob"),
          })}
      </div>

      <div className="flex flex-col">
        {group.entries.map((entry) => {
          const isOpen = openEntryId === entry._id;
          const repeats = entry.failureKey ? failureCounts[entry.failureKey] ?? 0 : 0;

          return (
            <div key={entry._id} className="border-t border-border-dim/40 first:border-t-0">
              {renderEntryToggle({
                isOpen,
                onClick: () => onToggleEntry(entry._id),
                children: (
                  <>
                    <span className="text-[11px] font-mono text-muted tabular-nums shrink-0 w-[68px]">
                      {new Date(entry.createdAt).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span className={`text-[10.5px] px-2 py-1 rounded-[6px] whitespace-nowrap shrink-0 w-[74px] text-center ${categoryTone(classifyLogEntry(entry))}`}>
                      {t(categoryKey(classifyLogEntry(entry)))}
                    </span>
                    <span className="flex-1 min-w-0 text-[12.5px] truncate">
                      <span className="text-foreground">{label(describeInteractionType(entry.interactionType))}</span>
                      <span className="text-muted"> — {summariseLogContent(entry.promptContent) ?? tLabels("log.nothingRecorded")}</span>
                    </span>
                    <span className="text-[11px] tabular-nums whitespace-nowrap shrink-0 hidden sm:flex items-center gap-1">
                      {entry.durationMs !== undefined && (
                        <span className="text-muted">{formatDuration(entry.durationMs)} ·</span>
                      )}
                      <span className={outcomeTone(entry.outcome)}>{t(outcomeKey(entry.outcome))}</span>
                    </span>
                  </>
                ),
              })}

              {isOpen && (
                <div className="px-5 pb-4 pt-1 flex flex-col gap-3">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Pane title={t("whatWeSent")} body={entry.promptContent} />
                    <Pane
                      title={t("whatCameBack")}
                      body={entry.responseContent}
                      isError={entry.outcome === "FAILED"}
                    />
                  </div>
                  {repeats > 1 && (
                    <p className="text-[12px] text-muted">
                      {t("repeats", { count: formatCount(repeats) })}{" "}
                      {onFocusFailure &&
                        entry.failureKey &&
                        renderSeeOthers({
                          onClick: () => onFocusFailure(entry.failureKey as string),
                          children: t("seeOthers", { count: formatCount(repeats - 1) }),
                        })}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Pane({ title, body, isError }: { title: string; body: string; isError?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted mb-1.5">{title}</div>
      <pre
        className={`text-[11.5px] leading-relaxed font-mono m-0 px-3 py-2.5 rounded-[10px] border border-border-dim bg-sidebar/60 overflow-x-auto whitespace-pre-wrap break-words max-h-[280px] ${
          isError ? "text-rose-400" : "text-secondary"
        }`}
      >
        {body}
      </pre>
    </div>
  );
}

function statusTone(status: string | undefined) {
  if (status === "SUCCESS") return "bg-emerald-500/10 text-emerald-500";
  if (status === "FAILED") return "bg-rose-500/10 text-rose-500";
  if (status === "PENDING_APPROVAL") return "bg-amber-500/10 text-amber-500";
  if (status === "RUNNING" || status === "QUEUED") return "bg-brand/10 text-brand";
  return "bg-foreground/5 text-secondary";
}

function outcomeKey(outcome: string | undefined) {
  if (outcome === "SUCCESS") return "outcome.worked";
  if (outcome === "FAILED") return "outcome.failed";
  return "outcome.notRecorded";
}

function outcomeTone(outcome: string | undefined) {
  if (outcome === "SUCCESS") return "text-emerald-500";
  if (outcome === "FAILED") return "text-rose-500";
  return "text-muted";
}

function categoryKey(category: LogCategory) {
  if (category === "THINKING") return "category.thinking";
  if (category === "TOOL") return "category.tool";
  if (category === "PROBLEM") return "category.problem";
  return "category.other";
}

function categoryTone(category: LogCategory) {
  if (category === "TOOL") return "bg-brand/10 text-brand";
  if (category === "PROBLEM") return "bg-rose-500/10 text-rose-500";
  return "bg-foreground/5 text-secondary";
}
