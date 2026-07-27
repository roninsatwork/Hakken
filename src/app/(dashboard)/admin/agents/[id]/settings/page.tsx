"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import type { DragEvent, FormEvent, ReactNode } from "react";
import { useParams } from "next/navigation";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ArrowRight,
  Bot,
  ImagePlus,
  Loader2,
} from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useTranslations } from "next-intl";
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

/**
 * A group of settings, with room around it.
 *
 * The page had no grouping at all: one column of controls under two numbered
 * headings, each control a full-width band with its own help line. Cards give
 * the reader somewhere to stop, and give the layout something to place in two
 * columns.
 */
function SettingsCard({ title, className, children }: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-6", className)}>
      <h2 className="mb-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mt-1 text-[12px] font-medium text-secondary">
      {children}
    </label>
  );
}

/**
 * A yes/no setting, said once.
 *
 * Each of these was two side-by-side buttons filling the width, so the reader
 * had to read both labels to work out which state they were in. A switch states
 * the setting once and shows its state, and the sentence underneath is free to
 * describe what that state actually does.
 */
function SettingSwitch({ label, description, checked, onChange, children }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  children?: ReactNode;
}) {
  return (
    <div className="py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          <p className="text-[12px] leading-relaxed text-muted">{description}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          className="mt-0.5 shrink-0"
        >
          <span
            className={cn(
              "relative block h-5 w-9 rounded-full transition-colors",
              checked ? "bg-brand" : "bg-foreground/15",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                checked ? "left-[18px]" : "left-0.5",
              )}
            />
          </span>
        </button>
      </div>
      {children}
    </div>
  );
}

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

  // So a blank box can name the window it will actually follow, rather than
  // leaving the reader to guess.
  const approvalExpiry = useQuery(api.agentRuns.getApprovalExpiryConfig, {});
  const updateAgent = useMutation(api.agents.updateAgent);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);

  const [formData, setFormData] = useState<AgentSettingsFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadError, setUploadError] = useState("");

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
    if (activationBlocker) {
      setSaveError(t(`sections.engine.status.blockedReason.${activationBlocker}`));
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

  /**
   * Why the server would refuse to switch this agent on, said once.
   *
   * This replaces a checklist of eight boxes that sat at the foot of the page
   * whether or not anything was wrong. Six of the eight could never stop
   * anything, so the panel spent most of its life reporting problems that did
   * not exist. The server decides; the screen says which reason it gave and
   * where to go about it, and only at the moment the switch is flipped.
   */
  const isActivatingDraft = agent?.isActive === false && formData.isActive;
  const activationBlocker = isActivatingDraft
    ? readiness?.activationWarnings?.[0]
    : undefined;
  if (agent === undefined) return <div className="p-8 text-secondary">{t("loading")}</div>;
  if (agent === null) return <div className="p-8 text-red-500">{t("notFound")}</div>;

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 antialiased">
      <form onSubmit={handleSave} className="flex w-full flex-col gap-6">
        <div className="flex justify-end">
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

        {/* Two columns rather than one.
            Every control on this page used to be full width, so seven settings
            needed three screens of scrolling and the right-hand half of the
            page was empty throughout. Nothing here is narrower than it was
            legible at; the height comes back from the width that was going
            unused. */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SettingsCard title={t("sections.identity.title")}>
            <div className="flex items-center gap-5">
              {formData.avatar ? (
                <Image
                  src={formData.avatar}
                  alt=""
                  width={64}
                  height={64}
                  unoptimized
                  className="h-16 w-16 shrink-0 rounded-full border border-white/10 bg-card object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-dashed border-white/20 bg-white/5">
                  <Bot className="h-6 w-6 text-muted" />
                </div>
              )}
              <div className="flex flex-col items-start gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsAvatarModalOpen(true)}
                  className="rounded-[10px] border border-border-dim bg-foreground/10 px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-foreground/20"
                >
                  {t("sections.identity.avatar.updateButton")}
                </button>
                <p className="text-[11px] text-muted">{t("sections.identity.avatar.hint")}</p>
              </div>
            </div>

            <FieldLabel htmlFor="agent-name">{t("sections.identity.name")}</FieldLabel>
            <input
              id="agent-name"
              type="text"
              value={formData.name || ""}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground outline-none transition-colors placeholder:text-muted focus:border-brand/50"
            />

            <FieldLabel htmlFor="agent-description">{t("sections.identity.description")}</FieldLabel>
            {/* Grows into whatever height the column ends up at, rather than
                leaving the card half empty beside a taller neighbour. */}
            <textarea
              id="agent-description"
              rows={3}
              value={formData.description || ""}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="min-h-[96px] w-full flex-1 resize-none rounded-[12px] border border-border-dim bg-black/20 px-4 py-3 text-[13px] leading-relaxed text-foreground outline-none transition-colors placeholder:text-muted focus:border-brand/50"
            />
          </SettingsCard>

          <SettingsCard title={t("sections.engine.groups.behaviour")}>
            {/* One control, not two.
                Asking for a mode and then a model split one decision in half, and
                the model box sat greyed out with no way to tell what would run
                instead. The first option names it. */}
            <FieldLabel htmlFor="agent-model">{t("sections.engine.model.label")}</FieldLabel>
            <select
              id="agent-model"
              value={formData.modelSelectionMode === "inherit" ? "" : formData.modelId || ""}
              onChange={(e) => {
                const nextModelId = e.target.value;
                setFormData({
                  ...formData,
                  modelSelectionMode: nextModelId ? "override" : "inherit",
                  ...(nextModelId ? { modelId: nextModelId } : {}),
                });
              }}
              className="h-[46px] w-full cursor-pointer appearance-none rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground outline-none transition-colors focus:border-brand/50"
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
            <p className="text-[11px] leading-relaxed text-muted">
              {t("sections.engine.model.hint")}
            </p>
            {/* Readiness already knows when the chosen model cannot run. It was
                computed and never shown next to the choice it is about. */}
            {isOverrideUnusable && (
              <p className="text-[12px] leading-relaxed text-[#f59e0b]">
                {t("sections.engine.model.unusable")}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <FieldLabel>{t("sections.engine.reasoning.label")}</FieldLabel>
              <div
                role="radiogroup"
                aria-label={t("sections.engine.reasoning.label")}
                className="grid h-[46px] grid-cols-3 gap-1 rounded-[12px] border border-border-dim bg-black/20 p-1"
              >
                {reasoningLevels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    role="radio"
                    aria-checked={formData.reasoningEffort === level}
                    onClick={() => setFormData({ ...formData, reasoningEffort: level })}
                    className={cn(
                      "rounded-[9px] text-[12px] font-medium transition-colors",
                      formData.reasoningEffort === level
                        ? "bg-brand/20 text-brand"
                        : "text-secondary hover:text-foreground",
                    )}
                  >
                    {t(`sections.engine.reasoning.levels.${level}`)}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                {t("sections.engine.reasoning.hint")}
              </p>
            </div>

            {/* Four paired buttons, each a full-width band, held what amounts to
                four switches. As switches they read the same and cost a third of
                the height. */}
            <div className="mt-1 divide-y divide-border-dim/40 border-t border-border-dim/40">
              <SettingSwitch
                label={t("sections.engine.internet.label")}
                description={formData.allowInternetAccess
                  ? t("sections.engine.internet.hintOn")
                  : t("sections.engine.internet.hintOff")}
                checked={formData.allowInternetAccess}
                onChange={(next) => setFormData({ ...formData, allowInternetAccess: next })}
              />
              <SettingSwitch
                label={t("sections.engine.approval.label")}
                description={formData.requireHumanApproval
                  ? t("sections.engine.approval.hintRequired")
                  : t("sections.engine.approval.hintAutonomous")}
                checked={formData.requireHumanApproval}
                onChange={(next) => setFormData({ ...formData, requireHumanApproval: next })}
              >
                {/* Only meaningful while approval is on: an autonomous agent never
                    waits, so there is nothing for a window to bound. */}
                {formData.requireHumanApproval && (
                  <div className="flex flex-col gap-1.5 pt-3">
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
                      className="h-[42px] w-full max-w-[220px] rounded-[12px] border border-border-dim bg-black/20 px-3 text-[13px] text-foreground outline-none placeholder:text-muted focus:border-brand/40"
                    />
                    <p className="text-[11px] leading-relaxed text-muted">
                      {t("sections.engine.approval.expiryHint", {
                        hours: approvalExpiry?.expiryHours ?? 24,
                      })}
                    </p>
                  </div>
                )}
              </SettingSwitch>
            </div>
          </SettingsCard>

          {/* The budget is what remains when approval is off, and the switch that
              turns the agent on sits with it — the two things that decide what
              this agent can do unattended. */}
          <SettingsCard title={t("sections.engine.groups.limits")} className="xl:col-span-2">
            <p className="-mt-1 text-[12px] leading-relaxed text-secondary">
              {t("sections.engine.budget.hint")}
            </p>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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
                    className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-3 text-[13px] text-foreground outline-none placeholder:text-muted focus:border-brand/40"
                  />
                  <p className="text-[11px] text-muted">
                    {t("sections.engine.budget.inherits", {
                      value: AGENT_LIMIT_DEFAULTS[limit],
                      ceiling: AGENT_LIMIT_CEILINGS[limit],
                    })}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-2 border-t border-border-dim/40">
              <SettingSwitch
                label={formData.isActive
                  ? t("sections.engine.status.active")
                  : t("sections.engine.status.inactive")}
                description={formData.isActive
                  ? t("sections.engine.status.hintActive")
                  : t("sections.engine.status.hintInactive")}
                checked={formData.isActive}
                onChange={(next) => setFormData({ ...formData, isActive: next })}
              >
                {activationBlocker ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-[10px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                    <span>{t(`sections.engine.status.blockedReason.${activationBlocker}`)}</span>
                    <Link
                      href={`/admin/agents/${agentId}/evals`}
                      className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-amber-100 underline-offset-4 hover:underline"
                    >
                      {t("sections.engine.status.blockedLink")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </SettingSwitch>
            </div>
          </SettingsCard>
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
