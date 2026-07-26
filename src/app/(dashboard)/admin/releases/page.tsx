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
  MessageSquareText,
  Rocket,
  ShieldCheck,
  Timer,
  UserRound,
} from "lucide-react";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { useAdminAction } from "@/src/hooks/useAdminAction";

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
    ownerEmail?: string;
    activationWindowStart?: number;
    activationWindowEnd?: number;
    createdAt: number;
    approvedAt?: number;
    activatedAt?: number;
    rolledBackAt?: number;
  } | null;
  updatedAt: number;
};

type AgentReleaseStatus = "PENDING_SIGNOFF" | "APPROVED" | "ACTIVATED" | "ROLLED_BACK" | "CANCELLED";

type ReleaseSnapshotComparison = {
  baselineReleaseId?: Id<"agentReleases">;
  baselineTitle?: string;
  baselineVersionNumber?: number;
  currentVersionNumber?: number;
  changedAreas: string[];
  unchangedAreas: string[];
  details: Array<{
    area: string;
    before: string;
    after: string;
  }>;
  summary: string;
};

type ReleaseEvidenceSummary = {
  summary: string;
  items: Array<{
    label: string;
    value: string;
    status: "PASS" | "WARN";
  }>;
};

type ReleaseNextAction = {
  tone: "READY" | "REVIEW" | "WAIT" | "BLOCKED";
  label: string;
  detail: string;
};

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
  ownerEmail?: string;
  approvalComment?: string;
  rollbackReason?: string;
  cancellationReason?: string;
  activationWindowStart?: number;
  activationWindowEnd?: number;
  createdAt: number;
  updatedAt: number;
  approvedAt?: number;
  activatedAt?: number;
  rolledBackAt?: number;
  cancelledAt?: number;
  evidenceSummary?: ReleaseEvidenceSummary;
  nextAction?: ReleaseNextAction;
  snapshotComparison?: ReleaseSnapshotComparison | null;
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

function getActivationWindowState(release: Pick<AgentRelease, "activationWindowStart" | "activationWindowEnd">) {
  const now = Date.now();
  if (release.activationWindowStart && now < release.activationWindowStart) {
    return {
      canActivate: false,
      label: "Window not open",
      detail: `Activation opens ${formatDate(release.activationWindowStart)}.`,
    };
  }
  if (release.activationWindowEnd && now > release.activationWindowEnd) {
    return {
      canActivate: false,
      label: "Window expired",
      detail: `Activation closed ${formatDate(release.activationWindowEnd)}. Cancel or create a replacement candidate.`,
    };
  }
  if (release.activationWindowEnd) {
    return {
      canActivate: true,
      label: "Activate",
      detail: `Activation window closes ${formatDate(release.activationWindowEnd)}.`,
    };
  }
  return {
    canActivate: true,
    label: "Activate",
    detail: "Manual activation is available after approval.",
  };
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

function SnapshotComparisonCard({ comparison }: { comparison?: ReleaseSnapshotComparison | null }) {
  if (!comparison) return null;
  return (
    <div className="mt-3 rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Snapshot comparison</span>
        <span className="text-[11px] text-muted">
          v{comparison.currentVersionNumber ?? "?"}
          {comparison.baselineVersionNumber ? ` vs v${comparison.baselineVersionNumber}` : ""}
        </span>
      </div>
      <p className="mt-1 text-[12px] text-secondary">{comparison.summary}</p>
      {comparison.baselineTitle ? (
        <p className="mt-1 text-[11px] text-muted">Baseline: {comparison.baselineTitle}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {comparison.changedAreas.map((area) => (
          <span key={area} className="rounded-[6px] border border-brand/20 bg-brand/10 px-2 py-1 text-[11px] text-brand">
            {area}
          </span>
        ))}
        {comparison.changedAreas.length === 0 ? (
          <span className="rounded-[6px] border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-500">
            No tracked changes
          </span>
        ) : null}
      </div>
      {comparison.details.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {comparison.details.map((detail) => (
            <div key={detail.area} className="rounded-[6px] border border-border-dim bg-card/30 px-3 py-2">
              <div className="text-[11px] font-medium text-foreground">{detail.area}</div>
              <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px] text-muted">
                <p><span className="text-secondary">Before:</span> {detail.before}</p>
                <p><span className="text-secondary">After:</span> {detail.after}</p>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ReleaseEvidenceCard({ evidence }: { evidence?: ReleaseEvidenceSummary }) {
  if (!evidence) return null;
  return (
    <div className="mt-3 rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted">Release evidence</span>
        <span className="text-[11px] text-muted">{evidence.summary}</span>
      </div>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
        {evidence.items.map((item) => (
          <div key={item.label} className="rounded-[6px] border border-border-dim bg-card/30 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-foreground">{item.label}</span>
              <span className={`rounded-[5px] border px-1.5 py-0.5 text-[10px] ${
                item.status === "PASS"
                  ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                  : "border-amber-500/20 bg-amber-500/10 text-amber-500"
              }`}>
                {item.status === "PASS" ? "Pass" : "Review"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-muted">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReleaseNextActionCard({ nextAction }: { nextAction?: ReleaseNextAction }) {
  if (!nextAction) return null;
  const className = nextAction.tone === "READY"
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
    : nextAction.tone === "WAIT"
      ? "border-sky-500/20 bg-sky-500/10 text-sky-500"
      : nextAction.tone === "BLOCKED"
        ? "border-rose-500/20 bg-rose-500/10 text-rose-500"
        : "border-amber-500/20 bg-amber-500/10 text-amber-500";
  return (
    <div className={`rounded-[8px] border px-3 py-2 ${className}`}>
      <div className="text-[10px] uppercase tracking-[0.14em] opacity-80">Recommended next action</div>
      <p className="mt-1 text-[12px] font-semibold">{nextAction.label}</p>
      <p className="mt-1 text-[11px] leading-relaxed opacity-90">{nextAction.detail}</p>
    </div>
  );
}

export default function ReleaseCenterPage() {
  const overview = useQuery(api.releases.getReleaseReadinessOverview, {}) as ReleaseOverview | undefined;
  const recentReleases = useQuery(api.releases.getRecentReleases, {}) as AgentRelease[] | undefined;
  const createReleaseCandidate = useMutation(api.releases.createReleaseCandidate);
  const approveReleaseCandidate = useMutation(api.releases.approveReleaseCandidate);
  const cancelReleaseCandidate = useMutation(api.releases.cancelReleaseCandidate);
  const activateReleaseCandidate = useMutation(api.releases.activateReleaseCandidate);
  const rollbackRelease = useMutation(api.releases.rollbackRelease);
  const action = useAdminAction({ scope: "admin-releases" });
  const [candidateOwnerEmails, setCandidateOwnerEmails] = useState<Record<string, string>>({});
  const [candidateWindowStarts, setCandidateWindowStarts] = useState<Record<string, string>>({});
  const [candidateWindowEnds, setCandidateWindowEnds] = useState<Record<string, string>>({});
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});
  const [cancellationReasons, setCancellationReasons] = useState<Record<string, string>>({});
  const [rollbackReasons, setRollbackReasons] = useState<Record<string, string>>({});

  // Every release action on this page wants the same options, so they are named
  // once here rather than repeated at five call sites. The work itself is the
  // shared runner's.
  const runReleaseAction = (key: string, perform: () => Promise<unknown>, successMessage: string) =>
    action.run(perform, { key, successMessage, fallbackMessage: "Release action failed." });

  const getCandidateWindowArgs = (agentId: string) => {
    const start = candidateWindowStarts[agentId];
    const end = candidateWindowEnds[agentId];
    return {
      activationWindowStart: start ? new Date(start).getTime() : undefined,
      activationWindowEnd: end ? new Date(end).getTime() : undefined,
    };
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

  const releaseLifecycleCounts = (recentReleases ?? []).reduce<Record<AgentReleaseStatus, number>>((counts, release) => {
    counts[release.status] += 1;
    return counts;
  }, {
    PENDING_SIGNOFF: 0,
    APPROVED: 0,
    ACTIVATED: 0,
    ROLLED_BACK: 0,
    CANCELLED: 0,
  });
  const releaseLifecycleItems: Array<{ label: string; value: number; status: AgentReleaseStatus }> = [
    { label: "Pending sign-off", value: releaseLifecycleCounts.PENDING_SIGNOFF, status: "PENDING_SIGNOFF" },
    { label: "Approved", value: releaseLifecycleCounts.APPROVED, status: "APPROVED" },
    { label: "Activated", value: releaseLifecycleCounts.ACTIVATED, status: "ACTIVATED" },
    { label: "Rolled back", value: releaseLifecycleCounts.ROLLED_BACK, status: "ROLLED_BACK" },
    { label: "Cancelled", value: releaseLifecycleCounts.CANCELLED, status: "CANCELLED" },
  ];

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

      <section className="border border-border-dim bg-card/40 rounded-[8px] p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Release Lifecycle</h2>
            <p className="text-[12px] text-secondary mt-1">Recent ship-check records by lifecycle state.</p>
          </div>
          <span className="text-[11px] text-muted">
            {recentReleases === undefined ? "Loading records" : `${recentReleases.length} recent records`}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2">
          {releaseLifecycleItems.map((item) => (
            <div key={item.status} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-muted">{item.label}</span>
                <ReleaseStatusPill status={item.status} />
              </div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{item.value}</div>
            </div>
          ))}
        </div>
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
            <p className="text-[12px] text-secondary mt-1">Create agents from the agent builder to start ship-check tracking.</p>
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
                    <div className="rounded-[8px] border border-border-dim bg-card/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-secondary truncate">{agent.latestRelease.title}</span>
                        <ReleaseStatusPill status={agent.latestRelease.status} />
                      </div>
                      {agent.latestRelease.ownerEmail ? (
                        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted">
                          <UserRound className="h-3.5 w-3.5" />
                          {agent.latestRelease.ownerEmail}
                        </div>
                      ) : null}
                      {(agent.latestRelease.activationWindowStart || agent.latestRelease.activationWindowEnd) ? (
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                          <Timer className="h-3.5 w-3.5" />
                          {formatDate(agent.latestRelease.activationWindowStart)} - {formatDate(agent.latestRelease.activationWindowEnd)}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {agent.status === "READY_FOR_RELEASE" && !agent.latestRelease ? (
                    <div className="flex flex-col gap-2">
                      <label className="flex flex-col gap-1 text-[11px] text-muted">
                        Release owner email
                        <input
                          type="email"
                          value={candidateOwnerEmails[agent.agentId] ?? ""}
                          onChange={(event) => setCandidateOwnerEmails((current) => ({
                            ...current,
                            [agent.agentId]: event.target.value,
                          }))}
                          placeholder="Defaults to current reviewer"
                          className="rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 text-[12px] text-foreground outline-none focus:border-brand/60"
                        />
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <label className="flex flex-col gap-1 text-[11px] text-muted">
                          Activation window opens
                          <input
                            type="datetime-local"
                            value={candidateWindowStarts[agent.agentId] ?? ""}
                            onChange={(event) => setCandidateWindowStarts((current) => ({
                              ...current,
                              [agent.agentId]: event.target.value,
                            }))}
                            className="rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 text-[12px] text-foreground outline-none focus:border-brand/60"
                          />
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] text-muted">
                          Activation window closes
                          <input
                            type="datetime-local"
                            value={candidateWindowEnds[agent.agentId] ?? ""}
                            onChange={(event) => setCandidateWindowEnds((current) => ({
                              ...current,
                              [agent.agentId]: event.target.value,
                            }))}
                            className="rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 text-[12px] text-foreground outline-none focus:border-brand/60"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        disabled={action.isBusy()}
                        onClick={() => runReleaseAction(
                          `create:${agent.agentId}`,
                          () => createReleaseCandidate({
                            agentId: agent.agentId,
                            ownerEmail: candidateOwnerEmails[agent.agentId]?.trim() || undefined,
                            ...getCandidateWindowArgs(agent.agentId),
                          }),
                          "Release candidate created."
                        )}
                        className="rounded-[8px] bg-foreground text-background px-3 py-2 text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {action.isBusy(`create:${agent.agentId}`) ? "Creating..." : "Create release candidate"}
                      </button>
                    </div>
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
                  <ReleaseEvidenceCard evidence={release.evidenceSummary} />
                  <SnapshotComparisonCard comparison={release.snapshotComparison} />
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                        <UserRound className="h-3.5 w-3.5" />
                        Owner
                      </div>
                      <p className="mt-1 text-[12px] text-secondary">{release.ownerEmail || "Current reviewer"}</p>
                    </div>
                    <div className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                        <MessageSquareText className="h-3.5 w-3.5" />
                        Sign-off comment
                      </div>
                      <p className="mt-1 text-[12px] text-secondary">{release.approvalComment || "Pending reviewer comment"}</p>
                    </div>
                    {release.status === "ROLLED_BACK" || release.rollbackReason ? (
                      <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-3 py-2 md:col-span-2">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-amber-500">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Rollback reason
                        </div>
                        <p className="mt-1 text-[12px] text-amber-500">
                          {release.rollbackReason || "Review recent runs, compare the release snapshot, and create a replacement candidate only after the cause is understood."}
                        </p>
                      </div>
                    ) : null}
                    {release.status === "CANCELLED" || release.cancellationReason ? (
                      <div className="rounded-[8px] border border-neutral-500/20 bg-neutral-500/10 px-3 py-2 md:col-span-2">
                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          Cancellation reason
                        </div>
                        <p className="mt-1 text-[12px] text-secondary">
                          {release.cancellationReason || "Cancelled before activation after developer/operator review."}
                        </p>
                      </div>
                    ) : null}
                    <div className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2 md:col-span-2">
                      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.14em] text-muted">
                        <Timer className="h-3.5 w-3.5" />
                        Activation window
                      </div>
                      <p className="mt-1 text-[12px] text-secondary">
                        {(release.activationWindowStart || release.activationWindowEnd)
                          ? `${formatDate(release.activationWindowStart)} - ${formatDate(release.activationWindowEnd)}`
                          : "Manual activation after approval"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-[8px] border border-border-dim bg-background/30 p-4 flex flex-col gap-3">
                  <ReleaseNextActionCard nextAction={release.nextAction} />
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted">
                    <span>Created</span>
                    <span className="text-right">{formatDate(release.createdAt)}</span>
                    <span>Approved</span>
                    <span className="text-right">{formatDate(release.approvedAt)}</span>
                    <span>Activated</span>
                    <span className="text-right">{formatDate(release.activatedAt)}</span>
                    <span>Cancelled</span>
                    <span className="text-right">{formatDate(release.cancelledAt)}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-2">
                    {release.status === "PENDING_SIGNOFF" ? (
                      <div className="sm:col-span-3 xl:col-span-1 flex flex-col gap-2">
                        <label className="flex flex-col gap-1 text-[11px] text-muted">
                          Approval comment
                          <textarea
                            value={approvalComments[release._id] ?? ""}
                            onChange={(event) => setApprovalComments((current) => ({
                              ...current,
                              [release._id]: event.target.value,
                            }))}
                            placeholder="What evidence did you review?"
                            rows={3}
                            className="resize-none rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 text-[12px] text-foreground outline-none focus:border-brand/60"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={action.isBusy()}
                          onClick={() => runReleaseAction(
                            `approve:${release._id}`,
                            () => approveReleaseCandidate({
                              releaseId: release._id,
                              approvalComment: approvalComments[release._id]?.trim() || undefined,
                            }),
                            "Release candidate approved."
                          )}
                          className="rounded-[8px] bg-foreground text-background px-3 py-2 text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          {action.isBusy(`approve:${release._id}`) ? "Approving..." : "Approve"}
                        </button>
                      </div>
                    ) : null}
                    {release.status === "APPROVED" ? (
                      <div className="flex flex-col gap-1">
                        {(() => {
                          const activationWindowState = getActivationWindowState(release);
                          return (
                            <>
                              <button
                                type="button"
                                disabled={action.isBusy() || !activationWindowState.canActivate}
                                onClick={() => runReleaseAction(
                                  `activate:${release._id}`,
                                  () => activateReleaseCandidate({ releaseId: release._id }),
                                  "Release activated."
                                )}
                                className="rounded-[8px] bg-foreground text-background px-3 py-2 text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
                              >
                                {action.isBusy(`activate:${release._id}`) ? "Activating..." : activationWindowState.label}
                              </button>
                              <p className="text-[11px] leading-relaxed text-muted">{activationWindowState.detail}</p>
                            </>
                          );
                        })()}
                      </div>
                    ) : null}
                    {(release.status === "PENDING_SIGNOFF" || release.status === "APPROVED") ? (
                      <div className="sm:col-span-3 xl:col-span-1 flex flex-col gap-2">
                        <label className="flex flex-col gap-1 text-[11px] text-muted">
                          Cancellation reason
                          <textarea
                            value={cancellationReasons[release._id] ?? ""}
                            onChange={(event) => setCancellationReasons((current) => ({
                              ...current,
                              [release._id]: event.target.value,
                            }))}
                            placeholder="Why should this candidate not ship?"
                            rows={3}
                            className="resize-none rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 text-[12px] text-foreground outline-none focus:border-brand/60"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={action.isBusy()}
                          onClick={() => runReleaseAction(
                            `cancel:${release._id}`,
                            () => cancelReleaseCandidate({
                              releaseId: release._id,
                              cancellationReason: cancellationReasons[release._id]?.trim() || undefined,
                            }),
                            "Release candidate cancelled."
                          )}
                          className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2 text-[12px] font-medium text-secondary hover:text-foreground disabled:opacity-50"
                        >
                          {action.isBusy(`cancel:${release._id}`) ? "Cancelling..." : "Cancel candidate"}
                        </button>
                      </div>
                    ) : null}
                    {release.status === "ACTIVATED" ? (
                      <div className="sm:col-span-3 xl:col-span-1 flex flex-col gap-2">
                        <label className="flex flex-col gap-1 text-[11px] text-muted">
                          Rollback reason
                          <textarea
                            value={rollbackReasons[release._id] ?? ""}
                            onChange={(event) => setRollbackReasons((current) => ({
                              ...current,
                              [release._id]: event.target.value,
                            }))}
                            placeholder="What happened, and what should be inspected next?"
                            rows={3}
                            className="resize-none rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 text-[12px] text-foreground outline-none focus:border-brand/60"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={action.isBusy()}
                          onClick={() => runReleaseAction(
                            `rollback:${release._id}`,
                            () => rollbackRelease({
                              releaseId: release._id,
                              rollbackReason: rollbackReasons[release._id]?.trim() || undefined,
                            }),
                            "Release rolled back."
                          )}
                          className="rounded-[8px] border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] font-medium text-rose-500 hover:bg-rose-500/15 disabled:opacity-50"
                        >
                          {action.isBusy(`rollback:${release._id}`) ? "Rolling back..." : "Rollback"}
                        </button>
                      </div>
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
