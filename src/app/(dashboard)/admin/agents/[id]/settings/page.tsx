"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import type { DragEvent, FormEvent } from "react";
import { useParams } from "next/navigation";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  ImagePlus,
  Globe,
  Sparkles,
  Loader2,
  Rocket
} from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useTranslations } from "next-intl";
import { formatDateTime } from "@/src/lib/dates";
import {
  AdminSaveAction,
  AdminSaveError,
} from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import {
  formatModelDisplayName,
  formatTokenCost,
} from "@/src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils";

type ReasoningEffort = "LOW" | "MEDIUM" | "HIGH";
type ModelSelectionMode = "inherit" | "override";
type SmokeEvalMode = "CONTRACT_ONLY" | "MODEL_GRADED";
type AgentReleaseStatus = "PENDING_SIGNOFF" | "APPROVED" | "ACTIVATED" | "ROLLED_BACK" | "CANCELLED";

type ReleaseSnapshotComparison = {
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

type LatestAgentRelease = {
  _id: Id<"agentReleases">;
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
  versionNumber?: number;
  createdAt: number;
  approvedAt?: number;
  activatedAt?: number;
  rolledBackAt?: number;
  cancelledAt?: number;
  evidenceSummary?: ReleaseEvidenceSummary;
  nextAction?: ReleaseNextAction;
  snapshotComparison?: ReleaseSnapshotComparison | null;
};

type AgentSettingsFormData = {
  name: string;
  description: string;
  avatar: string;
  modelId: string;
  modelSelectionMode: ModelSelectionMode;
  thinkingMode: boolean;
  reasoningEffort: ReasoningEffort;
  allowInternetAccess: boolean;
  isActive: boolean;
  /** Inverted for display: the switch reads as the safe state being on. */
  requireHumanApproval: boolean;
  /** Blank follows the platform window. */
  approvalExpiryHours: string;
  /** Blank means inherit the platform default. Held as text so a box can be empty. */
  maxSteps: string;
  maxToolCalls: string;
  maxRuntimeMinutes: string;
  maxCostGBP: string;
  storageId?: Id<"_storage">;
};

const emptyFormData: AgentSettingsFormData = {
  name: "",
  description: "",
  avatar: "",
  modelId: "",
  modelSelectionMode: "inherit",
  thinkingMode: false,
  reasoningEffort: "MEDIUM",
  allowInternetAccess: false,
  isActive: true,
  requireHumanApproval: true,
  approvalExpiryHours: "",
  maxSteps: "",
  maxToolCalls: "",
  maxRuntimeMinutes: "",
  maxCostGBP: "",
};

const reasoningLevels: ReasoningEffort[] = ["LOW", "MEDIUM", "HIGH"];

/**
 * Mirrors of the runtime's platform defaults and ceilings.
 *
 * Named on screen beside each box so a blank field says what it will do and a
 * typed one can be judged against the ceiling it will be clamped to. Duplicated
 * rather than imported because these live in a Convex module; the drift guard in
 * `quality-drift.test.ts` pins them to the runtime values.
 */
const AGENT_LIMIT_DEFAULTS = { maxSteps: 10, maxToolCalls: 8, maxRuntimeMinutes: 5, maxCostGBP: 1 } as const;
const AGENT_LIMIT_CEILINGS = { maxSteps: 24, maxToolCalls: 20, maxRuntimeMinutes: 8, maxCostGBP: 20 } as const;

/** Empty, zero and nonsense all mean "inherit the default", matching the server. */
function parseLimitInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function getActivationWindowState(release: Pick<LatestAgentRelease, "activationWindowStart" | "activationWindowEnd">) {
  const now = Date.now();
  if (release.activationWindowStart && now < release.activationWindowStart) {
    return {
      canActivate: false,
      label: "Window not open",
      detail: `Activation opens ${formatDateTime(release.activationWindowStart)}.`,
    };
  }
  if (release.activationWindowEnd && now > release.activationWindowEnd) {
    return {
      canActivate: false,
      label: "Window expired",
      detail: `Activation closed ${formatDateTime(release.activationWindowEnd)}. Cancel or create a replacement candidate.`,
    };
  }
  if (release.activationWindowEnd) {
    return {
      canActivate: true,
      label: "Activate release",
      detail: `Activation window closes ${formatDateTime(release.activationWindowEnd)}.`,
    };
  }
  return {
    canActivate: true,
    label: "Activate release",
    detail: "Manual activation is available after approval.",
  };
}

function ReleaseSnapshotComparisonPanel({ comparison }: { comparison: ReleaseSnapshotComparison }) {
  const [showAllDetails, setShowAllDetails] = useState(false);
  const visibleDetails = showAllDetails ? comparison.details : comparison.details.slice(0, 2);

  return (
    <div className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted">Snapshot comparison</span>
        <span className="text-[11px] text-muted">
          v{comparison.currentVersionNumber ?? "?"}
          {comparison.baselineVersionNumber
            ? ` vs v${comparison.baselineVersionNumber}`
            : ""}
        </span>
      </div>
      <p className="mt-1 text-[11px] text-secondary leading-relaxed">
        {comparison.summary}
      </p>
      {comparison.changedAreas.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {comparison.changedAreas.map((area) => (
            <span key={area} className="rounded-[6px] border border-brand/20 bg-brand/10 px-2 py-1 text-[10px] text-brand">
              {area}
            </span>
          ))}
        </div>
      ) : null}
      {visibleDetails.length > 0 ? (
        <div className="mt-2 grid grid-cols-1 gap-1.5">
          {visibleDetails.map((detail) => (
            <div key={detail.area} className="rounded-[6px] border border-border-dim bg-black/10 px-2 py-1.5 text-[10px] text-muted">
              <div className="font-medium text-secondary">{detail.area}</div>
              <div className="mt-1">Before: {detail.before}</div>
              <div>After: {detail.after}</div>
            </div>
          ))}
        </div>
      ) : null}
      {comparison.details.length > 2 ? (
        <button
          type="button"
          onClick={() => setShowAllDetails((current) => !current)}
          className="mt-2 rounded-[6px] border border-border-dim bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-foreground transition-all hover:bg-white/[0.08]"
        >
          {showAllDetails ? "Show fewer fields" : `Show all ${comparison.details.length} fields`}
        </button>
      ) : null}
      {comparison.unchangedAreas.length > 0 ? (
        <div className="mt-2 border-t border-border-dim pt-2">
          <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Stable fields</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {comparison.unchangedAreas.map((area) => (
              <span key={area} className="rounded-[6px] border border-border-dim bg-black/10 px-2 py-1 text-[10px] text-muted">
                {area}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AgentOverviewPage() {
  const t = useTranslations("admin.agents.details.settings");
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const agent = useQuery(api.agents.get, { id: agentId });
  const readiness = useQuery(api.agents.getAgentReadiness, { id: agentId });
  const latestRelease = useQuery(api.releases.getLatestReleaseForAgent, { agentId }) as LatestAgentRelease | null | undefined;
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "agent" });
  const activeModels = useMemo(
    () => (activeModelsData ?? []) as Doc<"aiModels">[],
    [activeModelsData],
  );
  const defaultModelId = useMemo(
    () => activeModels.find((model) => model.isDefault)?.modelId ?? "",
    [activeModels],
  );

  // So a blank box can name the window it will actually follow, rather than
  // leaving the reader to guess.
  const approvalExpiry = useQuery(api.agentRuns.getApprovalExpiryConfig, {});
  const updateAgent = useMutation(api.agents.updateAgent);
  const runSmokeEval = useMutation(api.agentEvalFixtures.runSmokeEval);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  const createReleaseCandidate = useMutation(api.releases.createReleaseCandidate);
  const approveReleaseCandidate = useMutation(api.releases.approveReleaseCandidate);
  const cancelReleaseCandidate = useMutation(api.releases.cancelReleaseCandidate);
  const activateReleaseCandidate = useMutation(api.releases.activateReleaseCandidate);
  const rollbackRelease = useMutation(api.releases.rollbackRelease);

  const [formData, setFormData] = useState<AgentSettingsFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [readinessFeedback, setReadinessFeedback] = useState("");
  const [releaseFeedback, setReleaseFeedback] = useState("");
  const [releaseAction, setReleaseAction] = useState<string | null>(null);
  const [smokeEvalMode, setSmokeEvalMode] = useState<SmokeEvalMode | null>(null);

  // What "follow the platform default" would actually mean, named before it is
  // chosen rather than left as a greyed-out box. The server resolves it for this
  // agent's own job — `workflow` for a workflow-backed agent, `agent` otherwise —
  // including the fallbacks behind it.
  const modelReadiness = readiness?.modelReadiness;
  const inheritedModelId = modelReadiness?.inheritedModelId;
  const inheritedModel = activeModels.find((model) => model.modelId === inheritedModelId);
  const inheritOptionLabel = inheritedModelId
    ? t("sections.engine.model.followDefaultNamed", {
        model: inheritedModel ? formatModelDisplayName(inheritedModel) : inheritedModelId,
      })
    : readiness === undefined
      ? t("sections.engine.model.followDefault")
      : t("sections.engine.model.followDefaultMissing");

  // An agent pinned to a model that is no longer offered still shows what it is
  // pinned to, rather than appearing unset.
  const isLegacyOverride = formData.modelSelectionMode === "override"
    && Boolean(formData.modelId)
    && activeModels.length > 0
    && !activeModels.some((model) => model.modelId === formData.modelId);

  // Only about the model that is actually saved: an unsaved change to this
  // control has not been judged yet.
  const isOverrideUnusable = modelReadiness?.source === "override"
    && modelReadiness.status === "WARN"
    && formData.modelSelectionMode === "override"
    && formData.modelId === modelReadiness.modelId;

  const describeModelPrice = (model: Doc<"aiModels">) => {
    const input = formatTokenCost(model.standardInputCostBelow200k);
    const output = formatTokenCost(model.outputResponseCost);
    if (input === "—" && output === "—") return "";
    return ` · ${input} in · ${output} out`;
  };

  // Avatar Upload State
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initializedAgentIdRef = useRef<Id<"agents"> | null>(null);

  useEffect(() => {
    if (!agent || initializedAgentIdRef.current === agent._id) return;
    if (!agent.modelId && activeModelsData === undefined) return;

    initializedAgentIdRef.current = agent._id;
    setFormData({
      name: agent.name || "",
      description: agent.description || "",
      avatar: agent.avatar || "",
      modelId: agent.modelId || defaultModelId,
      // An agent with no stored mode inherits — that is what the runtime does
      // (`resolveAgentModelReadiness` only applies the agent's own model when the
      // mode is "override"). Reading it as "override" here meant opening an older
      // agent, changing its name, and saving pinned it to whatever the platform
      // default happened to be at that moment. Nothing on screen said so, and it
      // stopped following the platform default from then on.
      modelSelectionMode: agent.modelSelectionMode ?? "inherit",
      thinkingMode: agent.thinkingMode || false,
      reasoningEffort: agent.reasoningEffort || "MEDIUM",
      allowInternetAccess: agent.allowInternetAccess || false,
      isActive: agent.isActive ?? true,
      // Absent means gated, exactly as the runtime reads it. Only an explicit
      // true makes an agent autonomous, so an agent that predates the setting
      // shows the switch on.
      requireHumanApproval: agent.autonomousToolExecution !== true,
      approvalExpiryHours: agent.approvalExpiryHours ? String(agent.approvalExpiryHours) : "",
      maxSteps: agent.maxSteps ? String(agent.maxSteps) : "",
      maxToolCalls: agent.maxToolCalls ? String(agent.maxToolCalls) : "",
      maxRuntimeMinutes: agent.maxRuntimeMs ? String(Math.round(agent.maxRuntimeMs / 60000)) : "",
      maxCostGBP: agent.maxCostGBP ? String(agent.maxCostGBP) : "",
      storageId: undefined,
    });
  }, [agent, activeModelsData, defaultModelId]);

  const handleSave = async (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    if (activationSmokeBlocked) {
      setSaveError(t("errors.activationBlocked"));
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      await updateAgent({
        id: agentId,
        name: formData.name,
        description: formData.description,
        avatar: formData.avatar,
        modelSelectionMode: formData.modelSelectionMode,
        ...(formData.modelSelectionMode === "override" ? { modelId: formData.modelId } : {}),
        thinkingMode: formData.thinkingMode,
        reasoningEffort: formData.reasoningEffort,
        allowInternetAccess: formData.allowInternetAccess,
        isActive: formData.isActive,
        autonomousToolExecution: !formData.requireHumanApproval,
        approvalExpiryHours: parseLimitInput(formData.approvalExpiryHours) ?? 0,
        // Zero rather than omitted, because an omitted argument means "leave the
        // stored value alone" and a cleared box has to mean "go back to the
        // platform default". The server turns anything unusable into a removal.
        maxSteps: parseLimitInput(formData.maxSteps) ?? 0,
        maxToolCalls: parseLimitInput(formData.maxToolCalls) ?? 0,
        maxRuntimeMs: (parseLimitInput(formData.maxRuntimeMinutes) ?? 0) * 60000,
        maxCostGBP: parseLimitInput(formData.maxCostGBP) ?? 0,
        storageId: formData.storageId
      });
      setFormData((prev) => ({ ...prev, storageId: undefined }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, t("errors.saveFailed")));
    } finally {
      setIsSaving(false);
    }
  };

  const processUpload = async (file: File) => {
    const validation = validateUploadFile(file, "adminImage");
    if (!validation.allowed) {
      setUploadError(validation.reason);
      return;
    }

    setIsUploading(true);
    setUploadError("");
    try {
      const postUrl = await generateUploadUrl();
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json() as { storageId: Id<"_storage"> };
      const localPreviewUrl = URL.createObjectURL(file);

      setFormData((prev) => ({
        ...prev,
        storageId,
        avatar: localPreviewUrl
      }));
      setIsAvatarModalOpen(false);
    } catch (error) {
      console.error("Upload failed", error);
      setUploadError(t("errors.uploadFailed"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrag = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUpload(e.dataTransfer.files[0]);
    }
  };

  const readinessWarningCount = readiness?.activationWarnings.length ?? 0;
  const hasActivationRisk = formData.isActive && readinessWarningCount > 0;
  const isActivatingDraft = agent?.isActive === false && formData.isActive;
  const activationSmokeBlocked = isActivatingDraft && (readiness?.successfulSmokeEvalRunCount ?? 0) === 0;
  const activationReleaseBlocked = isActivatingDraft
    && (readiness?.successfulSmokeEvalRunCount ?? 0) > 0
    && (
      readiness?.latestSmokeEvalRun?.status !== "SUCCESS"
      || (readiness?.releaseGatePolicy.blockedCriticalFixtureCount ?? 0) > 0
      || Boolean(readiness?.releaseGatePolicy.warning)
    );
  const latestSmokePassed = readiness?.latestSmokeEvalRun?.status === "SUCCESS";
  const fixtureCoverageCoveredCount = readiness?.fixtureCoverage.filter((coverage) => coverage.activeCount > 0).length ?? 0;
  const latestReleaseStatusClass = latestRelease?.status === "ACTIVATED"
    ? "border-sky-400/30 bg-sky-400/10 text-sky-300"
    : latestRelease?.status === "APPROVED"
      ? "border-green-400/30 bg-green-400/10 text-green-300"
      : latestRelease?.status === "ROLLED_BACK" || latestRelease?.status === "CANCELLED"
        ? "border-neutral-400/30 bg-neutral-400/10 text-secondary"
        : "border-amber-400/30 bg-amber-400/10 text-amber-300";
  const activationWindowState = latestRelease ? getActivationWindowState(latestRelease) : null;
  const hasOpenRelease = latestRelease?.status === "PENDING_SIGNOFF" || latestRelease?.status === "APPROVED";
  const canCreateReleaseCandidate = Boolean(
    readiness
    && agent?.isActive === false
    && readiness.activationWarnings.length === 0
    && readiness.latestSmokeEvalRun?.status === "SUCCESS"
    && (readiness.releaseGatePolicy.blockedCriticalFixtureCount ?? 0) === 0
    && !readiness.releaseGatePolicy.warning
    && !hasOpenRelease
    && latestRelease?.status !== "ACTIVATED"
  );

  const runReleaseAction = async (actionKey: string, action: () => Promise<unknown>, successMessage: string) => {
    if (releaseAction) return;
    setReleaseAction(actionKey);
    setReleaseFeedback("");
    try {
      await action();
      setReleaseFeedback(successMessage);
    } catch (error) {
      setReleaseFeedback(getErrorMessage(error, "Release action failed."));
    } finally {
      setReleaseAction(null);
    }
  };

  const handleRunSmokeEval = async (gradingMode: SmokeEvalMode) => {
    setSmokeEvalMode(gradingMode);
    setReadinessFeedback("");
    try {
      const result = await runSmokeEval({ agentId, gradingMode });
      setReadinessFeedback(
        result.status === "QUEUED"
          ? t("sections.engine.readiness.smokeRunQueued")
          : result.status === "SUCCESS"
            ? t("sections.engine.readiness.smokeRunSuccess")
            : t("sections.engine.readiness.smokeRunFailed"),
      );
    } catch (error) {
      setReadinessFeedback(getErrorMessage(error, t("sections.engine.readiness.smokeRunFailed")));
    } finally {
      setSmokeEvalMode(null);
    }
  };

  if (agent === undefined) return <div className="p-8 text-secondary">{t("loading")}</div>;
  if (agent === null) return <div className="p-8 text-red-500">{t("notFound")}</div>;

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 antialiased">
      <form onSubmit={handleSave} className="flex flex-col gap-12 w-full">
	        <div className="flex flex-col gap-6">
	          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim/50 pb-4">
            <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">1</span>
              {t("sections.identity.title")}
            </h2>

            <AdminSaveAction
              type="submit"
              isSaving={isSaving}
              label={t("sections.identity.saveButton")}
              savingLabel={t("sections.identity.saving")}
              successLabel={t("sections.identity.synchronized")}
              showSuccess={saveSuccess}
            />
	          </div>
            <AdminSaveError>{saveError}</AdminSaveError>

	          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col sm:flex-row gap-8 md:col-span-2 w-full">
              <div className="flex flex-col gap-2 shrink-0">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.identity.avatar.label")}</label>
                <div className="flex items-center gap-4 py-2 pr-6 border-r border-border-dim/30">
                  {formData.avatar ? (
                    <Image
                      src={formData.avatar}
                      alt="Agent Preview"
                      width={64}
                      height={64}
                      unoptimized
                      className="w-16 h-16 rounded-full object-cover border border-white/10 shrink-0 bg-card shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full border border-dashed border-white/20 flex items-center justify-center bg-white/5 shrink-0">
                      <Bot className="w-6 h-6 text-muted" />
                    </div>
                  )}
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={() => setIsAvatarModalOpen(true)}
                      className="px-4 py-2 rounded-[10px] bg-foreground/10 text-foreground text-[12px] font-medium hover:bg-foreground/20 transition-all border border-border-dim"
                    >
                      {t("sections.identity.avatar.updateButton")}
                    </button>
                    <p className="text-[10px] text-secondary">{t("sections.identity.avatar.hint")}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-1 justify-center">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.identity.name")}</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[14px] text-foreground outline-none transition-all placeholder:text-muted focus:border-[#10b981]/50"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.identity.description")}</label>
              <textarea
                rows={3}
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[13px] text-foreground outline-none transition-all placeholder:text-muted focus:border-[#10b981]/50 leading-relaxed min-h-[100px] resize-none"
              />
            </div>

          </div>
        </div>

        {/* Advanced Parameters */}
        <div className="flex flex-col gap-6">
          <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2 border-b border-border-dim/50 pb-4">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">2</span>
            {t("sections.engine.title")}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* One control, not two.
                Asking for a mode and then a model split one decision in half, and
                the model box sat greyed out with no way to tell what would run
                instead. The first option names it. */}
            <div className="flex flex-col gap-2 md:col-span-2 md:w-1/2">
              <label
                htmlFor="agent-model"
                className="text-[11px] font-mono tracking-widest text-muted uppercase"
              >
                {t("sections.engine.model.label")}
              </label>
              <select
                id="agent-model"
                value={formData.modelSelectionMode === "inherit" ? "" : formData.modelId || ""}
                onChange={e => {
                  const nextModelId = e.target.value;
                  setFormData({
                    ...formData,
                    modelSelectionMode: nextModelId ? "override" : "inherit",
                    ...(nextModelId ? { modelId: nextModelId } : {}),
                  });
                }}
                className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[14px] text-foreground outline-none transition-all focus:border-[#10b981]/50 appearance-none cursor-pointer"
              >
                <option value="">{inheritOptionLabel}</option>
                {activeModels.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {formatModelDisplayName(m)}{describeModelPrice(m)}
                  </option>
                ))}

                {isLegacyOverride && (
                  <option value={formData.modelId}>
                    {t("sections.engine.model.legacy", { id: formData.modelId })}
                  </option>
                )}
              </select>
              <p className="text-[12px] leading-relaxed text-secondary">
                {t("sections.engine.model.hint")}
              </p>
              {/* Readiness already knows when the chosen model cannot run. It was
                  computed and never shown next to the choice it is about. */}
              {isOverrideUnusable && (
                <p className="text-[12px] leading-relaxed text-[#f59e0b]">
                  {t("sections.engine.model.unusable")}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.reasoning.label")}</label>
              <div className="grid grid-cols-3 gap-2 h-[46px]">
                {reasoningLevels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFormData({ ...formData, reasoningEffort: level })}
                    className={`flex items-center justify-center gap-2 rounded-[12px] text-[12px] font-medium border transition-all h-full ${formData.reasoningEffort === level ? "bg-brand/20 border-brand/30 text-brand" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                  >
                    {t(`sections.engine.reasoning.levels.${level}`)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted">{t("sections.engine.reasoning.hint")}</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.internet.label")}</label>
              <div className="grid grid-cols-2 gap-3 h-[46px]">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, allowInternetAccess: false })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${!formData.allowInternetAccess ? "bg-foreground/10 border-foreground/20 text-foreground" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  {t("sections.engine.internet.offline")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, allowInternetAccess: true })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${formData.allowInternetAccess ? "bg-green-500/20 border-green-500/30 text-green-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  <Globe className="w-4 h-4" /> {t("sections.engine.internet.liveSearch")}
                </button>
              </div>
              <p className="text-[10px] text-muted">{t("sections.engine.internet.hint")}</p>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2 pt-4 border-t border-border-dim/50">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.approval.label")}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 h-[46px]">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, requireHumanApproval: true })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${formData.requireHumanApproval ? "bg-green-500/20 border-green-500/30 text-green-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  <ClipboardCheck className="w-4 h-4" /> {t("sections.engine.approval.required")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, requireHumanApproval: false })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${!formData.requireHumanApproval ? "bg-[#f59e0b]/20 border-[#f59e0b]/30 text-[#f59e0b]" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  <Rocket className="w-4 h-4" /> {t("sections.engine.approval.autonomous")}
                </button>
              </div>
              <p className="text-[10px] text-muted">
                {formData.requireHumanApproval
                  ? t("sections.engine.approval.hintRequired")
                  : t("sections.engine.approval.hintAutonomous")}
              </p>

              {/* Only meaningful while approval is on: an autonomous agent never
                  waits, so there is nothing for a window to bound. */}
              {formData.requireHumanApproval && (
                <div className="flex flex-col gap-1.5 pt-3 max-w-[260px]">
                  <label htmlFor="agent-approval-expiry" className="text-[11px] text-secondary">
                    {t("sections.engine.approval.expiryLabel")}
                  </label>
                  <input
                    id="agent-approval-expiry"
                    type="number"
                    min={0}
                    step="1"
                    max={approvalExpiry?.maxHours ?? 720}
                    value={formData.approvalExpiryHours}
                    onChange={(e) => setFormData({ ...formData, approvalExpiryHours: e.target.value })}
                    placeholder={String(approvalExpiry?.expiryHours ?? 24)}
                    className="w-full h-[42px] rounded-[12px] border border-border-dim bg-black/20 px-3 text-[13px] text-foreground placeholder:text-muted focus:border-brand/40 focus:outline-none"
                  />
                  <p className="text-[10px] text-muted">
                    {t("sections.engine.approval.expiryHint", {
                      hours: approvalExpiry?.expiryHours ?? 24,
                    })}
                  </p>
                </div>
              )}
            </div>

            {/* The budget is what remains when approval is off, so it sits directly
                below the switch that turns approval off. Blank inherits. */}
            <div className="flex flex-col gap-3 md:col-span-2 pt-4 border-t border-border-dim/50">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.budget.label")}</label>
                <p className="text-[10px] text-muted">{t("sections.engine.budget.hint")}</p>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {([
                  { key: "maxSteps", limit: "maxSteps" },
                  { key: "maxToolCalls", limit: "maxToolCalls" },
                  { key: "maxRuntimeMinutes", limit: "maxRuntimeMinutes" },
                  { key: "maxCostGBP", limit: "maxCostGBP" },
                ] as const).map(({ key, limit }) => (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label htmlFor={`agent-limit-${key}`} className="text-[11px] text-secondary">
                      {t(`sections.engine.budget.fields.${key}`)}
                    </label>
                    <input
                      id={`agent-limit-${key}`}
                      type="number"
                      min={0}
                      step={key === "maxCostGBP" ? "0.01" : "1"}
                      max={AGENT_LIMIT_CEILINGS[limit]}
                      value={formData[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      placeholder={String(AGENT_LIMIT_DEFAULTS[limit])}
                      className="w-full h-[42px] rounded-[12px] border border-border-dim bg-black/20 px-3 text-[13px] text-foreground placeholder:text-muted focus:border-brand/40 focus:outline-none"
                    />
                    <p className="text-[10px] text-muted">
                      {t("sections.engine.budget.inherits", {
                        value: AGENT_LIMIT_DEFAULTS[limit],
                        ceiling: AGENT_LIMIT_CEILINGS[limit],
                      })}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2 pt-4 border-t border-border-dim/50">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.status.label")}</label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 h-[46px]">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: false })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${!formData.isActive ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  {t("sections.engine.status.inactive")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: true })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${formData.isActive ? "bg-green-500/20 border-green-500/30 text-green-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  <CheckCircle2 className="w-4 h-4" /> {t("sections.engine.status.active")}
                </button>
              </div>
            </div>

            <div className="md:col-span-2 rounded-[12px] border border-border-dim bg-black/20 p-4 flex flex-col gap-4">
              <div className="rounded-[10px] border border-border-dim bg-white/[0.03] px-3 py-3 flex flex-col gap-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                      <Rocket className="w-4 h-4 text-brand" />
                      Release Status
                    </h3>
                    {latestRelease === undefined ? (
                      <p className="text-[12px] text-secondary">Checking release governance state.</p>
                    ) : latestRelease ? (
                      <>
                        <p className="text-[12px] text-foreground leading-relaxed">
                          {latestRelease.title}
                          {latestRelease.versionNumber ? ` · v${latestRelease.versionNumber}` : ""}
                        </p>
                        <p className="text-[11px] text-secondary leading-relaxed line-clamp-2">
                          {latestRelease.releaseNotes}
                        </p>
                        <div className="flex flex-wrap gap-2 text-[11px] text-muted">
                          <span>Owner: {latestRelease.ownerEmail || "Current reviewer"}</span>
                          {(latestRelease.activationWindowStart || latestRelease.activationWindowEnd) ? (
                            <span>
                              Window: {latestRelease.activationWindowStart ? formatDateTime(latestRelease.activationWindowStart) : "Any time"} - {latestRelease.activationWindowEnd ? formatDateTime(latestRelease.activationWindowEnd) : "No close"}
                            </span>
                          ) : null}
                          {latestRelease.approvalComment ? (
                            <span>Sign-off: {latestRelease.approvalComment}</span>
                          ) : null}
                        </div>
                        {latestRelease.evidenceSummary ? (
                          <div className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-2">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Release evidence</div>
                            <p className="mt-1 text-[11px] text-secondary leading-relaxed">{latestRelease.evidenceSummary.summary}</p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {latestRelease.evidenceSummary.items.map((item) => (
                                <span
                                  key={item.label}
                                  className={`rounded-[6px] border px-2 py-1 text-[10px] ${
                                    item.status === "PASS"
                                      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                                      : "border-amber-400/20 bg-amber-400/10 text-amber-300"
                                  }`}
                                >
                                  {item.label}: {item.value}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {latestRelease.nextAction ? (
                          <div className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-2">
                            <div className="text-[10px] font-mono uppercase tracking-widest text-muted">Recommended next action</div>
                            <p className="mt-1 text-[12px] font-semibold text-foreground">{latestRelease.nextAction.label}</p>
                            <p className="mt-1 text-[11px] text-secondary leading-relaxed">{latestRelease.nextAction.detail}</p>
                          </div>
                        ) : null}
                        {latestRelease.snapshotComparison ? (
                          <ReleaseSnapshotComparisonPanel
                            key={`${latestRelease._id}:${latestRelease.snapshotComparison.currentVersionNumber ?? "unknown"}`}
                            comparison={latestRelease.snapshotComparison}
                          />
                        ) : null}
                      </>
                    ) : (
                      <p className="text-[12px] text-secondary leading-relaxed">
                        No release candidate has been created for this agent yet. Once readiness is clear, create the candidate from Ship Checks or this page.
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {latestRelease ? (
                      <span className={cn("rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest", latestReleaseStatusClass)}>
                        {latestRelease.status.replaceAll("_", " ")}
                      </span>
                    ) : null}
                    <Link
                      href="/admin/releases"
                      className="rounded-[8px] border border-border-dim bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-foreground transition-all hover:bg-white/[0.08]"
                    >
                      Open Ship Checks
                    </Link>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canCreateReleaseCandidate ? (
                    <button
                      type="button"
                      disabled={releaseAction !== null}
                      onClick={() => runReleaseAction(
                        "create",
                        () => createReleaseCandidate({ agentId }),
                        "Release candidate created."
                      )}
                      className="rounded-[8px] bg-foreground px-3 py-1.5 text-[11px] font-medium text-background transition-all hover:opacity-90 disabled:opacity-50"
                    >
                      {releaseAction === "create" ? "Creating..." : "Create candidate"}
                    </button>
                  ) : null}
                  {latestRelease?.status === "PENDING_SIGNOFF" ? (
                    <button
                      type="button"
                      disabled={releaseAction !== null}
                      onClick={() => runReleaseAction(
                        "approve",
                        () => approveReleaseCandidate({ releaseId: latestRelease._id }),
                        "Release candidate approved."
                      )}
                      className="rounded-[8px] bg-foreground px-3 py-1.5 text-[11px] font-medium text-background transition-all hover:opacity-90 disabled:opacity-50"
                    >
                      {releaseAction === "approve" ? "Approving..." : "Approve candidate"}
                    </button>
                  ) : null}
                  {latestRelease?.status === "APPROVED" ? (
                    <button
                      type="button"
                      disabled={releaseAction !== null || activationWindowState?.canActivate === false}
                      onClick={() => runReleaseAction(
                        "activate",
                        () => activateReleaseCandidate({ releaseId: latestRelease._id }),
                        "Release activated."
                      )}
                      className="rounded-[8px] bg-foreground px-3 py-1.5 text-[11px] font-medium text-background transition-all hover:opacity-90 disabled:opacity-50"
                    >
                      {releaseAction === "activate" ? "Activating..." : activationWindowState?.label ?? "Activate release"}
                    </button>
                  ) : null}
                  {(latestRelease?.status === "PENDING_SIGNOFF" || latestRelease?.status === "APPROVED") ? (
                    <button
                      type="button"
                      disabled={releaseAction !== null}
                      onClick={() => runReleaseAction(
                        "cancel",
                        () => cancelReleaseCandidate({
                          releaseId: latestRelease._id,
                          cancellationReason: "Cancelled from Agent Studio before activation. Review readiness and create a replacement candidate when the release scope is clear.",
                        }),
                        "Release candidate cancelled."
                      )}
                      className="rounded-[8px] border border-border-dim bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-secondary transition-all hover:bg-white/[0.08] hover:text-foreground disabled:opacity-50"
                    >
                      {releaseAction === "cancel" ? "Cancelling..." : "Cancel candidate"}
                    </button>
                  ) : null}
                  {latestRelease?.status === "ACTIVATED" ? (
                    <button
                      type="button"
                      disabled={releaseAction !== null}
                      onClick={() => runReleaseAction(
                        "rollback",
                        () => rollbackRelease({
                          releaseId: latestRelease._id,
                          rollbackReason: "Rolled back from Agent Studio. Review recent runs and snapshot comparison before creating a replacement candidate.",
                        }),
                        "Release rolled back."
                      )}
                      className="rounded-[8px] border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 text-[11px] font-medium text-rose-300 transition-all hover:bg-rose-400/15 disabled:opacity-50"
                    >
                      {releaseAction === "rollback" ? "Rolling back..." : "Rollback release"}
                    </button>
                  ) : null}
                </div>
                {latestRelease?.status === "APPROVED" && activationWindowState ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-2 text-[12px] text-secondary">
                    {activationWindowState.detail}
                  </div>
                ) : null}
                {releaseFeedback ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-2 text-[12px] text-secondary">
                    {releaseFeedback}
                  </div>
                ) : null}
                {latestRelease?.status === "ROLLED_BACK" ? (
                  <div className="rounded-[8px] border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-[12px] text-amber-300">
                    <p>
                      This agent was rolled back. Review recent runs and release notes before creating a new candidate.
                    </p>
                    {latestRelease.rollbackReason ? (
                      <p className="mt-2 text-[11px] leading-relaxed">
                        Reason: {latestRelease.rollbackReason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {latestRelease?.status === "CANCELLED" ? (
                  <div className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-2 text-[12px] text-secondary">
                    <p>This release candidate was cancelled before activation.</p>
                    {latestRelease.cancellationReason ? (
                      <p className="mt-2 text-[11px] leading-relaxed">
                        Reason: {latestRelease.cancellationReason}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex flex-col gap-1">
                  <h3 className="text-[13px] font-semibold text-foreground flex items-center gap-2">
                    {hasActivationRisk ? (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    )}
                    {t("sections.engine.readiness.title")}
                  </h3>
                  <p className="text-[11px] text-secondary leading-relaxed">
                    {readiness === undefined
                      ? t("sections.engine.readiness.loading")
                      : hasActivationRisk
                        ? t("sections.engine.readiness.activationWarning", { count: readinessWarningCount })
                        : t("sections.engine.readiness.ready")}
                  </p>
                </div>
                {readiness && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleRunSmokeEval("CONTRACT_ONLY")}
                      disabled={smokeEvalMode !== null || readiness.activeEvalFixtureCount === 0}
                      className="shrink-0 rounded-[8px] border border-border-dim bg-white/[0.04] px-3 py-1.5 text-[11px] font-medium text-foreground transition-all hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
                    >
                      {smokeEvalMode === "CONTRACT_ONLY" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ClipboardCheck className="w-3.5 h-3.5" />}
                      {smokeEvalMode === "CONTRACT_ONLY"
                        ? t("sections.engine.readiness.runningSmokeEval")
                        : t("sections.engine.readiness.runSmokeEval")}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRunSmokeEval("MODEL_GRADED")}
                      disabled={smokeEvalMode !== null || readiness.activeEvalFixtureCount === 0}
                      className="shrink-0 rounded-[8px] border border-brand/30 bg-brand/10 px-3 py-1.5 text-[11px] font-medium text-brand transition-all hover:bg-brand/15 disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
                    >
                      {smokeEvalMode === "MODEL_GRADED" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                      {smokeEvalMode === "MODEL_GRADED"
                        ? t("sections.engine.readiness.runningModelSmokeEval")
                        : t("sections.engine.readiness.runModelSmokeEval")}
                    </button>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest",
                        hasActivationRisk
                          ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                          : "border-green-400/30 bg-green-400/10 text-green-300",
                      )}
                    >
                      {hasActivationRisk
                        ? t("sections.engine.readiness.badge.review")
                        : t("sections.engine.readiness.badge.clear")}
                    </span>
                  </div>
                )}
              </div>
              {activationSmokeBlocked && (
                <div className="rounded-[10px] border border-red-400/20 bg-red-400/10 px-3 py-2 text-[12px] leading-relaxed text-red-300">
                  {t("sections.engine.readiness.activationBlocked")}
                </div>
              )}
              {activationReleaseBlocked && (
                <div className="rounded-[10px] border border-red-400/20 bg-red-400/10 px-3 py-2 text-[12px] leading-relaxed text-red-300">
                  {t("sections.engine.readiness.releaseGateBlocked")}
                </div>
              )}
              {readinessFeedback && (
                <div className="rounded-[10px] border border-border-dim bg-white/[0.03] px-3 py-2 text-[12px] leading-relaxed text-secondary">
                  {readinessFeedback}
                </div>
              )}
              {readiness && (
                <div className="rounded-[10px] border border-border-dim bg-white/[0.03] px-3 py-3 flex flex-col gap-1">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                    <span className="text-[11px] font-mono uppercase tracking-widest text-muted">
                      {t("sections.engine.readiness.latestSmokeEval.title")}
                    </span>
                    {readiness.latestSmokeEvalRun ? (
                      <span
                        className={cn(
                          "text-[11px] font-mono",
                          latestSmokePassed ? "text-green-300" : "text-red-300",
                        )}
                      >
                        {t(`sections.engine.readiness.latestSmokeEval.status.${readiness.latestSmokeEvalRun.status}`)} · {formatDateTime(readiness.latestSmokeEvalRun.completedAt)}
                      </span>
                    ) : (
                      <span className="text-[11px] font-mono text-amber-300">
                        {t("sections.engine.readiness.latestSmokeEval.empty")}
                      </span>
                    )}
                  </div>
                  {readiness.latestSmokeEvalRun ? (
                    <>
                      <p className="text-[12px] text-foreground leading-relaxed">
                        {readiness.latestSmokeEvalRun.objective}
                      </p>
                      {readiness.latestSmokeEvalRun.finalOutput && (
                        <p
                          className={cn(
                            "text-[11px] leading-relaxed line-clamp-2",
                            latestSmokePassed ? "text-secondary" : "text-red-300",
                          )}
                        >
                          {readiness.latestSmokeEvalRun.finalOutput}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="text-[12px] text-secondary leading-relaxed">
                      {t("sections.engine.readiness.latestSmokeEval.hint")}
                    </p>
                  )}
                </div>
              )}

              {readiness && (
                <div className="rounded-[10px] border border-border-dim bg-white/[0.03] px-3 py-3 flex flex-col gap-3">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                    <div>
                      <span className="text-[11px] font-mono uppercase tracking-widest text-muted">
                        {t("sections.engine.readiness.coverage.title")}
                      </span>
                      <p className="text-[12px] text-secondary leading-relaxed mt-1">
                        {t("sections.engine.readiness.coverage.summary", {
                          covered: fixtureCoverageCoveredCount,
                          total: readiness.fixtureCoverage.length,
                        })}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-muted">
                      {t("sections.engine.readiness.coverage.smokeCovered", {
                        count: readiness.fixtureCoverage.filter((coverage) => coverage.smokePassed).length,
                      })}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
                    {readiness.fixtureCoverage.map((coverage) => {
                      const hasFixture = coverage.activeCount > 0;
                      const isSmokeCovered = coverage.smokePassed;
                      return (
                        <div
                          key={coverage.type}
                          className={cn(
                            "min-h-[78px] rounded-[8px] border px-3 py-2 flex flex-col justify-between gap-2",
                            isSmokeCovered
                              ? "border-green-400/20 bg-green-400/5"
                              : hasFixture
                                ? "border-sky-400/20 bg-sky-400/5"
                                : "border-border-dim bg-black/20",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-semibold text-foreground truncate">
                              {t(`sections.engine.readiness.coverage.types.${coverage.type}`)}
                            </div>
                            <div className="text-[10px] text-muted font-mono mt-1">
                              {t("sections.engine.readiness.coverage.fixtureCount", { count: coverage.activeCount })}
                            </div>
                          </div>
                          <span
                            className={cn(
                              "w-fit rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest",
                              isSmokeCovered
                                ? "border-green-400/20 bg-green-400/10 text-green-300"
                                : hasFixture
                                  ? "border-sky-400/20 bg-sky-400/10 text-sky-300"
                                  : "border-border-dim bg-white/[0.03] text-muted",
                            )}
                          >
                            {isSmokeCovered
                              ? t("sections.engine.readiness.coverage.status.smokePassed")
                              : hasFixture
                                ? t("sections.engine.readiness.coverage.status.fixtureReady")
                                : t("sections.engine.readiness.coverage.status.missing")}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(readiness?.checks ?? []).map((check) => {
                  const isPassing = check.status === "PASS";
                  return (
                    <div
                      key={check.key}
                      className={cn(
                        "min-h-[92px] rounded-[10px] border p-3 flex gap-3",
                        isPassing
                          ? "border-green-400/20 bg-green-400/5"
                          : "border-amber-400/20 bg-amber-400/5",
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                          isPassing ? "bg-green-400/10 text-green-300" : "bg-amber-400/10 text-amber-300",
                        )}
                      >
                        {isPassing ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      </div>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="text-[12px] font-semibold text-foreground">
                          {t(`sections.engine.readiness.checks.${check.key}.title`)}
                        </span>
                        <span className="text-[11px] leading-relaxed text-secondary">
                          {t(`sections.engine.readiness.checks.${check.key}.${isPassing ? "pass" : "warn"}`, {
                            count: check.count ?? 0,
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Upload Drag & Drop Modal */}
      <SonaeModal
        isOpen={isAvatarModalOpen}
        onClose={() => !isUploading && setIsAvatarModalOpen(false)}
        title={t("uploadModal.title")}
      >
	        <div className="flex flex-col gap-6 mt-2 relative">
	          <p className="text-[13px] text-secondary">
	            {t("uploadModal.subtitle")}
	          </p>
            <AdminSaveError>{uploadError}</AdminSaveError>

	          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "w-full h-[200px] border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center gap-4 transition-all relative overflow-hidden",
              dragActive ? "border-brand bg-brand/5" : "border-border-dim bg-background/50",
              isUploading ? "opacity-50 pointer-events-none" : ""
            )}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
                <span className="text-[13px] font-medium text-foreground">{t("uploadModal.processing")}</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center pointer-events-none">
                  <ImagePlus className="w-5 h-5 text-secondary" />
                </div>
                <div className="flex flex-col items-center gap-1 pointer-events-none text-center px-4">
                  <span className="text-[14px] font-medium text-foreground">{t("uploadModal.dropText")}</span>
                  <span className="text-[11px] text-muted font-mono uppercase tracking-widest mt-1">{t("uploadModal.dropHint")}</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processUpload(e.target.files[0]);
                    }
                  }}
                />
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-border-dim/50">
            <button
              type="button"
              onClick={() => !isUploading && setIsAvatarModalOpen(false)}
              disabled={isUploading}
              className="px-5 py-2.5 rounded-[10px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            >
              {t("uploadModal.cancel")}
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
