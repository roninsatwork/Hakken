"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, ChevronDown, DatabaseZap, FileText, Loader2 } from "lucide-react";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { PaginationFooter } from "@/src/ui/components/screens/Table";
import useDebounce from "@/src/hooks/useDebounce";
import {
  describeInteractionType,
  describeRunStatus,
  describeTrigger,
  formatCount,
  formatDuration,
  formatMoney,
  formatRelativeTime,
  summariseLogContent,
} from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import { useNow } from "@/src/app/(dashboard)/admin/agents/_lib/useNow";
import { classifyLogEntry, type LogCategory } from "@/convex/agentLogGroupingService";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";

const FILTERS = [
  { key: "ALL", label: "Everything" },
  { key: "THINKING", label: "Thinking" },
  { key: "TOOLS", label: "Tools" },
  { key: "PROBLEMS", label: "Problems" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

export default function AgentLogsDashboard() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as Id<"agents">;
  const now = useNow();

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [filter, setFilter] = useState<FilterKey>("ALL");
  const [page, setPage] = useState(1);
  const [openEntryId, setOpenEntryId] = useState<string | null>(null);
  // Set when a reader follows "see the others" from one repeated failure.
  const [failureKey, setFailureKey] = useState<string | null>(null);

  const data = useQuery(api.agentLogs.getJobGroups, {
    agentId,
    searchTerm: debouncedSearch,
    filter,
    ...(failureKey ? { failureKey } : {}),
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const isLoading = data === undefined;
  const groups = data?.groups ?? [];

  const reset = (apply: () => void) => {
    apply();
    setPage(1);
    setOpenEntryId(null);
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-brand" />
            Raw logs
          </h2>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            Word for word, what this agent was sent and what came back. Grouped by the job it
            belonged to.
          </p>
        </div>

        <div className="flex gap-1 bg-white/[0.02] border border-border-dim rounded-[10px] p-1 self-start">
          {FILTERS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => reset(() => setFilter(option.key))}
              className={`px-3 py-1.5 rounded-[7px] text-[12px] transition-all ${
                filter === option.key
                  ? "bg-card text-foreground border border-border-dim"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <TableSearchInput
          value={searchTerm}
          onChange={(next) => reset(() => setSearchTerm(next))}
          placeholder="Search everything this agent said or was told"
          clearLabel="Clear search"
        />
      </div>

      {failureKey && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-rose-500/20 bg-rose-500/[0.06] px-4 py-3">
          <span className="text-[12.5px] text-secondary">
            Showing only the times this same thing went wrong.
          </span>
          <button
            type="button"
            onClick={() => reset(() => setFailureKey(null))}
            className="text-[12px] text-brand hover:underline shrink-0"
          >
            Show everything again
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="py-20 flex items-center justify-center text-muted">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <EmptyLogs hasSearch={Boolean(debouncedSearch)} filter={filter} />
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => (
            <JobGroup
              key={group.runId ?? `${group.startedAt}-${group.entries[0]?._id}`}
              group={group}
              now={now}
              failureCounts={data.failureCounts}
              openEntryId={openEntryId}
              onToggleEntry={(entryId) => setOpenEntryId(openEntryId === entryId ? null : entryId)}
              onOpenJob={(runId) => router.push(`/admin/agents/${agentId}/observability/${runId}`)}
              onFocusFailure={failureKey ? undefined : (key) => reset(() => setFailureKey(key))}
            />
          ))}
        </div>
      )}

      {!isLoading && groups.length > 0 && (
        <PaginationFooter
          page={page}
          totalPages={data.totalPages}
          totalCount={data.totalGroups}
          pageSize={TABLE_PAGE_SIZE}
          isLoading={isLoading}
          onPageChange={setPage}
          labels={{
            previous: "Previous",
            next: "Next",
            empty: "No jobs to show",
            page: (current, total) => `Page ${current} of ${total}`,
            showing: (start, end, total) => `Showing jobs ${start} to ${end} of ${total}`,
          }}
        />
      )}

      {data?.windowTruncated && (
        <p className="text-[12px] text-muted">
          This agent has said more than one screen can hold, so this covers its most recent
          activity rather than everything it has ever done.
        </p>
      )}
    </div>
  );
}

function EmptyLogs({ hasSearch, filter }: { hasSearch: boolean; filter: FilterKey }) {
  const message = hasSearch
    ? { title: "Nothing matched that search", body: "Try a different word, or clear the search." }
    : filter === "PROBLEMS"
      ? { title: "Nothing has gone wrong", body: "No failures were recorded for this agent." }
      : filter !== "ALL"
        ? { title: "Nothing of that kind yet", body: "Try showing everything instead." }
        : {
            title: "This agent has not said anything yet",
            body: "When it runs, everything it is sent and everything it replies will appear here.",
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
}: {
  group: Group;
  now: number;
  failureCounts: Record<string, number>;
  openEntryId: string | null;
  onToggleEntry: (entryId: string) => void;
  onOpenJob: (runId: Id<"agentRuns">) => void;
  onFocusFailure?: (failureKey: string) => void;
}) {
  const { job } = group;
  const durationMs = job?.completedAt ? job.completedAt - job.startedAt : undefined;

  return (
    <div className="border border-border-dim rounded-[14px] bg-card overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-3.5 bg-white/[0.02] border-b border-border-dim min-w-0">
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap shrink-0 w-[86px] text-center ${statusTone(job?.status)}`}>
          {job ? describeRunStatus(job.status) : "No job"}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] text-foreground truncate">
            {job?.objective ?? "Work done outside a job"}
          </p>
          <p className="text-[11.5px] text-muted truncate">
            {job ? `${describeTrigger(job.triggerType)} · ` : ""}
            {formatRelativeTime(group.startedAt, now)} · {formatCount(group.entries.length)}{" "}
            {group.entries.length === 1 ? "entry" : "entries"}
            {durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : ""}
            {job?.costGBP !== undefined ? ` · ${formatMoney(job.costGBP)}` : ""}
          </p>
        </div>
        {group.runId && (
          <button
            type="button"
            onClick={() => onOpenJob(group.runId as Id<"agentRuns">)}
            className="text-[11.5px] text-brand hover:underline whitespace-nowrap shrink-0 flex items-center gap-1"
          >
            Open this job
            <ArrowRight className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex flex-col">
        {group.entries.map((entry) => {
          const isOpen = openEntryId === entry._id;
          const repeats = entry.failureKey ? failureCounts[entry.failureKey] ?? 0 : 0;

          return (
            <div key={entry._id} className="border-t border-border-dim/40 first:border-t-0">
              <button
                type="button"
                onClick={() => onToggleEntry(entry._id)}
                className={`w-full flex items-center gap-3 px-5 py-2.5 text-left min-w-0 transition-colors ${
                  isOpen ? "bg-rose-500/[0.04]" : "hover:bg-white/[0.02]"
                }`}
              >
                <span className="text-[11px] font-mono text-muted tabular-nums shrink-0 w-[68px]">
                  {new Date(entry.createdAt).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                {/* What kind of entry this is, matching the filters above it —
                    so picking "Tools" and seeing rows chipped "Tool" is one
                    idea rather than two. */}
                <span className={`text-[10.5px] px-2 py-1 rounded-[6px] whitespace-nowrap shrink-0 w-[74px] text-center ${categoryTone(classifyLogEntry(entry))}`}>
                  {categoryLabel(classifyLogEntry(entry))}
                </span>
                {/* What the entry was, and then what it was about. The type
                    alone made every property search on the page identical. */}
                <span className="flex-1 min-w-0 text-[12.5px] truncate">
                  <span className="text-foreground">{describeInteractionType(entry.interactionType)}</span>
                  <span className="text-muted"> — {summariseLogContent(entry.promptContent)}</span>
                </span>
                {/* The outcome stays on the row in words. The chip says what
                    the entry was; this says how it went, including when that
                    was never recorded — which is the whole point of the
                    outcome field and must not be quietly implied. */}
                <span className="text-[11px] tabular-nums whitespace-nowrap shrink-0 hidden sm:flex items-center gap-1">
                  {entry.durationMs !== undefined && (
                    <span className="text-muted">{formatDuration(entry.durationMs)} ·</span>
                  )}
                  <span className={outcomeTone(entry.outcome)}>{outcomeLabel(entry.outcome)}</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-muted shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>

              {isOpen && (
                <div className="px-5 pb-4 pt-1 flex flex-col gap-3">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <Pane title="What we sent" body={entry.promptContent} />
                    <Pane
                      title="What came back"
                      body={entry.responseContent}
                      isError={entry.outcome === "FAILED"}
                    />
                  </div>
                  {repeats > 1 && (
                    <p className="text-[12px] text-muted">
                      This has happened {formatCount(repeats)} times recently.{" "}
                      {onFocusFailure && entry.failureKey && (
                        <button
                          type="button"
                          onClick={() => onFocusFailure(entry.failureKey as string)}
                          className="text-brand hover:underline"
                        >
                          See the other {formatCount(repeats - 1)}
                        </button>
                      )}
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

function outcomeLabel(outcome: string | undefined) {
  if (outcome === "SUCCESS") return "worked";
  if (outcome === "FAILED") return "failed";
  return "outcome not recorded";
}

function outcomeTone(outcome: string | undefined) {
  if (outcome === "SUCCESS") return "text-emerald-500";
  if (outcome === "FAILED") return "text-rose-500";
  return "text-muted";
}

/** The chip, using the same four words as the filters above the list. */
function categoryLabel(category: LogCategory) {
  if (category === "THINKING") return "Thinking";
  if (category === "TOOL") return "Tool";
  if (category === "PROBLEM") return "Problem";
  return "Other";
}

function categoryTone(category: LogCategory) {
  if (category === "TOOL") return "bg-brand/10 text-brand";
  if (category === "PROBLEM") return "bg-rose-500/10 text-rose-500";
  return "bg-foreground/5 text-secondary";
}
