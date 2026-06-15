"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
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
  Loader2
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

type ReasoningEffort = "LOW" | "MEDIUM" | "HIGH";
type ModelSelectionMode = "inherit" | "override";
type SmokeEvalMode = "CONTRACT_ONLY" | "MODEL_GRADED";

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
};

const reasoningLevels: ReasoningEffort[] = ["LOW", "MEDIUM", "HIGH"];


export default function AgentOverviewPage() {
  const t = useTranslations("admin.agents.details.settings");
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const agent = useQuery(api.agents.get, { id: agentId });
  const readiness = useQuery(api.agents.getAgentReadiness, { id: agentId });
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "agent" });
  const activeModels = useMemo(
    () => (activeModelsData ?? []) as Doc<"aiModels">[],
    [activeModelsData],
  );
  const defaultModelId = useMemo(
    () => activeModels.find((model) => model.isDefault)?.modelId ?? "",
    [activeModels],
  );

  const updateAgent = useMutation(api.agents.updateAgent);
  const runSmokeEval = useMutation(api.agentEvalFixtures.runSmokeEval);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);

  const [formData, setFormData] = useState<AgentSettingsFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [readinessFeedback, setReadinessFeedback] = useState("");
  const [smokeEvalMode, setSmokeEvalMode] = useState<SmokeEvalMode | null>(null);

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
      modelSelectionMode: agent.modelSelectionMode || "override",
      thinkingMode: agent.thinkingMode || false,
      reasoningEffort: agent.reasoningEffort || "MEDIUM",
      allowInternetAccess: agent.allowInternetAccess || false,
      isActive: agent.isActive ?? true,
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
            <div className="flex flex-col gap-2 md:col-span-2 md:w-1/2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.model.modeLabel")}</label>
              <select
                value={formData.modelSelectionMode}
                onChange={e => setFormData({ ...formData, modelSelectionMode: e.target.value as ModelSelectionMode })}
                className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[14px] text-foreground outline-none transition-all focus:border-[#10b981]/50 appearance-none cursor-pointer"
              >
                <option value="inherit">{t("sections.engine.model.modes.inherit")}</option>
                <option value="override">{t("sections.engine.model.modes.override")}</option>
              </select>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2 md:w-1/2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.model.label")}</label>
              <select
                value={formData.modelId || ''}
                onChange={e => setFormData({ ...formData, modelId: e.target.value })}
                disabled={formData.modelSelectionMode === "inherit"}
                className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[14px] text-foreground outline-none transition-all focus:border-[#10b981]/50 appearance-none cursor-pointer"
              >
                <option value="" disabled>{t("sections.engine.model.placeholder")}</option>
                {activeModels.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.friendlyName || m.displayName || m.modelId} {m.isDefault && t("sections.engine.model.systemDefault")}
                  </option>
                ))}

                {formData.modelId && activeModels.length > 0 && !activeModels.find(m => m.modelId === formData.modelId) && (
                  <option value={formData.modelId}>
                    {formData.modelId} {t("sections.engine.model.legacy")}
                  </option>
                )}
              </select>
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
