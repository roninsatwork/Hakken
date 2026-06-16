"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, Archive, CheckCircle2, CircleDashed, Database, Loader2, Rocket, ShieldAlert, ShieldCheck, Sparkles } from "lucide-react";
import { getErrorMessage } from "@/src/lib/errors";

type LaunchPlanPayload = {
  templateId?: string;
  templateName?: string;
  category?: string;
  riskProfile?: "LOW" | "MEDIUM" | "HIGH";
  primaryUsers?: string[];
  recommendedConnectorKeys?: string[];
  draftResources?: {
    agents?: string[];
    knowledgeScopes?: string[];
    workflows?: string[];
    evalFixtures?: string[];
    dashboardCards?: string[];
    publishTargets?: string[];
  };
  readinessChecks?: string[];
  developerFollowUps?: string[];
  extensionPoints?: string[];
  implementationPointers?: ImplementationPointer[];
  safetyDefaults?: {
    resourceStatus?: string;
    externalActionsRequireApproval?: boolean;
    releaseGateRequired?: boolean;
  };
};

type ImplementationPointer = {
  label: string;
  filePath: string;
  notes: string;
};

type CreatedLaunchResources = {
  agentIds: Id<"agents">[];
  workflowIds: Id<"workflows">[];
  fixtureIds: Id<"agentEvalFixtures">[];
  sourceRunIds: Id<"agentRuns">[];
};

type CreatedLaunchResourceDetails = {
  agents: Array<{
    id: Id<"agents">;
    name: string;
    isActive: boolean;
    fixtureCount: number;
  }>;
  workflows: Array<{
    id: Id<"workflows">;
    name: string;
    isActive: boolean;
    triggerType: "MANUAL" | "WEBHOOK" | "SCHEDULE";
  }>;
  evalFixtureCount: number;
  missingResourceCount: number;
};

type LaunchConnectorReadiness = {
  key: string;
  label: string;
  installed: boolean;
  installStatus?: "INSTALLED" | "DISABLED" | "ERROR";
  testStatus?: "UNTESTED" | "SUCCESS" | "FAILURE";
  authMode?: "NONE" | "SECRET_REF" | "OAUTH";
  authConnectionStatus?: "NOT_CONNECTED" | "PENDING" | "CONNECTED" | "ERROR";
  isActive?: boolean;
  tenantScoped: boolean;
  connectorId?: Id<"toolConnectors">;
};

type LaunchPlanReadinessSummary = {
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY_FOR_REVIEW";
  plannedAgentCount: number;
  createdAgentCount: number;
  plannedWorkflowCount: number;
  createdWorkflowCount: number;
  connectorReadyCount: number;
  connectorTotalCount: number;
  blockerCount: number;
  blockers: string[];
  nextActions: string[];
};

type DeveloperHandoffSummary = {
  status: "NEEDS_SCAFFOLDING" | "READY_FOR_DEVELOPER_REVIEW";
  followUpCount: number;
  extensionPointCount: number;
  implementationPointerCount: number;
  publishTargetCount: number;
  checklist: string[];
};

type DeveloperTask = {
  category: "Workspace" | "Resources" | "Connectors" | "Knowledge" | "Code" | "Release";
  title: string;
  status: "BLOCKED" | "PENDING" | "READY";
  detail: string;
  actionLabel?: string;
  actionHref?: string;
};

type DeveloperTaskSummary = {
  blockedCount: number;
  pendingCount: number;
  readyCount: number;
  nextTaskTitle?: string;
  nextTaskCategory?: DeveloperTask["category"];
  nextTaskStatus?: DeveloperTask["status"];
};

type LaunchWorkspaceSummary = {
  id: Id<"companies">;
  name: string;
  createdAt: number;
};

const riskClassName = {
  LOW: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  MEDIUM: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  HIGH: "text-rose-500 bg-rose-500/10 border-rose-500/20",
};

const readinessClassName = {
  NOT_STARTED: "text-muted bg-foreground/5 border-border-dim",
  IN_PROGRESS: "text-sky-500 bg-sky-500/10 border-sky-500/20",
  READY_FOR_REVIEW: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
};

const taskStatusClassName = {
  BLOCKED: "text-rose-500 bg-rose-500/10 border-rose-500/20",
  PENDING: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  READY: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
};

const taskIcon = {
  BLOCKED: ShieldAlert,
  PENDING: CircleDashed,
  READY: CheckCircle2,
};

function normalizeConnectorName(key: string) {
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function PlanSection({ title, items }: { title: string; items?: string[] }) {
  return (
    <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
      <h2 className="text-[14px] font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 mt-3">
        {items && items.length > 0 ? items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-[12px] text-secondary leading-relaxed">
            <CheckCircle2 className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
            <span>{item}</span>
          </div>
        )) : (
          <p className="text-[12px] text-muted">No items planned.</p>
        )}
      </div>
    </section>
  );
}

function ImplementationPointersSection({ pointers }: { pointers?: ImplementationPointer[] }) {
  return (
    <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
      <h2 className="text-[14px] font-semibold text-foreground">Code Pointers</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
        {pointers && pointers.length > 0 ? pointers.map((pointer) => (
          <div key={`${pointer.label}-${pointer.filePath}`} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
            <div className="text-[12px] font-medium text-foreground">{pointer.label}</div>
            <div className="text-[11px] font-mono text-brand mt-1 break-all">{pointer.filePath}</div>
            <p className="text-[12px] text-secondary mt-1 leading-relaxed">{pointer.notes}</p>
          </div>
        )) : (
          <p className="text-[12px] text-muted">No code pointers planned.</p>
        )}
      </div>
    </section>
  );
}

function DeveloperTaskMap({ summary, tasks }: { summary?: DeveloperTaskSummary; tasks?: DeveloperTask[] }) {
  return (
    <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Developer Task Map</h2>
          <p className="text-[12px] text-secondary mt-1">
            Use this as the implementation queue for completing the product-specific layer on top of the starter.
          </p>
        </div>
        {summary ? (
          <div className="grid grid-cols-3 gap-2 min-w-full xl:min-w-[360px]">
            <div className="rounded-[8px] border border-rose-500/20 bg-rose-500/10 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-rose-500">Blocked</div>
              <div className="text-[18px] font-semibold text-foreground mt-1">{summary.blockedCount}</div>
            </div>
            <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-amber-500">Pending</div>
              <div className="text-[18px] font-semibold text-foreground mt-1">{summary.pendingCount}</div>
            </div>
            <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 p-3">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-emerald-500">Ready</div>
              <div className="text-[18px] font-semibold text-foreground mt-1">{summary.readyCount}</div>
            </div>
          </div>
        ) : null}
      </div>
      {summary?.nextTaskTitle ? (
        <div className="mt-4 rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
          <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Next Recommended Task</div>
          <div className="text-[13px] text-foreground mt-1">
            {summary.nextTaskCategory}: {summary.nextTaskTitle}
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2 mt-4">
        {tasks && tasks.length > 0 ? tasks.map((task) => {
          const Icon = taskIcon[task.status];
          return (
            <div key={`${task.category}-${task.title}`} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">{task.category}</div>
                  <div className="text-[13px] font-semibold text-foreground mt-1">{task.title}</div>
                </div>
                <span className={`inline-flex items-center gap-1 rounded-[6px] border px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] uppercase flex-shrink-0 ${taskStatusClassName[task.status]}`}>
                  <Icon className="w-3 h-3" />
                  {task.status}
                </span>
              </div>
              <p className="text-[12px] text-secondary mt-2 leading-relaxed">{task.detail}</p>
              {task.actionLabel ? (
                task.actionHref ? (
                  <Link href={task.actionHref} className="inline-flex mt-3 text-[12px] font-medium text-brand hover:underline">
                    {task.actionLabel}
                  </Link>
                ) : (
                  <div className="mt-3 text-[12px] font-medium text-muted">{task.actionLabel}</div>
                )
              ) : null}
            </div>
          );
        }) : (
          <p className="text-[12px] text-muted">No developer tasks generated.</p>
        )}
      </div>
    </section>
  );
}

function getConnectorState(connector: LaunchConnectorReadiness) {
  if (!connector.installed) return { label: "Missing", className: "text-amber-500 bg-amber-500/10 border-amber-500/20" };
  if (connector.installStatus === "ERROR" || connector.testStatus === "FAILURE") return { label: "Needs fix", className: "text-rose-500 bg-rose-500/10 border-rose-500/20" };
  if (connector.authMode === "OAUTH" && connector.authConnectionStatus !== "CONNECTED") return { label: "Connect", className: "text-amber-500 bg-amber-500/10 border-amber-500/20" };
  if (connector.testStatus !== "SUCCESS") return { label: "Retest", className: "text-sky-500 bg-sky-500/10 border-sky-500/20" };
  if (connector.isActive === false || connector.installStatus === "DISABLED") return { label: "Disabled", className: "text-muted bg-foreground/5 border-border-dim" };
  return { label: "Ready", className: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" };
}

export default function LaunchPlanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const planId = params.id as Id<"appLaunchPlans">;
  const details = useQuery(api.appTemplates.getLaunchPlanDetails, { planId }) as { plan: {
    _id: Id<"appLaunchPlans">;
    templateName: string;
    category: string;
    riskProfile: "LOW" | "MEDIUM" | "HIGH";
    status: "DRAFT" | "MATERIALIZED" | "ARCHIVED";
    targetCompanyId?: Id<"companies">;
    targetCompanyName?: string;
    notes?: string;
    createdAt: number;
    updatedAt: number;
  }; parsedPlan: LaunchPlanPayload | null; createdResources: CreatedLaunchResources | null; createdResourceDetails: CreatedLaunchResourceDetails | null; connectorReadiness?: LaunchConnectorReadiness[]; readinessSummary?: LaunchPlanReadinessSummary; developerHandoff?: DeveloperHandoffSummary; developerTasks?: DeveloperTask[]; developerTaskSummary?: DeveloperTaskSummary; linkedWorkspace?: LaunchWorkspaceSummary | null } | null | undefined;
  const archiveLaunchPlan = useMutation(api.appTemplates.archiveLaunchPlan);
  const materializeLaunchPlan = useMutation(api.appTemplates.materializeLaunchPlan);
  const createWorkspaceForLaunchPlan = useMutation(api.appTemplates.createWorkspaceForLaunchPlan);
  const [isArchiving, setIsArchiving] = useState(false);
  const [isMaterializing, setIsMaterializing] = useState(false);
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [error, setError] = useState("");

  if (details === undefined) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!details) {
    return (
      <div className="flex flex-col gap-4 border border-dashed border-border-dim rounded-[8px] p-8 text-center">
        <Rocket className="w-8 h-8 text-muted mx-auto" />
        <h1 className="text-lg font-semibold text-foreground">Build plan not found</h1>
        <Link href="/admin/launch" className="text-[13px] text-brand hover:underline">Back to App Kits</Link>
      </div>
    );
  }

  const payload = details.parsedPlan ?? {};
  const draftResources = payload.draftResources ?? {};
  const createdResources = details.createdResources;
  const createdResourceDetails = details.createdResourceDetails;
  const connectorReadiness = details.connectorReadiness ?? [];
  const readinessSummary = details.readinessSummary;
  const developerHandoff = details.developerHandoff;
  const developerTasks = details.developerTasks;
  const developerTaskSummary = details.developerTaskSummary;
  const linkedWorkspace = details.linkedWorkspace ?? null;

  const handleArchive = async () => {
    if (isArchiving || details.plan.status === "ARCHIVED") return;
    setIsArchiving(true);
    setError("");
    try {
      await archiveLaunchPlan({ planId });
      router.refresh();
    } catch (archiveError) {
      setError(getErrorMessage(archiveError, "Could not archive build plan."));
    } finally {
      setIsArchiving(false);
    }
  };

  const handleMaterialize = async () => {
    if (isMaterializing || details.plan.status !== "DRAFT") return;
    setIsMaterializing(true);
    setError("");
    try {
      await materializeLaunchPlan({ planId });
      router.refresh();
    } catch (materializeError) {
      setError(getErrorMessage(materializeError, "Could not create draft launch resources."));
    } finally {
      setIsMaterializing(false);
    }
  };

  const handleCreateWorkspace = async () => {
    if (isCreatingWorkspace || linkedWorkspace || details.plan.status === "ARCHIVED") return;
    setIsCreatingWorkspace(true);
    setError("");
    try {
      await createWorkspaceForLaunchPlan({ planId });
      router.refresh();
    } catch (workspaceError) {
      setError(getErrorMessage(workspaceError, "Could not create launch workspace."));
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <Link href="/admin/launch" className="inline-flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors w-max">
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to App Kits
      </Link>

      <header className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Rocket className="w-6 h-6 text-brand" />
            {details.plan.targetCompanyName || details.plan.templateName}
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            Review this draft build plan before creating any workspace, agent, workflow, connector install, knowledge scope, widget, API, or release gate.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2 py-1 rounded-[6px] border border-border-dim bg-foreground/5 text-[10px] font-bold tracking-[0.12em] uppercase text-muted">
            {details.plan.status}
          </span>
          <span className={`px-2 py-1 rounded-[6px] border text-[10px] font-bold tracking-[0.12em] uppercase ${riskClassName[details.plan.riskProfile]}`}>
            {details.plan.riskProfile}
          </span>
          <button
            type="button"
            onClick={handleArchive}
            disabled={isArchiving || details.plan.status === "ARCHIVED"}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] border border-border-dim text-[12px] text-foreground hover:bg-foreground/5 disabled:opacity-50"
          >
            {isArchiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
            Archive
          </button>
          <button
            type="button"
            onClick={handleMaterialize}
            disabled={isMaterializing || details.plan.status !== "DRAFT"}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
          >
            {isMaterializing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Create draft resources
          </button>
        </div>
      </header>

      {error ? <p className="text-[12px] text-rose-500">{error}</p> : null}

      {readinessSummary ? (
        <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-foreground">Build Plan Readiness</h2>
                <span className={`px-2 py-1 rounded-[6px] border text-[10px] font-bold tracking-[0.12em] uppercase ${readinessClassName[readinessSummary.status]}`}>
                  {readinessSummary.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="text-[12px] text-secondary mt-2">
                {readinessSummary.blockerCount === 0
                  ? "Draft setup is ready for review before activation."
                  : `${readinessSummary.blockerCount} blocker${readinessSummary.blockerCount === 1 ? "" : "s"} still need attention before launch review.`}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 min-w-full lg:min-w-[360px]">
              <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Agents</div>
                <div className="text-[18px] font-semibold text-foreground mt-1">{readinessSummary.createdAgentCount}/{readinessSummary.plannedAgentCount}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Workflows</div>
                <div className="text-[18px] font-semibold text-foreground mt-1">{readinessSummary.createdWorkflowCount}/{readinessSummary.plannedWorkflowCount}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Connectors</div>
                <div className="text-[18px] font-semibold text-foreground mt-1">{readinessSummary.connectorReadyCount}/{readinessSummary.connectorTotalCount}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <div>
              <h3 className="text-[12px] font-semibold text-foreground">Blockers</h3>
              <div className="flex flex-col gap-2 mt-2">
                {readinessSummary.blockers.length > 0 ? readinessSummary.blockers.map((blocker) => (
                  <div key={blocker} className="text-[12px] text-secondary rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                    {blocker}
                  </div>
                )) : (
                  <p className="text-[12px] text-secondary">No launch blockers detected in the starter plan.</p>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-[12px] font-semibold text-foreground">Next Actions</h3>
              <div className="flex flex-col gap-2 mt-2">
                {readinessSummary.nextActions.map((action) => (
                  <div key={action} className="flex items-start gap-2 text-[12px] text-secondary rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {developerHandoff ? (
        <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[15px] font-semibold text-foreground">Developer Handoff</h2>
                <span className={`px-2 py-1 rounded-[6px] border text-[10px] font-bold tracking-[0.12em] uppercase ${developerHandoff.status === "READY_FOR_DEVELOPER_REVIEW" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" : "text-amber-500 bg-amber-500/10 border-amber-500/20"}`}>
                  {developerHandoff.status.replaceAll("_", " ")}
                </span>
              </div>
              <p className="text-[12px] text-secondary mt-2 max-w-2xl">
                Product-specific code, data mappings, UI surfaces, and policy decisions still belong to the developer building on this starter.
              </p>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 min-w-full lg:min-w-[480px]">
              <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Follow-ups</div>
                <div className="text-[18px] font-semibold text-foreground mt-1">{developerHandoff.followUpCount}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Extensions</div>
                <div className="text-[18px] font-semibold text-foreground mt-1">{developerHandoff.extensionPointCount}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Code</div>
                <div className="text-[18px] font-semibold text-foreground mt-1">{developerHandoff.implementationPointerCount}</div>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
                <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted">Surfaces</div>
                <div className="text-[18px] font-semibold text-foreground mt-1">{developerHandoff.publishTargetCount}</div>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
            {developerHandoff.checklist.map((item) => (
              <div key={item} className="flex items-start gap-2 text-[12px] text-secondary rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <DeveloperTaskMap summary={developerTaskSummary} tasks={developerTasks} />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="border border-border-dim bg-card/60 rounded-[8px] p-4">
          <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Template</span>
          <p className="text-[14px] font-semibold text-foreground mt-2">{details.plan.templateName}</p>
          <p className="text-[12px] text-secondary mt-1">{details.plan.category}</p>
        </div>
        <div className="border border-border-dim bg-card/60 rounded-[8px] p-4">
          <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Target Workspace</span>
          {linkedWorkspace ? (
            <>
              <Link href={`/admin/companies/${linkedWorkspace.id}`} className="block text-[14px] font-semibold text-brand mt-2 hover:underline truncate">
                {linkedWorkspace.name}
              </Link>
              <p className="text-[12px] text-secondary mt-1">Linked workspace</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-foreground mt-2">{details.plan.targetCompanyName || "Not set"}</p>
              <button
                type="button"
                onClick={handleCreateWorkspace}
                disabled={isCreatingWorkspace || details.plan.status === "ARCHIVED"}
                className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-[8px] border border-border-dim text-[12px] text-foreground hover:bg-foreground/5 disabled:opacity-50"
              >
                {isCreatingWorkspace ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
                Create workspace
              </button>
            </>
          )}
        </div>
        <div className="border border-border-dim bg-card/60 rounded-[8px] p-4">
          <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Safety Defaults</span>
          <div className="flex items-center gap-2 text-[12px] text-secondary mt-2">
            <ShieldCheck className="w-4 h-4 text-brand" />
            {payload.safetyDefaults?.resourceStatus || "DRAFT"} resources, approvals required
          </div>
        </div>
      </section>

      {details.plan.notes ? (
        <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
          <h2 className="text-[14px] font-semibold text-foreground">Developer Notes</h2>
          <p className="text-[13px] text-secondary mt-2 leading-relaxed">{details.plan.notes}</p>
        </section>
      ) : null}

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <PlanSection title="Draft Agents" items={draftResources.agents} />
        <PlanSection title="Knowledge Scopes" items={draftResources.knowledgeScopes} />
        <PlanSection title="Workflows" items={draftResources.workflows} />
        <PlanSection title="Release Evals" items={draftResources.evalFixtures} />
        <PlanSection title="Dashboard Cards" items={draftResources.dashboardCards} />
        <PlanSection title="Publish Targets" items={draftResources.publishTargets} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <PlanSection title="Developer Follow-Up" items={payload.developerFollowUps} />
        <PlanSection title="Extension Points" items={payload.extensionPoints} />
      </section>

      <ImplementationPointersSection pointers={payload.implementationPointers} />

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[14px] font-semibold text-foreground">Connector Readiness</h2>
            <Link href="/admin/ai/tools" className="text-[12px] text-brand hover:underline">Marketplace</Link>
          </div>
          <div className="flex flex-col gap-2 mt-3">
            {(connectorReadiness.length > 0 ? connectorReadiness : (payload.recommendedConnectorKeys ?? []).map((key): LaunchConnectorReadiness => ({
              key,
              label: normalizeConnectorName(key),
              installed: false,
              tenantScoped: false,
            }))).map((connector) => {
              const state = getConnectorState(connector);
              const row = (
                <div className="flex items-center justify-between gap-3 rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-foreground truncate">{connector.label}</div>
                    <div className="text-[10px] text-muted mt-0.5">
                      {connector.tenantScoped ? "Tenant install" : connector.installed ? "Global install" : "Not installed"}
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold tracking-[0.12em] uppercase rounded-[6px] border px-2 py-0.5 flex-shrink-0 ${state.className}`}>
                    {state.label}
                  </span>
                </div>
              );
              return connector.connectorId ? (
                <Link key={connector.key} href={`/admin/ai/tools/connectors/${connector.connectorId}`} className="block hover:opacity-90">
                  {row}
                </Link>
              ) : (
                <div key={connector.key}>{row}</div>
              );
            })}
          </div>
        </section>
        <PlanSection title="Readiness Checks" items={payload.readinessChecks} />
      </section>

      {createdResources ? (
        <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
          <h2 className="text-[14px] font-semibold text-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-brand" />
            Created Draft Resources
          </h2>
          {createdResourceDetails?.missingResourceCount ? (
            <p className="text-[12px] text-amber-500 mt-2">
              {createdResourceDetails.missingResourceCount} linked resource{createdResourceDetails.missingResourceCount === 1 ? "" : "s"} could not be found.
            </p>
          ) : null}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <div className="border border-border-dim rounded-[8px] p-3">
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Agents</div>
              <div className="flex flex-col gap-2 mt-3">
                {(createdResourceDetails?.agents ?? []).map((agent) => (
                  <Link key={agent.id} href={`/admin/agents/${agent.id}`} className="group flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-brand group-hover:underline truncate">{agent.name}</span>
                    <span className="text-muted flex-shrink-0">{agent.fixtureCount} evals</span>
                  </Link>
                ))}
                {!createdResourceDetails ? (
                  <p className="text-[12px] text-secondary">{createdResources.agentIds.length} created</p>
                ) : null}
              </div>
            </div>
            <div className="border border-border-dim rounded-[8px] p-3">
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Workflows</div>
              <div className="flex flex-col gap-2 mt-3">
                {(createdResourceDetails?.workflows ?? []).map((workflow) => (
                  <Link key={workflow.id} href={`/admin/workflows/${workflow.id}`} className="group flex items-center justify-between gap-3 text-[12px]">
                    <span className="text-brand group-hover:underline truncate">{workflow.name}</span>
                    <span className="text-muted flex-shrink-0">{workflow.triggerType.toLowerCase()}</span>
                  </Link>
                ))}
                {!createdResourceDetails ? (
                  <p className="text-[12px] text-secondary">{createdResources.workflowIds.length} created</p>
                ) : null}
              </div>
            </div>
            <div className="border border-border-dim rounded-[8px] p-3">
              <div className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted">Eval Fixtures</div>
              <p className="text-[22px] font-semibold text-foreground mt-2">{createdResourceDetails?.evalFixtureCount ?? createdResources.fixtureIds.length}</p>
              <p className="text-[12px] text-secondary mt-1">Seeded as active smoke-test fixtures on inactive draft agents.</p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
        <h2 className="text-[14px] font-semibold text-foreground flex items-center gap-2">
          <Database className="w-4 h-4 text-brand" />
          Next Creation Step
        </h2>
        <p className="text-[13px] text-secondary mt-2 max-w-3xl">
          Draft agents and workflows can now be created from this plan. Connector installation, knowledge upload, dashboard cards, widgets, and release-gate activation remain deliberate follow-up steps.
        </p>
        <div className="flex flex-wrap gap-2 mt-4">
          {linkedWorkspace ? (
            <Link href={`/admin/companies/${linkedWorkspace.id}`} className="px-3 py-2 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90">
              Open workspace
            </Link>
          ) : (
            <button type="button" onClick={handleCreateWorkspace} disabled={isCreatingWorkspace || details.plan.status === "ARCHIVED"} className="px-3 py-2 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90 disabled:opacity-50">
              Create workspace
            </button>
          )}
          <Link href="/admin/agents" className="px-3 py-2 rounded-[8px] border border-border-dim text-[12px] text-foreground hover:bg-foreground/5">
            Review agents
          </Link>
          <Link href="/admin/ai/tools" className="px-3 py-2 rounded-[8px] border border-border-dim text-[12px] text-foreground hover:bg-foreground/5">
            Install connectors
          </Link>
        </div>
      </section>
    </div>
  );
}
