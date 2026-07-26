"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  ArrowRight,
  BrainCircuit,
  ChevronDown,
  ClipboardCheck,
  Cpu,
  Database,
  FileSearch,
  Gauge,
  Loader2,
  MessageSquareText,
  Puzzle,
  Route,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";

type ReadinessTone = "ready" | "review" | "blocked" | "planned";

type ReadinessItem = {
  title: string;
  description: string;
  href?: string;
  action?: string;
  tone: ReadinessTone;
  value: string;
  icon: typeof Database;
};

type PreviewTone = "ready" | "review" | "blocked" | "planned";

type RuntimePreviewItem = {
  title: string;
  detail: string;
  value: string;
  href?: string;
  tone: PreviewTone;
};

type ReadinessState = "READY" | "NEEDS_REVIEW" | "NOT_READY" | "DRIFTED";
type SuggestionPriority = "BLOCKER" | "WARNING" | "ADVISORY";
type SuggestionTarget = "EVALS" | "MEMORY" | "SKILLS" | "CHAT_LOGS";

type LearningSuggestion = {
  key: string;
  type: string;
  priority: SuggestionPriority;
  title: string;
  detail: string;
  target: SuggestionTarget;
};

type PriorityReason = {
  title: string;
  description: string;
  href?: string;
  action?: string;
  tone: ReadinessTone;
  icon: typeof Database;
};

const REQUIRED_MODEL_USE_CASES = ["chat", "agent", "workflow", "report", "router", "title", "embedding"];

function getToneClasses(tone: ReadinessTone) {
  if (tone === "ready") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (tone === "blocked") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (tone === "planned") return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

function getReadinessLabel(score: number, blockers: number, warnings: number) {
  if (blockers > 0) return "Not ready";
  if (warnings > 0 || score < 80) return "Needs review";
  return "Ready";
}

function getReadinessStateLabel(state: ReadinessState) {
  if (state === "NOT_READY") return "Not ready";
  if (state === "DRIFTED") return "Drifted";
  if (state === "NEEDS_REVIEW") return "Needs review";
  return "Ready";
}

function getReadinessStateClasses(state: ReadinessState) {
  if (state === "NOT_READY") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (state === "DRIFTED") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  if (state === "NEEDS_REVIEW") return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
}

function getSuggestionPriorityClasses(priority: SuggestionPriority) {
  if (priority === "BLOCKER") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (priority === "WARNING") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-blue-500/20 bg-blue-500/10 text-blue-300";
}

function getSuggestionHref(target: SuggestionTarget, aiHref: string) {
  if (target === "MEMORY") return `${aiHref}/memory`;
  if (target === "SKILLS") return `${aiHref}/skills`;
  if (target === "CHAT_LOGS") return `${aiHref}/chat-logs`;
  return `${aiHref}/evals`;
}

function getSuggestionAction(target: SuggestionTarget) {
  if (target === "MEMORY") return "Review memory";
  if (target === "SKILLS") return "Open skills";
  if (target === "CHAT_LOGS") return "Open chat evidence";
  return "Open evals";
}

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function getPreviewToneClasses(tone: PreviewTone) {
  if (tone === "ready") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (tone === "blocked") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (tone === "planned") return "border-blue-500/20 bg-blue-500/10 text-blue-300";
  return "border-amber-500/20 bg-amber-500/10 text-amber-300";
}

function truncatePreviewText(value: string | undefined, fallback: string) {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function getReasonPriority(item: ReadinessItem) {
  const rankByTitle: Record<string, number> = {
    Evals: 10,
    Drift: 20,
    Instructions: 30,
    Memory: 40,
    Skills: 50,
    Widget: 60,
    "Model Routing": 70,
    Knowledge: 80,
    Activity: 90,
  };
  const toneRank = item.tone === "blocked" ? 0 : item.tone === "review" ? 100 : 200;
  return toneRank + (rankByTitle[item.title] ?? 99);
}

function getReasonTitle(item: ReadinessItem) {
  if (item.title === "Instructions") return "Prompt needs review";
  if (item.title === "Model Routing") return "Model routing is incomplete";
  if (item.title === "Evals") return item.tone === "blocked" ? "Blocking eval evidence" : "Eval evidence needs review";
  if (item.title === "Drift") return "Readiness evidence is stale";
  if (item.title === "Memory") return "Memory needs review";
  if (item.title === "Skills") return "Skills need review";
  if (item.title === "Widget") return "Widget needs review";
  if (item.title === "Knowledge") return "Knowledge needs review";
  return `${item.title} needs review`;
}

function getHealthGroup(item: ReadinessItem) {
  if (item.tone === "blocked") return "needsWork";
  if (item.tone === "ready") return "healthy";
  if (item.title === "Activity" || item.title === "Skills") return "quiet";
  return "needsWork";
}

function getStatusLabel(tone: ReadinessTone) {
  if (tone === "blocked") return "Not ready";
  if (tone === "review") return "Needs review";
  if (tone === "planned") return "Planned";
  return "Ready";
}

function HealthRow({ item }: { item: ReadinessItem }) {
  const Icon = item.icon;
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-border-dim bg-background/50 text-brand">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-foreground">{item.title}</h3>
          <p className="mt-0.5 truncate text-[11px] leading-relaxed text-secondary">{item.description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getToneClasses(item.tone)}`}>
          {item.value}
        </span>
        <span className="hidden min-w-[82px] text-right text-[11px] font-semibold text-secondary sm:inline">
          {getStatusLabel(item.tone)}
        </span>
        {item.href && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />}
      </div>
    </>
  );

  if (!item.href) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-2.5">
        {content}
      </div>
    );
  }

  return (
    <Link href={item.href} className="group flex items-center justify-between gap-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-2.5 transition-colors hover:border-brand/30 hover:bg-brand/5">
      {content}
    </Link>
  );
}

function HealthGroupSection({ title, items }: { title: string; items: ReadinessItem[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="text-[12px] font-bold uppercase tracking-widest text-muted">{title}</h2>
      <div className="mt-3 grid grid-cols-1 gap-2">
        {items.map((item) => (
          <HealthRow key={item.title} item={item} />
        ))}
      </div>
    </div>
  );
}

function EvidencePanel({
  children,
  defaultOpen = false,
  icon: Icon,
  summary,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  icon: typeof Database;
  summary: string;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <details
      className="group rounded-[8px] border border-border-dim bg-sidebar/30"
      onToggle={(event) => setIsOpen(event.currentTarget.open)}
      open={isOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-border-dim bg-background/50 text-brand">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-semibold text-foreground">{title}</span>
            <span className="mt-0.5 block truncate text-[11px] leading-relaxed text-secondary">{summary}</span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border-dim px-4 py-4">
        {children}
      </div>
    </details>
  );
}

export default function CompanyAiOverviewPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const baseHref = `/admin/companies/${companyId}`;
  const aiHref = `${baseHref}/ai`;
  const recordReadinessSnapshot = useMutation(api.companyReadiness.recordReadinessSnapshot);
  const [snapshotSummary, setSnapshotSummary] = useState("");
  const action = useAdminAction({ scope: "admin-company-ai" });

  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const knowledgeSummary = useQuery(api.knowledge.getQualitySummary, { companyId });
  const rules = useQuery(api.aiRules.getRules, { companyId });
  const modelDefaults = useQuery(api.aiModels.getCompanyModelDefaults, { companyId });
  const memorySummary = useQuery(api.companyMemories.getSummary, { companyId });
  const memoryPreview = useQuery(api.companyMemories.getPreviewForCompany, { companyId, limit: 3 });
  const skillSummary = useQuery(api.companySkills.getSummary, { companyId });
  const skillPreview = useQuery(api.companySkills.getRuntimePreviewForCompany, { companyId, limit: 3 });
  const evalSummary = useQuery(api.companyEvals.getSummary, { companyId });
  const readinessSummary = useQuery(api.companyReadiness.getReadinessSummary, { companyId });
  const readinessHistory = useQuery(api.companyReadiness.getReadinessHistory, { companyId });
  const learningSuggestions = useQuery(api.companyLearningLoop.getSuggestionsForCompany, { companyId }) as LearningSuggestion[] | undefined;
  const chatThreads = useQuery(api.chatAdmin.getOffsetPaginatedCompanyThreads, {
    companyId,
    searchTerm: "",
    page: 1,
    pageSize: ADMIN_PAGE_SIZE,
  });
  const widget = useQuery(api.widgets.getPrimaryWidgetByCompany, { companyId });

  const isLoading = company === undefined
    || knowledgeSummary === undefined
    || rules === undefined
    || modelDefaults === undefined
    || memorySummary === undefined
    || memoryPreview === undefined
    || skillSummary === undefined
    || skillPreview === undefined
    || evalSummary === undefined
    || readinessSummary === undefined
    || readinessHistory === undefined
    || learningSuggestions === undefined
    || chatThreads === undefined
    || widget === undefined;

  const activeRules = useMemo(() => rules?.filter((rule) => rule.isActive) ?? [], [rules]);
  const activeRuleCount = activeRules.length;
  const configuredModelUseCases = modelDefaults?.defaults.filter((row) =>
    REQUIRED_MODEL_USE_CASES.includes(row.useCase)
    && (row.companyDefault?.model?.isEnabled || row.globalDefault?.model?.isEnabled)
  ).length ?? 0;
  const promptLength = company?.systemPrompt?.trim().length ?? 0;
  const hasPrompt = promptLength >= 80;
  const hasWidget = Boolean(widget);
  const widgetReady = Boolean(widget?.isActive);
  const chatModelDefault = modelDefaults?.defaults.find((row) => row.useCase === "chat");
  const chatModel = chatModelDefault?.companyDefault?.model ?? chatModelDefault?.globalDefault?.model ?? null;
  const chatModelScope = chatModelDefault?.companyDefault?.model ? "Company" : chatModelDefault?.globalDefault?.model ? "Platform" : "Missing";
  const knowledgeTotals = knowledgeSummary?.totals;

  const readinessItems = useMemo<ReadinessItem[]>(() => {
    const knowledgeTone: ReadinessTone = !knowledgeTotals || knowledgeTotals.documents === 0
      ? "blocked"
      : knowledgeTotals.failed > 0
        ? "blocked"
        : knowledgeTotals.readyCoverage < 0.75
          ? "review"
          : "ready";
    const evalTone: ReadinessTone = (evalSummary?.blockerFailures ?? 0) > 0
      ? "blocked"
      : (evalSummary?.totalCases ?? 0) === 0
        || (evalSummary?.blockerNotRun ?? 0) > 0
        || (evalSummary?.failedRuns ?? 0) > 0
        || (evalSummary?.needsReviewRuns ?? 0) > 0
          ? "review"
          : "ready";
    const skillTone: ReadinessTone = (skillSummary?.missingToolRequirementSkills ?? 0) > 0
      || (skillSummary?.highRiskMissingApproval ?? 0) > 0
        ? "blocked"
        : (skillSummary?.activeSkills ?? 0) === 0
          || (skillSummary?.enabledBindings ?? 0) === 0
          || (skillSummary?.readySkills ?? 0) < (skillSummary?.boundActiveSkills ?? 0)
            ? "review"
            : "ready";
    const driftCount = readinessSummary?.drift.unresolvedCount ?? 0;
    const latestDriftReason = readinessSummary?.drift.recentEvents[0]?.reason;

    return [
      {
        title: "Knowledge",
        description: knowledgeTotals
          ? `${knowledgeTotals.ready.toLocaleString()} ready, ${knowledgeTotals.failed.toLocaleString()} failed, ${knowledgeTotals.sampledChunks.toLocaleString()} chunks available for retrieval.`
          : "Knowledge state is loading.",
        href: `${aiHref}/knowledge`,
        action: "Open knowledge",
        tone: knowledgeTone,
        value: knowledgeTotals ? formatPercent(knowledgeTotals.readyCoverage * 100) : "...",
        icon: Database,
      },
      {
        title: "Instructions",
        description: hasPrompt
          ? `Company prompt is configured with ${promptLength.toLocaleString()} characters and ${activeRuleCount} active rule${activeRuleCount === 1 ? "" : "s"}.`
          : `Prompt needs more company-specific instructions. ${activeRuleCount} active rule${activeRuleCount === 1 ? "" : "s"} configured.`,
        href: `${aiHref}/prompt`,
        action: "Review prompt",
        tone: hasPrompt && activeRuleCount > 0 ? "ready" : "review",
        value: hasPrompt ? "Set" : "Review",
        icon: TerminalSquare,
      },
      {
        title: "Model Routing",
        description: `${configuredModelUseCases}/${REQUIRED_MODEL_USE_CASES.length} key use cases resolve to an enabled company or platform model default.`,
        href: `${aiHref}/models`,
        action: "Open models",
        tone: configuredModelUseCases === REQUIRED_MODEL_USE_CASES.length ? "ready" : "blocked",
        value: `${configuredModelUseCases}/${REQUIRED_MODEL_USE_CASES.length}`,
        icon: Cpu,
      },
      {
        title: "Widget",
        description: hasWidget
          ? widgetReady
            ? "Primary company widget exists and is active."
            : "Primary company widget exists but is not active."
          : "No company widget has been created yet.",
        href: `${baseHref}/widget`,
        action: "Open widget",
        tone: widgetReady ? "ready" : "review",
        value: widgetReady ? "Active" : "Review",
        icon: MessageSquareText,
      },
      {
        title: "Memory",
        description: `${memorySummary?.approved.toLocaleString() ?? "..."} memor${memorySummary?.approved === 1 ? "y" : "ies"}, ${memorySummary?.alwaysCount.toLocaleString() ?? "..."} applied to every answer. ${memorySummary?.proposed.toLocaleString() ?? "..."} suggestion${memorySummary?.proposed === 1 ? "" : "s"} waiting for review.`,
        href: `${aiHref}/memory`,
        action: "Open memory",
        tone: (memorySummary?.approved ?? 0) > 0
          ? (memorySummary?.proposed ?? 0) > 0 ? "review" : "ready"
          : "review",
        value: `${memorySummary?.approved ?? 0}`,
        icon: BrainCircuit,
      },
      {
        title: "Skills",
        description: `${skillSummary?.activeSkills.toLocaleString() ?? "..."} active skill${skillSummary?.activeSkills === 1 ? "" : "s"}, ${skillSummary?.enabledBindings.toLocaleString() ?? "..."} enabled binding${skillSummary?.enabledBindings === 1 ? "" : "s"}, ${skillSummary?.missingToolRequirementSkills.toLocaleString() ?? "..."} tool gap${skillSummary?.missingToolRequirementSkills === 1 ? "" : "s"}.`,
        href: `${aiHref}/skills`,
        action: "Open skills",
        tone: skillTone,
        value: `${skillSummary?.readySkills ?? 0}/${skillSummary?.boundActiveSkills ?? 0}`,
        icon: Puzzle,
      },
      {
        title: "Evals",
        description: `${evalSummary?.totalCases.toLocaleString() ?? "..."} active case${evalSummary?.totalCases === 1 ? "" : "s"}, ${evalSummary?.latestRuns.toLocaleString() ?? "..."} latest run${evalSummary?.latestRuns === 1 ? "" : "s"}, ${evalSummary?.blockerFailures.toLocaleString() ?? "..."} blocker failure${evalSummary?.blockerFailures === 1 ? "" : "s"}.`,
        href: `${aiHref}/evals`,
        action: "Open evals",
        tone: evalTone,
        value: (evalSummary?.latestRuns ?? 0) > 0 ? formatPercent((evalSummary?.passRate ?? 0) * 100) : `${evalSummary?.totalCases ?? 0}`,
        icon: ClipboardCheck,
      },
      {
        title: "Drift",
        description: driftCount > 0
          ? `${driftCount.toLocaleString()} unresolved change${driftCount === 1 ? "" : "s"} since the last passing eval evidence. Latest: ${latestDriftReason ?? "configuration changed"}.`
          : "No unresolved company AI drift since the latest passing eval evidence.",
        href: `${aiHref}/evals`,
        action: driftCount > 0 ? "Run evals" : "View evals",
        tone: driftCount > 0 ? "review" : "ready",
        value: `${driftCount}`,
        icon: FileSearch,
      },
      {
        title: "Activity",
        description: `${chatThreads?.totalCount?.toLocaleString() ?? "..."} company chat thread${chatThreads?.totalCount === 1 ? "" : "s"} available as evidence for future evals and memory candidates.`,
        href: `${aiHref}/chat-logs`,
        action: "Open activity",
        tone: (chatThreads?.totalCount ?? 0) > 0 ? "ready" : "review",
        value: `${chatThreads?.totalCount ?? 0}`,
        icon: Activity,
      },
    ];
  }, [
    activeRuleCount,
    aiHref,
    baseHref,
    chatThreads?.totalCount,
    configuredModelUseCases,
    evalSummary,
    hasPrompt,
    hasWidget,
    knowledgeTotals,
    memorySummary,
    promptLength,
    readinessSummary,
    skillSummary,
    widgetReady,
  ]);

  const runtimePreviewItems = useMemo<RuntimePreviewItem[]>(() => {
    const memoryTitles = memoryPreview?.map((memory) => memory.title).join(" · ");
    const skillNames = skillPreview?.map((skill) => `${skill.name}${skill.riskLevel === "HIGH" ? " (high risk)" : ""}`).join(" · ");
    const ruleNames = activeRules.slice(0, 3).map((rule) => rule.name || rule.trigger).join(" · ");
    const knowledgeDetail = knowledgeTotals
      ? `${knowledgeTotals.ready.toLocaleString()} ready document${knowledgeTotals.ready === 1 ? "" : "s"}, ${knowledgeTotals.sampledChunks.toLocaleString()} sampled chunk${knowledgeTotals.sampledChunks === 1 ? "" : "s"}.`
      : "Knowledge summary unavailable.";

    return [
      {
        title: "Platform Safety Contract",
        detail: "Always present before company-specific context.",
        value: "Active",
        tone: "ready",
      },
      {
        title: "Company Prompt",
        detail: truncatePreviewText(company?.systemPrompt, "No company-specific prompt has been written yet."),
        value: hasPrompt ? `${promptLength.toLocaleString()} chars` : "Review",
        href: `${aiHref}/prompt`,
        tone: hasPrompt ? "ready" : "review",
      },
      {
        title: "Active AI Rules",
        detail: ruleNames || "No active company rules are currently applied.",
        value: activeRuleCount.toLocaleString(),
        href: `${aiHref}/rules`,
        tone: activeRuleCount > 0 ? "ready" : "review",
      },
      {
        title: "Approved Company Memory",
        detail: memoryTitles || "No approved company memories are available to runtime.",
        value: `${memorySummary?.approved ?? 0}`,
        href: `${aiHref}/memory`,
        tone: (memorySummary?.approved ?? 0) > 0 ? "ready" : "review",
      },
      {
        title: "Available Company Skills",
        detail: skillNames || "No enabled company skills are available to runtime surfaces.",
        value: `${skillSummary?.boundActiveSkills ?? 0}`,
        href: `${aiHref}/skills`,
        tone: (skillSummary?.missingToolRequirementSkills ?? 0) > 0 || (skillSummary?.highRiskMissingApproval ?? 0) > 0
          ? "blocked"
          : (skillSummary?.boundActiveSkills ?? 0) > 0
            ? "ready"
            : "review",
      },
      {
        title: "Readiness Drift",
        detail: (readinessSummary?.drift.unresolvedCount ?? 0) > 0
          ? readinessSummary?.drift.recentEvents[0]?.reason ?? "Company AI configuration changed since the last passing eval."
          : "No unresolved drift events are currently open.",
        value: `${readinessSummary?.drift.unresolvedCount ?? 0}`,
        href: `${aiHref}/evals`,
        tone: (readinessSummary?.drift.unresolvedCount ?? 0) > 0 ? "review" : "ready",
      },
      {
        title: "Retrieved Knowledge",
        detail: knowledgeDetail,
        value: knowledgeTotals ? formatPercent(knowledgeTotals.readyCoverage * 100) : "...",
        href: `${aiHref}/knowledge`,
        tone: !knowledgeTotals || knowledgeTotals.documents === 0 || knowledgeTotals.failed > 0
          ? "blocked"
          : knowledgeTotals.readyCoverage < 0.75
            ? "review"
            : "ready",
      },
      {
        title: "Chat Model Routing",
        detail: chatModel
          ? `${chatModelScope} default: ${chatModel.providerKey || "provider"} / ${chatModel.providerModelId || chatModel.modelId}`
          : "Chat use case does not resolve to an enabled model.",
        value: chatModel?.displayName || "Missing",
        href: `${aiHref}/models`,
        tone: chatModel?.isEnabled ? "ready" : "blocked",
      },
      {
        title: "Widget Surface",
        detail: widget
          ? truncatePreviewText(widget.themeGreeting, widgetReady ? "Primary widget is active." : "Primary widget is inactive.")
          : "No primary company widget exists.",
        value: widgetReady ? "Active" : "Review",
        href: `${baseHref}/widget`,
        tone: widgetReady ? "ready" : "review",
      },
      {
        title: "User Request",
        detail: "Appended after governed context and untrusted retrieval data.",
        value: "Last",
        tone: "ready",
      },
    ];
  }, [
    activeRuleCount,
    activeRules,
    aiHref,
    baseHref,
    chatModel,
    chatModelScope,
    company?.systemPrompt,
    hasPrompt,
    knowledgeTotals,
    memoryPreview,
    memorySummary?.approved,
    promptLength,
    readinessSummary,
    skillPreview,
    skillSummary,
    widget,
    widgetReady,
  ]);

  const localBlockers = readinessItems.filter((item) => item.tone === "blocked").length;
  const localWarnings = readinessItems.filter((item) => item.tone === "review").length;
  const readyCount = readinessItems.filter((item) => item.tone === "ready").length;
  const scoredItems = readinessItems.filter((item) => item.tone !== "planned");
  const fallbackReadinessScore = scoredItems.length > 0 ? (readyCount / scoredItems.length) * 100 : 0;
  const readinessScore = readinessSummary?.score ?? fallbackReadinessScore;
  const readinessBlockers = readinessSummary?.blockers ?? localBlockers;
  const readinessWarnings = readinessSummary?.warnings ?? localWarnings;
  const readinessLabel = readinessSummary
    ? getReadinessStateLabel(readinessSummary.state)
    : getReadinessLabel(readinessScore, readinessBlockers, readinessWarnings);
  const readinessTone: ReadinessTone = readinessBlockers > 0
    ? "blocked"
    : readinessWarnings > 0 || (readinessSummary?.drift.unresolvedCount ?? 0) > 0
      ? "review"
      : "ready";
  const readinessSummaryText = readinessTone === "blocked"
    ? "Resolve the blocker areas before treating this company AI as production-ready."
    : readinessTone === "review"
      ? "The AI can run, but the items below need attention before this setup should be treated as fully ready."
      : "This company AI has the core evidence needed for the current readiness gate.";
  const priorityReasons = useMemo<PriorityReason[]>(() => readinessItems
    .filter((item) => item.tone === "blocked" || item.tone === "review")
    .sort((a, b) => getReasonPriority(a) - getReasonPriority(b))
    .slice(0, 3)
    .map((item) => ({
      title: getReasonTitle(item),
      description: item.description,
      href: item.href,
      action: item.action,
      tone: item.tone,
      icon: item.icon,
    })), [readinessItems]);
  const nextBestAction = priorityReasons.find((reason) => reason.href) ?? null;
  const needsWorkItems = readinessItems.filter((item) => getHealthGroup(item) === "needsWork");
  const healthyItems = readinessItems.filter((item) => getHealthGroup(item) === "healthy");
  const quietItems = readinessItems.filter((item) => getHealthGroup(item) === "quiet");

  const handleRecordSnapshot = async () => {
    setSnapshotSummary("");
    const outcome = await action.run(() => recordReadinessSnapshot({ companyId }), {
      fallbackMessage: "Readiness snapshot could not be recorded.",
      suppressErrorToast: true,
    });
    if (!outcome.ok) return;
    setSnapshotSummary(
      `Snapshot recorded: ${getReadinessStateLabel(outcome.data.state)} at ${formatPercent(outcome.data.score)}.`,
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-[420px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 pb-12">
      <header>
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
          <Sparkles className="h-6 w-6 text-brand" />
          Company AI
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
          Readiness for {company?.name || "this company"} across instructions, evidence, model routing, widget exposure, memory, skills, and evals.
        </p>
      </header>

      <section className={`rounded-[8px] border p-5 ${
        readinessTone === "blocked"
          ? "border-red-500/20 bg-red-500/10"
          : readinessTone === "review"
            ? "border-amber-500/20 bg-amber-500/10"
            : "border-emerald-500/20 bg-emerald-500/10"
      }`}>
        <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[0.85fr_1.15fr]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`inline-flex items-center rounded-[8px] border px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest ${getToneClasses(readinessTone)}`}>
                {readinessLabel}
              </span>
              <span className="inline-flex items-center gap-2 text-[13px] text-secondary">
                <Gauge className="h-4 w-4 text-brand" />
                Readiness
              </span>
            </div>
            <div className="mt-4 text-[46px] font-semibold leading-none tracking-tight text-foreground">
              {formatPercent(readinessScore)}
            </div>
            <p className="mt-3 max-w-xl text-[13px] leading-relaxed text-secondary">
              {readinessSummaryText}
            </p>
          </div>

          <div className="rounded-[8px] border border-border-dim bg-background/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-[14px] font-semibold text-foreground">Why this state</h2>
                <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                  {priorityReasons.length > 0 ? "Fix these first." : "No readiness issues are currently waiting."}
                </p>
              </div>
              {nextBestAction?.href && (
                <Link href={nextBestAction.href} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90">
                  <span>{nextBestAction.action || "Open section"}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              {priorityReasons.length === 0 ? (
                <div className="flex items-center gap-3 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-[12px] text-emerald-200">
                  <ShieldCheck className="h-4 w-4 shrink-0" />
                  <span>All tracked readiness areas are currently clear.</span>
                </div>
              ) : priorityReasons.map((reason) => {
                const Icon = reason.icon;
                const row = (
                  <>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-border-dim bg-background/50 text-brand">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground">{reason.title}</span>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getToneClasses(reason.tone)}`}>
                          {getStatusLabel(reason.tone)}
                        </span>
                      </span>
                      <span className="mt-1 block text-[12px] leading-relaxed text-secondary">{reason.description}</span>
                    </span>
                    {reason.href && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />}
                  </>
                );

                if (reason.href) {
                  return (
                    <Link
                      key={reason.title}
                      href={reason.href}
                      className="group flex items-start gap-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-3 transition-colors hover:border-brand/30 hover:bg-brand/5"
                    >
                      {row}
                    </Link>
                  );
                }

                return (
                  <div key={reason.title} className="flex items-start gap-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-3">
                    {row}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-foreground">Health summary</h2>
          <p className="text-[12px] leading-relaxed text-secondary">
            Priority across the company AI stack.
          </p>
        </div>
        <div className="mt-5 grid grid-cols-1 gap-5 2xl:grid-cols-3">
          <HealthGroupSection title="Needs work" items={needsWorkItems} />
          <HealthGroupSection title="Healthy" items={healthyItems} />
          <HealthGroupSection title="Quiet" items={quietItems} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-semibold text-foreground">Supporting evidence</h2>
          <p className="text-[12px] leading-relaxed text-secondary">
            Runtime order, snapshots, learning signals, and score context.
          </p>
        </div>

        <EvidencePanel
          icon={Route}
          summary="Current chat and widget context stack."
          title="Runtime context preview"
        >
          <div className="grid grid-cols-1 gap-2">
            {runtimePreviewItems.map((item, index) => {
              const row = (
                <>
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-brand/20 bg-brand/10 text-[11px] font-mono text-brand">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-semibold text-foreground">{item.title}</span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getPreviewToneClasses(item.tone)}`}>
                        {item.value}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[11px] leading-relaxed text-secondary">{item.detail}</p>
                  </div>
                  {item.href && <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />}
                </>
              );

              if (item.href) {
                return (
                  <Link
                    key={`${item.title}:${index}`}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 transition-colors hover:border-brand/30 hover:bg-brand/5"
                  >
                    {row}
                  </Link>
                );
              }

              return (
                <div key={`${item.title}:${index}`} className="flex items-center gap-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-2">
                  {row}
                </div>
              );
            })}
          </div>
        </EvidencePanel>

        <EvidencePanel
          icon={FileSearch}
          summary="Stored evidence snapshots and score changes."
          title="Readiness history"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] leading-relaxed text-secondary">
              Evidence snapshots preserve the computed score, state, blockers, warnings, and drift count.
            </p>
            <button
              type="button"
              onClick={handleRecordSnapshot}
              disabled={action.isBusy()}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-brand/20 bg-brand/10 px-3 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/15 disabled:opacity-50"
            >
              {action.isBusy() ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
              Snapshot
            </button>
          </div>
          {(snapshotSummary || action.error) && (
            <div className="mt-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 text-[12px] text-secondary">
              {snapshotSummary || action.error}
            </div>
          )}
          <div className="mt-4 flex flex-col gap-2">
            {readinessHistory.length === 0 ? (
              <div className="rounded-[8px] border border-border-dim bg-background/50 px-3 py-4 text-[12px] text-muted">
                No readiness snapshots recorded yet.
              </div>
            ) : readinessHistory.slice(0, 5).map((snapshot) => (
              <div key={snapshot._id} className="rounded-[8px] border border-border-dim bg-background/50 px-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getReadinessStateClasses(snapshot.state)}`}>
                    {getReadinessStateLabel(snapshot.state)}
                  </span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted">{formatDateTime(snapshot.createdAt)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-secondary">
                  <span>{formatPercent(snapshot.score)} score</span>
                  <span>{snapshot.blockers} blocker{snapshot.blockers === 1 ? "" : "s"}</span>
                  <span>{snapshot.warnings} warning{snapshot.warnings === 1 ? "" : "s"}</span>
                  <span>{snapshot.driftEventCount} drift</span>
                </div>
              </div>
            ))}
          </div>
        </EvidencePanel>

        <EvidencePanel
          defaultOpen={learningSuggestions.length > 0}
          icon={BrainCircuit}
          summary="Evidence-backed actions from drift, evals, memory, and skills."
          title="Learning suggestions"
        >
          <div className="flex justify-end">
            <Link href={`${aiHref}/chat-logs`} className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim bg-background/50 px-3 text-[12px] font-semibold text-secondary transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand">
              <MessageSquareText className="h-3.5 w-3.5" />
              Chat evidence
            </Link>
          </div>
          {learningSuggestions.length === 0 ? (
            <div className="mt-4 flex items-center gap-3 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-[12px] text-emerald-200">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>No evidence-backed learning actions are waiting right now.</span>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
              {learningSuggestions.map((suggestion) => (
                <Link
                  key={suggestion.key}
                  href={getSuggestionHref(suggestion.target, aiHref)}
                  className="group flex min-h-[118px] flex-col justify-between rounded-[8px] border border-border-dim bg-background/50 p-4 transition-colors hover:border-brand/30 hover:bg-brand/5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground">{suggestion.title}</span>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getSuggestionPriorityClasses(suggestion.priority)}`}>
                          {suggestion.priority}
                        </span>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-secondary">{suggestion.detail}</p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                  <span className="mt-3 inline-flex text-[12px] font-semibold text-brand">{getSuggestionAction(suggestion.target)}</span>
                </Link>
              ))}
            </div>
          )}
        </EvidencePanel>

        <EvidencePanel
          icon={ShieldCheck}
          summary="What contributes to the readiness score."
          title="Evidence-based readiness"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <p className="max-w-4xl text-[12px] leading-relaxed text-secondary">
              This overview scores governed company memory, company skills, deterministic company evals, unresolved drift evidence, and the learning suggestions needed to turn chat evidence into reviewed improvements.
            </p>
          <Link href={`${aiHref}/evals`} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 whitespace-nowrap sm:min-w-[150px]">
            <ClipboardCheck className="h-4 w-4" />
            Open evals
          </Link>
          </div>
        </EvidencePanel>
      </section>
    </div>
  );
}
