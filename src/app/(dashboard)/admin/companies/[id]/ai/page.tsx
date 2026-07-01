"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BrainCircuit,
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

function ReadinessCard({ item }: { item: ReadinessItem }) {
  const Icon = item.icon;
  const footerLabel = item.action || (item.tone === "planned" ? "Planned layer" : undefined);
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border border-border-dim bg-background/50 text-brand">
          <Icon className="h-4 w-4" />
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest ${getToneClasses(item.tone)}`}>
          {item.value}
        </span>
      </div>
      <div className="mt-4 min-w-0">
        <h3 className="text-[14px] font-semibold text-foreground">{item.title}</h3>
        <p className="mt-1 text-[12px] leading-relaxed text-secondary">{item.description}</p>
      </div>
      {footerLabel && (
        <div className="mt-auto pt-4">
          <div className={`inline-flex h-8 items-center gap-2 rounded-[8px] border px-3 text-[12px] font-semibold transition-colors ${
            item.href
              ? "border-brand/20 bg-brand/10 text-brand group-hover:border-brand/40 group-hover:bg-brand/15"
              : "border-border-dim bg-background/50 text-muted"
          }`}>
            <span>{footerLabel}</span>
            {item.href && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
          </div>
        </div>
      )}
    </>
  );

  if (!item.href) {
    return (
      <div className="flex min-h-[220px] flex-col rounded-[8px] border border-border-dim bg-sidebar/30 p-4">
        {content}
      </div>
    );
  }

  return (
    <Link href={item.href} className="group flex min-h-[220px] flex-col rounded-[8px] border border-border-dim bg-sidebar/30 p-4 transition-colors hover:border-brand/30 hover:bg-brand/5">
      {content}
    </Link>
  );
}

export default function CompanyAiOverviewPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const baseHref = `/admin/companies/${companyId}`;
  const aiHref = `${baseHref}/ai`;
  const recordReadinessSnapshot = useMutation(api.companyReadiness.recordReadinessSnapshot);
  const [isRecordingSnapshot, setIsRecordingSnapshot] = useState(false);
  const [snapshotFeedback, setSnapshotFeedback] = useState("");

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
        description: `${memorySummary?.approved.toLocaleString() ?? "..."} approved memor${memorySummary?.approved === 1 ? "y" : "ies"}, ${memorySummary?.proposed.toLocaleString() ?? "..."} candidate${memorySummary?.proposed === 1 ? "" : "s"} waiting for review. Company and widget chat runtime evidence is enabled.`,
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

  const handleRecordSnapshot = async () => {
    setIsRecordingSnapshot(true);
    setSnapshotFeedback("");
    try {
      const snapshot = await recordReadinessSnapshot({ companyId });
      setSnapshotFeedback(`Snapshot recorded: ${getReadinessStateLabel(snapshot.state)} at ${formatPercent(snapshot.score)}.`);
    } catch (error) {
      setSnapshotFeedback(error instanceof Error ? error.message : "Readiness snapshot could not be recorded.");
    } finally {
      setIsRecordingSnapshot(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[420px] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
              <Sparkles className="h-6 w-6 text-brand" />
              Company AI Overview
            </h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
              Readiness control room for {company?.name || "this company"} across knowledge, instructions, model routing, widget exposure, and the next company AI layers.
            </p>
          </div>
          <div className={`rounded-[8px] border px-4 py-3 ${readinessBlockers > 0 ? "border-red-500/20 bg-red-500/10" : readinessWarnings > 0 ? "border-amber-500/20 bg-amber-500/10" : "border-emerald-500/20 bg-emerald-500/10"}`}>
            <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
              <div className="flex items-center gap-3">
                <Gauge className="h-5 w-5 shrink-0 text-brand" />
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Readiness</div>
                  <div className="text-[24px] font-semibold text-foreground">{formatPercent(readinessScore)}</div>
                </div>
              </div>
              <span className="inline-flex h-8 shrink-0 items-center rounded-[8px] border border-border-dim bg-background/60 px-3 text-[10px] font-bold uppercase tracking-widest text-secondary whitespace-nowrap">
                {readinessLabel}
              </span>
            </div>
          </div>
        </div>

        {readinessBlockers > 0 && (
          <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-200 flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Resolve blocker areas before treating this company AI as production-ready. Blockers now include failed blocker evals, widget gate failures, and high-risk skill requirement gaps.
            </p>
          </div>
        )}

        {readinessBlockers === 0 && (readinessSummary?.drift.unresolvedCount ?? 0) > 0 && (
          <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100 flex gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Company AI has changed since the latest passing eval evidence. Run the affected evals before treating readiness as current.
            </p>
          </div>
        )}
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {readinessItems.map((item) => (
          <ReadinessCard key={item.title} item={item} />
        ))}
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4">
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <div className="flex items-center gap-2 text-foreground">
            <Route className="h-4 w-4 text-brand" />
            <h2 className="text-[14px] font-semibold">Runtime Context Preview</h2>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-secondary">
            Current company chat and widget context stack, using stored configuration and approved runtime evidence.
          </p>
          <div className="mt-4 grid grid-cols-1 gap-2">
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
        </div>

        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-foreground">
                <FileSearch className="h-4 w-4 text-brand" />
                <h2 className="text-[14px] font-semibold">Readiness History</h2>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-secondary">
                Evidence snapshots preserve the computed score, state, blockers, warnings, and drift count.
              </p>
            </div>
            <button
              type="button"
              onClick={handleRecordSnapshot}
              disabled={isRecordingSnapshot}
              className="inline-flex h-8 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-brand/20 bg-brand/10 px-3 text-[12px] font-semibold text-brand transition-colors hover:bg-brand/15 disabled:opacity-50"
            >
              {isRecordingSnapshot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
              Snapshot
            </button>
          </div>
          {snapshotFeedback && (
            <div className="mt-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-2 text-[12px] text-secondary">
              {snapshotFeedback}
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
        </div>
      </section>

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <BrainCircuit className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Learning Suggestions</h2>
              <p className="mt-1 max-w-4xl text-[12px] leading-relaxed text-secondary">
                Suggested next actions from unresolved drift, eval evidence, memory candidates, and skill readiness gaps.
              </p>
            </div>
          </div>
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
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
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
      </section>

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              <h2 className="text-[14px] font-semibold text-foreground">Evidence-Based Readiness</h2>
              <p className="mt-1 max-w-4xl text-[12px] leading-relaxed text-secondary">
                This overview scores governed company memory, company skills, deterministic company evals, unresolved drift evidence, and the learning suggestions needed to turn chat evidence into reviewed improvements.
              </p>
            </div>
          </div>
          <Link href={`${aiHref}/evals`} className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 whitespace-nowrap sm:min-w-[150px]">
            <ClipboardCheck className="h-4 w-4" />
            Open evals
          </Link>
        </div>
      </section>
    </div>
  );
}
