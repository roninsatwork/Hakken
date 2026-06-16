"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Gauge,
  Loader2,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";

type ReleaseStatus = "DRAFT_BLOCKED" | "READY_FOR_RELEASE" | "LIVE_NEEDS_ATTENTION" | "LIVE";

type ReleaseAgent = {
  agentId: Id<"agents">;
  name: string;
  description?: string;
  isActive: boolean;
  status: ReleaseStatus;
  activationRisk: boolean;
  activationWarnings: string[];
  toolBindingCount: number;
  knowledgeDocumentCount: number;
  activeEvalFixtureCount: number;
  successfulSmokeEvalRunCount: number;
  latestSmokeEvalAt?: number;
  releaseGatePolicy: {
    mode: "TAG" | "PRESET" | "NONE";
    criticalFixtureCount: number;
    passedCriticalFixtureCount: number;
    blockedCriticalFixtureCount: number;
    warning?: string;
  };
  nextAction: string;
  latestRelease: {
    releaseId: Id<"agentReleases">;
    status: AgentReleaseStatus;
    title: string;
    createdAt: number;
    approvedAt?: number;
    activatedAt?: number;
    rolledBackAt?: number;
  } | null;
  updatedAt: number;
};

type AgentReleaseStatus = "PENDING_SIGNOFF" | "APPROVED" | "ACTIVATED" | "ROLLED_BACK" | "CANCELLED";

type AgentRelease = {
  _id: Id<"agentReleases">;
  agentId: Id<"agents">;
  agentVersionId: Id<"agentVersions">;
  agentName: string;
  versionNumber?: number;
  status: AgentReleaseStatus;
  title: string;
  releaseNotes: string;
  rollbackPlan: string;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  activatedAt?: number;
  rolledBackAt?: number;
};

type ReleaseOverview = {
  summary: {
    total: number;
    DRAFT_BLOCKED: number;
    READY_FOR_RELEASE: number;
    LIVE_NEEDS_ATTENTION: number;
    LIVE: number;
    warningCount: number;
  };
  agents: ReleaseAgent[];
};

const statusConfig: Record<ReleaseStatus, {
  label: string;
  className: string;
  icon: typeof AlertTriangle;
}> = {
  DRAFT_BLOCKED: {
    label: "Draft blocked",
    className: "border-amber-500/25 bg-amber-500/10 text-amber-500",
    icon: AlertTriangle,
  },
  READY_FOR_RELEASE: {
    label: "Ready for review",
    className: "border-emerald-500/25 bg-emerald-500/10 text-emerald-500",
    icon: CheckCircle2,
  },
  LIVE_NEEDS_ATTENTION: {
    label: "Live needs attention",
    className: "border-rose-500/25 bg-rose-500/10 text-rose-500",
    icon: AlertTriangle,
  },
  LIVE: {
    label: "Live",
    className: "border-sky-500/25 bg-sky-500/10 text-sky-500",
    icon: ShieldCheck,
  },
};

const warningLabels: Record<string, string> = {
  draftStatus: "Active draft state",
  modelDefault: "Model default",
  tools: "Tools",
  knowledge: "Knowledge",
  evalFixtures: "Eval fixtures",
  smokeEval: "Smoke eval",
  releaseGate: "Release gate",
};

const releaseStatusLabel: Record<AgentReleaseStatus, string> = {
  PENDING_SIGNOFF: "Pending sign-off",
  APPROVED: "Approved",
  ACTIVATED: "Activated",
  ROLLED_BACK: "Rolled back",
  CANCELLED: "Cancelled",
};

function formatDate(timestamp?: number) {
  if (!timestamp) return "Not run";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Rocket }) {
  return (
    <div className="border border-border-dim bg-card/60 rounded-[8px] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">{label}</span>
        <Icon className="w-4 h-4 text-brand" />
      </div>
      <div className="text-3xl font-bold text-foreground mt-3">{value}</div>
    </div>
  );
}

function StatusPill({ status }: { status: ReleaseStatus }) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-1 text-[11px] font-medium ${config.className}`}>
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  );
}

function ReleaseStatusPill({ status }: { status: AgentReleaseStatus }) {
  const className = status === "ACTIVATED"
    ? "border-sky-500/25 bg-sky-500/10 text-sky-500"
    : status === "APPROVED"
      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-500"
      : status === "ROLLED_BACK" || status === "CANCELLED"
        ? "border-neutral-500/25 bg-neutral-500/10 text-secondary"
        : "border-amber-500/25 bg-amber-500/10 text-amber-500";
  return (
    <span className={`inline-flex items-center rounded-[6px] border px-2 py-1 text-[11px] font-medium ${className}`}>
      {releaseStatusLabel[status]}
    </span>
  );
}

export default function ReleaseCenterPage() {
  const overview = useQuery(api.releases.getReleaseReadinessOverview, {}) as ReleaseOverview | undefined;
  const recentReleases = useQuery(api.releases.getRecentReleases, {}) as AgentRelease[] | undefined;
  const createReleaseCandidate = useMutation(api.releases.createReleaseCandidate);
  const approveReleaseCandidate = useMutation(api.releases.approveReleaseCandidate);
  const activateReleaseCandidate = useMutation(api.releases.activateReleaseCandidate);
  const rollbackRelease = useMutation(api.releases.rollbackRelease);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const runReleaseAction = async (key: string, action: () => Promise<unknown>, successMessage: string) => {
    if (busyAction) return;
    setBusyAction(key);
    setActionMessage("");
    try {
      await action();
      setActionMessage(successMessage);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Release action failed.");
    } finally {
      setBusyAction(null);
    }
  };

  if (overview === undefined) {
    return (
      <div className="flex-1 w-full min-h-[420px] flex items-center justify-center">
        <div className="border border-border-dim bg-card/60 rounded-[8px] p-6 max-w-md text-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted mx-auto" />
          <h1 className="text-[16px] font-semibold text-foreground mt-4">Loading Ship Checks</h1>
          <p className="text-[13px] text-secondary mt-2">Checking agent readiness and release gates.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <AdminPageHeader
        icon={<Rocket className="w-6 h-6 text-brand" />}
        title="Developer Ship Checks"
        description="Review agent readiness evidence before wiring draft agents into product-specific workflows, widgets, APIs, or customer surfaces."
      />

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <StatCard label="Agents" value={overview.summary.total} icon={Gauge} />
        <StatCard label="Draft blocked" value={overview.summary.DRAFT_BLOCKED} icon={AlertTriangle} />
        <StatCard label="Ready" value={overview.summary.READY_FOR_RELEASE} icon={CheckCircle2} />
        <StatCard label="Live attention" value={overview.summary.LIVE_NEEDS_ATTENTION} icon={AlertTriangle} />
        <StatCard label="Live" value={overview.summary.LIVE} icon={ShieldCheck} />
      </section>

      <section className="border border-border-dim bg-card/40 rounded-[8px] overflow-hidden">
        <div className="px-5 py-4 border-b border-border-dim flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-foreground">Agent Ship Readiness</h2>
            <p className="text-[12px] text-secondary mt-1">Drafts are sorted first, followed by active agents that need developer attention.</p>
          </div>
          <Link
            href="/admin/agents"
            className="inline-flex items-center gap-2 rounded-[8px] border border-border-dim px-3 py-2 text-[12px] text-secondary hover:text-foreground"
          >
            Manage agents
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {overview.agents.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[14px] font-medium text-foreground">No agents yet.</p>
            <p className="text-[12px] text-secondary mt-1">Create agents from App Kits or the agent builder to start ship-check tracking.</p>
          </div>
        ) : (
          <div className="divide-y divide-border-dim">
            {overview.agents.map((agent) => (
              <article key={agent.agentId} className="p-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-foreground truncate">{agent.name}</h3>
                    <StatusPill status={agent.status} />
                  </div>
                  {agent.description ? (
                    <p className="text-[12px] text-secondary mt-2 line-clamp-2">{agent.description}</p>
                  ) : null}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
                    <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Tools</div>
                      <div className="text-[18px] font-semibold text-foreground mt-1">{agent.toolBindingCount}</div>
                    </div>
                    <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Knowledge</div>
                      <div className="text-[18px] font-semibold text-foreground mt-1">{agent.knowledgeDocumentCount}</div>
                    </div>
                    <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Fixtures</div>
                      <div className="text-[18px] font-semibold text-foreground mt-1">{agent.activeEvalFixtureCount}</div>
                    </div>
                    <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted">Smoke evals</div>
                      <div className="text-[18px] font-semibold text-foreground mt-1">{agent.successfulSmokeEvalRunCount}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-[8px] border border-border-dim bg-background/30 p-4 flex flex-col gap-3">
                  <div>
                    <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Next action</span>
                    <p className="text-[12px] text-secondary mt-1 leading-relaxed">{agent.nextAction}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.activationWarnings.length > 0 ? agent.activationWarnings.map((warning) => (
                      <span key={warning} className="rounded-[6px] border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-500">
                        {warningLabels[warning] ?? warning}
                      </span>
                    )) : (
                      <span className="rounded-[6px] border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-500">
                        No blockers
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted">
                    Last smoke eval: {formatDate(agent.latestSmokeEvalAt)}
                  </div>
                  {agent.latestRelease ? (
                    <div className="flex items-center justify-between gap-2 rounded-[8px] border border-border-dim bg-card/40 px-3 py-2">
                      <span className="text-[11px] text-secondary truncate">{agent.latestRelease.title}</span>
                      <ReleaseStatusPill status={agent.latestRelease.status} />
                    </div>
                  ) : null}
                  {agent.status === "READY_FOR_RELEASE" && !agent.latestRelease ? (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => runReleaseAction(
                        `create:${agent.agentId}`,
                        () => createReleaseCandidate({ agentId: agent.agentId }),
                        "Release candidate created."
                      )}
                      className="rounded-[8px] bg-foreground text-background px-3 py-2 text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {busyAction === `create:${agent.agentId}` ? "Creating..." : "Create release candidate"}
                    </button>
                  ) : null}
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    <Link className="text-center rounded-[8px] border border-border-dim px-2 py-2 text-[11px] text-secondary hover:text-foreground" href={`/admin/agents/${agent.agentId}/settings`}>
                      Settings
                    </Link>
                    <Link className="text-center rounded-[8px] border border-border-dim px-2 py-2 text-[11px] text-secondary hover:text-foreground" href={`/admin/agents/${agent.agentId}/evals`}>
                      Evals
                    </Link>
                    <Link className="text-center rounded-[8px] border border-border-dim px-2 py-2 text-[11px] text-secondary hover:text-foreground" href={`/admin/agents/${agent.agentId}/runs`}>
                      Runs
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="border border-border-dim bg-card/40 rounded-[8px] overflow-hidden">
        <div className="px-5 py-4 border-b border-border-dim flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-foreground">Ship Check Records</h2>
            <p className="text-[12px] text-secondary mt-1">Developer/operator sign-off, activation, and rollback records for agent releases.</p>
          </div>
          {actionMessage ? (
            <span className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2 text-[12px] text-secondary">
              {actionMessage}
            </span>
          ) : null}
        </div>

        {recentReleases === undefined ? (
          <div className="p-6 text-[13px] text-secondary">Loading release records...</div>
        ) : recentReleases.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-[14px] font-medium text-foreground">No ship-check records yet.</p>
            <p className="text-[12px] text-secondary mt-1">Create a release candidate from a ready draft agent when a developer is ready to review it.</p>
          </div>
        ) : (
          <div className="divide-y divide-border-dim">
            {recentReleases.map((release) => (
              <article key={release._id} className="p-5 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-[15px] font-semibold text-foreground truncate">{release.title}</h3>
                    <ReleaseStatusPill status={release.status} />
                    {release.versionNumber ? (
                      <span className="rounded-[6px] border border-border-dim px-2 py-1 text-[11px] text-muted">v{release.versionNumber}</span>
                    ) : null}
                  </div>
                  <p className="text-[12px] text-secondary mt-2">{release.agentName}</p>
                  <p className="text-[12px] text-secondary mt-3 leading-relaxed">{release.releaseNotes}</p>
                  <p className="text-[11px] text-muted mt-2">Rollback: {release.rollbackPlan}</p>
                </div>
                <div className="rounded-[8px] border border-border-dim bg-background/30 p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
                    <span>Created</span>
                    <span className="text-right">{formatDate(release.createdAt)}</span>
                    <span>Approved</span>
                    <span className="text-right">{formatDate(release.approvedAt)}</span>
                    <span>Activated</span>
                    <span className="text-right">{formatDate(release.activatedAt)}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2">
                    {release.status === "PENDING_SIGNOFF" ? (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => runReleaseAction(
                          `approve:${release._id}`,
                          () => approveReleaseCandidate({ releaseId: release._id }),
                          "Release candidate approved."
                        )}
                        className="rounded-[8px] bg-foreground text-background px-3 py-2 text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {busyAction === `approve:${release._id}` ? "Approving..." : "Approve"}
                      </button>
                    ) : null}
                    {release.status === "APPROVED" ? (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => runReleaseAction(
                          `activate:${release._id}`,
                          () => activateReleaseCandidate({ releaseId: release._id }),
                          "Release activated."
                        )}
                        className="rounded-[8px] bg-foreground text-background px-3 py-2 text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {busyAction === `activate:${release._id}` ? "Activating..." : "Activate"}
                      </button>
                    ) : null}
                    {release.status === "ACTIVATED" ? (
                      <button
                        type="button"
                        disabled={busyAction !== null}
                        onClick={() => runReleaseAction(
                          `rollback:${release._id}`,
                          () => rollbackRelease({ releaseId: release._id }),
                          "Release rolled back."
                        )}
                        className="rounded-[8px] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] font-medium text-rose-500 hover:bg-rose-500/15 disabled:opacity-50"
                      >
                        {busyAction === `rollback:${release._id}` ? "Rolling back..." : "Rollback"}
                      </button>
                    ) : null}
                    <Link
                      className="text-center rounded-[8px] border border-border-dim px-3 py-2 text-[12px] text-secondary hover:text-foreground"
                      href={`/admin/agents/${release.agentId}/runs`}
                    >
                      Runs
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
