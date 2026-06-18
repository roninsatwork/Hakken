"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  Bot,
  Clock3,
  Gauge,
  Loader2,
  PoundSterling,
  ShieldCheck,
  Timer,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";

type RunStatus = "QUEUED" | "RUNNING" | "PENDING_APPROVAL" | "SUCCESS" | "FAILED" | "CANCELLED";

type RunObservatory = {
  scope: "platform" | "company";
  lookbackDays: number;
  sampledRuns: number;
  sampledToolCalls: number;
  totals: {
    runs: number;
    successfulRuns: number;
    failedRuns: number;
    activeRuns: number;
    costGBP: number;
    inputTokens: number;
    outputTokens: number;
    successRate: number;
    averageLatencyMs: number;
  };
  statusCounts: Record<RunStatus, number>;
  triggerCounts: Record<string, number>;
  modelStats: Array<{
    modelId: string;
    providerKey?: string;
    runs: number;
    failures: number;
    costGBP: number;
  }>;
  agentStats: Array<{
    agentId: Id<"agents">;
    agentName: string;
    runs: number;
    failures: number;
    costGBP: number;
    lastRunAt: number;
  }>;
  toolStats: Array<{
    handlerMapping: string;
    calls: number;
    failures: number;
    approvalsRequired: number;
    denied: number;
    writeOrExternal: number;
  }>;
  failureReasons: Array<{
    reason: string;
    count: number;
  }>;
  recentRuns: Array<{
    runId: Id<"agentRuns">;
    agentId: Id<"agents">;
    agentName: string;
    status: RunStatus;
    triggerType: string;
    objective: string;
    startedAt: number;
    completedAt?: number;
    latencyMs?: number;
    costGBP?: number;
    modelId?: string;
    error?: string;
    nextAction: string;
  }>;
};

const statusTone: Record<RunStatus, string> = {
  QUEUED: "border-sky-500/25 bg-sky-500/10 text-sky-500",
  RUNNING: "border-sky-500/25 bg-sky-500/10 text-sky-500",
  PENDING_APPROVAL: "border-amber-500/25 bg-amber-500/10 text-amber-500",
  SUCCESS: "border-emerald-500/25 bg-emerald-500/10 text-emerald-500",
  FAILED: "border-rose-500/25 bg-rose-500/10 text-rose-500",
  CANCELLED: "border-neutral-500/25 bg-neutral-500/10 text-secondary",
};

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCurrency(value?: number) {
  return `£${(value ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function formatDuration(value?: number) {
  if (!value) return "0ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function MetricTile({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="rounded-[8px] border border-border-dim bg-card/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.16em] text-muted">{label}</span>
        <Icon className="h-4 w-4 text-brand" />
      </div>
      <div className="mt-3 text-2xl font-semibold text-foreground">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: RunStatus }) {
  return (
    <span className={`inline-flex items-center rounded-[6px] border px-2 py-1 text-[10px] font-medium ${statusTone[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function EmptyPanel({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-[8px] border border-dashed border-border-dim bg-background/20 px-4 py-8 text-center text-[13px] text-secondary">
      {children}
    </div>
  );
}

export default function RunObservatoryPage() {
  const observatory = useQuery(api.agentRuns.getRunObservatory, { lookbackDays: 7 }) as RunObservatory | undefined;

  if (observatory === undefined) {
    return (
      <div className="flex min-h-[420px] w-full flex-1 items-center justify-center">
        <div className="max-w-md rounded-[8px] border border-border-dim bg-card/60 p-6 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted" />
          <h1 className="mt-4 text-[16px] font-semibold text-foreground">Loading Run Observatory</h1>
          <p className="mt-2 text-[13px] text-secondary">Collecting recent run reliability, cost, and tool evidence.</p>
        </div>
      </div>
    );
  }

  const totalTokens = observatory.totals.inputTokens + observatory.totals.outputTokens;
  const statusItems: RunStatus[] = ["SUCCESS", "FAILED", "CANCELLED", "PENDING_APPROVAL", "RUNNING", "QUEUED"];

  return (
    <div className="flex w-full flex-col gap-6">
      <AdminPageHeader
        icon={<Activity className="h-5 w-5 text-brand" />}
        title="Run Observatory"
        description="Cross-agent execution health, failure evidence, cost, model, and tool signals for recent agent runs."
      />
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted">
        <span className="rounded-[6px] border border-border-dim bg-card/40 px-2 py-1">
          {observatory.scope === "platform" ? "Platform view" : "Workspace view"}
        </span>
        <span>Last {observatory.lookbackDays} days</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <MetricTile label="Sampled runs" value={observatory.totals.runs.toLocaleString()} icon={Activity} />
        <MetricTile label="Success rate" value={formatPercent(observatory.totals.successRate)} icon={ShieldCheck} />
        <MetricTile label="Failures" value={observatory.totals.failedRuns.toLocaleString()} icon={AlertTriangle} />
        <MetricTile label="Active" value={observatory.totals.activeRuns.toLocaleString()} icon={Gauge} />
        <MetricTile label="Cost" value={formatCurrency(observatory.totals.costGBP)} icon={PoundSterling} />
        <MetricTile label="Avg latency" value={formatDuration(observatory.totals.averageLatencyMs)} icon={Timer} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-[8px] border border-border-dim bg-card/50">
          <div className="border-b border-border-dim px-5 py-4">
            <h2 className="text-[15px] font-semibold text-foreground">Recent Run Evidence</h2>
            <p className="mt-1 text-[12px] text-secondary">
              Last {observatory.lookbackDays} days, sampled from {observatory.sampledRuns.toLocaleString()} runs and {observatory.sampledToolCalls.toLocaleString()} tool calls.
            </p>
          </div>
          {observatory.recentRuns.length === 0 ? (
            <div className="p-5">
              <EmptyPanel>No recent runs in this observatory window.</EmptyPanel>
            </div>
          ) : (
            <div className="divide-y divide-border-dim">
              {observatory.recentRuns.map((run) => (
                <article key={run.runId} className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusPill status={run.status} />
                      <span className="rounded-[6px] border border-border-dim px-2 py-1 text-[10px] text-muted">{run.triggerType}</span>
                      {run.modelId ? <span className="rounded-[6px] border border-border-dim px-2 py-1 text-[10px] text-muted">{run.modelId}</span> : null}
                    </div>
                    <h3 className="mt-2 truncate text-[14px] font-semibold text-foreground">{run.objective}</h3>
                    <p className="mt-1 text-[12px] text-secondary">{run.agentName}</p>
                    {run.error ? (
                      <p className="mt-2 rounded-[6px] border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-500">
                        {run.error}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] leading-relaxed text-muted">{run.nextAction}</p>
                  </div>
                  <div className="flex flex-col gap-2 text-[11px] text-muted">
                    <div className="flex justify-between gap-2">
                      <span>Started</span>
                      <span className="text-right text-secondary">{formatDate(run.startedAt)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Latency</span>
                      <span className="text-right text-secondary">{formatDuration(run.latencyMs)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span>Cost</span>
                      <span className="text-right text-secondary">{formatCurrency(run.costGBP)}</span>
                    </div>
                    <Link
                      href={`/admin/agents/${run.agentId}/runs?runId=${run.runId}`}
                      className="mt-1 rounded-[8px] border border-border-dim bg-background/40 px-3 py-2 text-center text-[12px] font-medium text-foreground transition-all hover:bg-background/70"
                    >
                      Open timeline
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-[8px] border border-border-dim bg-card/50 p-4">
            <h2 className="text-[13px] font-semibold text-foreground">Status Mix</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {statusItems.map((status) => (
                <div key={status} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-muted">{status.replace("_", " ")}</div>
                  <div className="mt-1 text-[18px] font-semibold text-foreground">{observatory.statusCounts[status].toLocaleString()}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[8px] border border-border-dim bg-card/50 p-4">
            <h2 className="text-[13px] font-semibold text-foreground">Failure Reasons</h2>
            <div className="mt-3 flex flex-col gap-2">
              {observatory.failureReasons.length === 0 ? (
                <p className="text-[12px] text-secondary">No failures in the sampled window.</p>
              ) : observatory.failureReasons.map((failure) => (
                <div key={failure.reason} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                  <div className="text-[12px] text-foreground">{failure.reason}</div>
                  <div className="mt-1 text-[11px] text-muted">{failure.count} occurrence{failure.count === 1 ? "" : "s"}</div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section className="rounded-[8px] border border-border-dim bg-card/50 p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Bot className="h-4 w-4 text-brand" />
            Agents Needing Attention
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {observatory.agentStats.length === 0 ? (
              <p className="text-[12px] text-secondary">No agent run activity in this window.</p>
            ) : observatory.agentStats.map((agent) => (
              <Link
                key={agent.agentId}
                href={`/admin/agents/${agent.agentId}/runs`}
                className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2 transition-all hover:bg-background/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[12px] font-medium text-foreground">{agent.agentName}</span>
                  <span className="text-[11px] text-muted">{agent.runs} runs</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted">
                  <span>{agent.failures} failures</span>
                  <span>{formatCurrency(agent.costGBP)}</span>
                  <span>last {formatDate(agent.lastRunAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="rounded-[8px] border border-border-dim bg-card/50 p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Wrench className="h-4 w-4 text-brand" />
            Tool Risk
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {observatory.toolStats.length === 0 ? (
              <p className="text-[12px] text-secondary">No tool calls sampled.</p>
            ) : observatory.toolStats.map((tool) => (
              <div key={tool.handlerMapping} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                <div className="truncate text-[12px] font-medium text-foreground">{tool.handlerMapping}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted">
                  <span>{tool.calls} calls</span>
                  <span>{tool.failures} failures</span>
                  <span>{tool.approvalsRequired} approvals</span>
                  <span>{tool.writeOrExternal} write/external</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[8px] border border-border-dim bg-card/50 p-4">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
            <Clock3 className="h-4 w-4 text-brand" />
            Models And Triggers
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {observatory.modelStats.map((model) => (
              <div key={model.modelId} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                <div className="truncate text-[12px] font-medium text-foreground">{model.modelId}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted">
                  <span>{model.runs} runs</span>
                  <span>{model.failures} failures</span>
                  <span>{formatCurrency(model.costGBP)}</span>
                </div>
              </div>
            ))}
            <div className="mt-2 border-t border-border-dim pt-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Trigger mix</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(observatory.triggerCounts).map(([trigger, count]) => (
                  <span key={trigger} className="rounded-[6px] border border-border-dim bg-background/30 px-2 py-1 text-[10px] text-secondary">
                    {trigger}: {count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="rounded-[8px] border border-border-dim bg-card/50 px-4 py-3 text-[12px] text-secondary">
        Token sample: {totalTokens.toLocaleString()} total tokens across recent runs. For raw step timelines, sanitized arguments, replay, fixture creation, and memory candidates, open an individual run timeline.
      </div>
    </div>
  );
}
