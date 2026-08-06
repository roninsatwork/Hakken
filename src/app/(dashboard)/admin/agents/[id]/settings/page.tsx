"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState, useEffect, useMemo, useRef } from "react";
import type { FormEvent } from "react";
import { useParams } from "next/navigation";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  AdminSaveAction,
  AdminSaveError,
} from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
// Shared with the create screen, which used to be built from a different set of
// cards, labels and buttons entirely.
import {
  FieldLabel,
  SegmentedChoice,
  SettingSwitch,
  SettingsCard,
} from "@/src/app/(dashboard)/admin/_components/AdminSettingsCard";
import { AdminAvatarPicker } from "@/src/app/(dashboard)/admin/_components/AdminAvatarPicker";
import {
  formatModelDisplayName,
  formatTokenCost,
} from "@/src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils";

type ReasoningEffort = "LOW" | "MEDIUM" | "HIGH";
type ModelSelectionMode = "inherit" | "override";
type AgentSettingsFormData = {
  name: string;
  description: string;
  ownerId: string;
  riskLevel: string;
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
  maxInputTokens: string;
  maxRuntimeMinutes: string;
  maxCostGBP: string;
  storageId?: Id<"_storage">;
};

const emptyFormData: AgentSettingsFormData = {
  name: "",
  description: "",
  ownerId: "",
  riskLevel: "",
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
  maxInputTokens: "",
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
/**
 * The token budget is shown as the number the runtime actually uses.
 *
 * Named for what a stopped run reports — "reached the configured token budget"
 * — so the message and the setting can be joined up by whoever reads them, and
 * shown in whole tokens rather than thousands so the number on screen is the
 * number that applies.
 */
/** A limit as it should read on screen: grouped, and empty while it is empty. */
function formatLimitNumber(raw: string) {
  if (!raw) return "";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed.toLocaleString("en-GB") : raw;
}

const AGENT_LIMIT_DEFAULTS = { maxSteps: 25, maxToolCalls: 25, maxRuntimeMinutes: 30, maxInputTokens: 1000000, maxCostGBP: 10 } as const;
const AGENT_LIMIT_CEILINGS = { maxSteps: 500, maxToolCalls: 500, maxRuntimeMinutes: 60, maxInputTokens: 10000000, maxCostGBP: 50 } as const;

/** Empty, zero and nonsense all mean "inherit the default", matching the server. */
function parseLimitInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export default function AgentOverviewPage() {
  const t = useTranslations("admin.agents.details.settings");
  const tAgents = useTranslations("admin.agents");
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
  const accountablePeople = useQuery(api.users.getAccountablePeople) ?? [];
  const updateAgent = useMutation(api.agents.updateAgent);

  const [formData, setFormData] = useState<AgentSettingsFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");

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

  const initializedAgentIdRef = useRef<Id<"agents"> | null>(null);

  useEffect(() => {
    if (!agent || initializedAgentIdRef.current === agent._id) return;
    if (!agent.modelId && activeModelsData === undefined) return;

    initializedAgentIdRef.current = agent._id;
    setFormData({
      name: agent.name || "",
      description: agent.description || "",
      ownerId: agent.ownerId || "",
      riskLevel: agent.riskLevel || "",
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
      maxInputTokens: agent.maxInputTokens ? String(agent.maxInputTokens) : "",
      maxRuntimeMinutes: agent.maxRuntimeMs ? String(Math.round(agent.maxRuntimeMs / 60000)) : "",
      maxCostGBP: agent.maxCostGBP ? String(agent.maxCostGBP) : "",
      storageId: undefined,
    });
  }, [agent, activeModelsData, defaultModelId]);

  const handleSave = async (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    setIsSaving(true);
    setSaveError("");
    try {
      await updateAgent({
        id: agentId,
        name: formData.name,
        description: formData.description,
        ...(formData.ownerId ? { ownerId: formData.ownerId as Id<"users"> } : {}),
        ...(formData.riskLevel ? { riskLevel: formData.riskLevel as "LOW" | "MEDIUM" | "HIGH" } : {}),
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
        maxInputTokens: parseLimitInput(formData.maxInputTokens) ?? 0,
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

  /**
   * What has not been proven about this agent, said once.
   *
   * This replaces a checklist of eight boxes that sat at the foot of the page
   * whether or not anything was wrong. Six of the eight could never stop
   * anything, so the panel spent most of its life reporting problems that did
   * not exist.
   *
   * It no longer stops anything either. Anthony, 2026-08-01: *"i dotn want eval
   * checks on agent to be blocker before goign live."* So this is shown at the
   * moment the switch is flipped, with the link to go and settle it, and then
   * the agent goes live anyway if that is what was asked for.
   */
  const isActivatingDraft = agent?.isActive === false && formData.isActive;
  const activationWarning = isActivatingDraft
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
            <AdminAvatarPicker
              avatar={formData.avatar}
              labels={{
                updateButton: t("sections.identity.avatar.updateButton"),
                hint: t("sections.identity.avatar.hint"),
                modalTitle: t("uploadModal.title"),
                modalSubtitle: t("uploadModal.subtitle"),
                processing: t("uploadModal.processing"),
                dropText: t("uploadModal.dropText"),
                dropHint: t("uploadModal.dropHint"),
                cancel: t("uploadModal.cancel"),
                uploadFailed: t("errors.uploadFailed"),
              }}
              onUploaded={({ storageId, previewUrl }) =>
                setFormData((prev) => ({ ...prev, storageId, avatar: previewUrl }))
              }
            />

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

            {/*
              How the assistants that predate the register get an accountable
              person. Without this the register could report that nobody owns
              them and offer no way to fix it.
            */}
            <FieldLabel htmlFor="agent-owner">{tAgents("owner.label")}</FieldLabel>
            <select
              id="agent-owner"
              value={formData.ownerId}
              onChange={(e) => setFormData({ ...formData, ownerId: e.target.value })}
              className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground outline-none transition-colors focus:border-brand/50"
            >
              <option value="">{tAgents("owner.choose")}</option>
              {accountablePeople.map((person) => (
                <option key={person._id} value={person._id}>{person.name}</option>
              ))}
            </select>
            <p className="text-[12px] text-secondary">{tAgents("owner.hint")}</p>
            {/*
              The rating is not a label. Choosing High makes human approval a
              consequence rather than a preference, and the platform refuses to
              switch it off afterwards.
            */}
            <FieldLabel htmlFor="agent-risk">{tAgents("risk.label")}</FieldLabel>
            <select
              id="agent-risk"
              value={formData.riskLevel}
              onChange={(e) => setFormData({ ...formData, riskLevel: e.target.value })}
              className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground outline-none transition-colors focus:border-brand/50"
            >
              <option value="">{tAgents("risk.unrated")}</option>
              <option value="LOW">{tAgents("risk.low")}</option>
              <option value="MEDIUM">{tAgents("risk.medium")}</option>
              <option value="HIGH">{tAgents("risk.high")}</option>
            </select>
            <p className="text-[12px] text-secondary">
              {formData.riskLevel === "HIGH" ? tAgents("risk.highHint") : tAgents("risk.hint")}
            </p>
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
              <SegmentedChoice
                label={t("sections.engine.reasoning.label")}
                value={formData.reasoningEffort}
                options={reasoningLevels.map((level) => ({
                  value: level,
                  label: t(`sections.engine.reasoning.levels.${level}`),
                }))}
                onChange={(level) => setFormData({ ...formData, reasoningEffort: level })}
              />
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
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {([
                { key: "maxSteps", limit: "maxSteps" },
                { key: "maxToolCalls", limit: "maxToolCalls" },
                { key: "maxInputTokens", limit: "maxInputTokens" },
                { key: "maxRuntimeMinutes", limit: "maxRuntimeMinutes" },
                { key: "maxCostGBP", limit: "maxCostGBP" },
              ] as const).map(({ key, limit }) => {
                // A number input cannot carry separators, so the token budget —
                // the only limit here in the millions — is a text box that
                // formats what is typed and strips the commas on the way out.
                const grouped = key === "maxInputTokens";
                return (
                  <div key={key} className="flex flex-col gap-1.5">
                    <label htmlFor={`agent-limit-${key}`} className="text-[11px] text-secondary">
                      {t(`sections.engine.budget.fields.${key}`)}
                    </label>
                    <input
                      id={`agent-limit-${key}`}
                      type={grouped ? "text" : "number"}
                      inputMode={grouped ? "numeric" : undefined}
                      {...(grouped ? {} : { min: 0, max: AGENT_LIMIT_CEILINGS[limit] })}
                      step={key === "maxCostGBP" ? "0.01" : "1"}
                      value={grouped ? formatLimitNumber(formData[key]) : formData[key]}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          [key]: grouped ? e.target.value.replace(/[^0-9]/g, "") : e.target.value,
                        })
                      }
                      placeholder={AGENT_LIMIT_DEFAULTS[limit].toLocaleString("en-GB")}
                      className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-3 text-[13px] text-foreground outline-none placeholder:text-muted focus:border-brand/40"
                    />
                    <p className="text-[11px] text-muted">
                      {t("sections.engine.budget.inherits", {
                        value: AGENT_LIMIT_DEFAULTS[limit].toLocaleString("en-GB"),
                        ceiling: AGENT_LIMIT_CEILINGS[limit].toLocaleString("en-GB"),
                      })}
                    </p>
                  </div>
                );
              })}
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
                {activationWarning ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-[10px] border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200 sm:flex-row sm:items-center sm:justify-between">
                    <span>{t(`sections.engine.status.unprovenReason.${activationWarning}`)}</span>
                    <Link
                      href={`/admin/agents/${agentId}/evals`}
                      className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-amber-100 underline-offset-4 hover:underline"
                    >
                      {t("sections.engine.status.unprovenLink")}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                ) : null}
              </SettingSwitch>
            </div>
          </SettingsCard>
        </div>
      </form>

    </div>
  );
}
