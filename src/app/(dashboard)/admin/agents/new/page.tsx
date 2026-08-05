"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Bot } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/src/lib/errors";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { AdminAvatarPicker } from "@/src/app/(dashboard)/admin/_components/AdminAvatarPicker";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import {
  FieldLabel,
  SegmentedChoice,
  SettingSwitch,
  SettingsCard,
  adminFieldClassName,
  adminTextAreaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminSettingsCard";
import {
  formatModelDisplayName,
  formatTokenCost,
} from "@/src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils";

/**
 * Creating an agent, on its own screen.
 *
 * This was a four-step wizard inside a modal. Anthony, 2026-08-01: *"we should
 * never use modals for large data collection inputs these shoud be new
 * screens."* A modal has no address, so there was no way to link to it, no back
 * button, no returning to a half-filled form, and a stray click on the backdrop
 * threw away everything typed.
 *
 * ## Why it is the settings screen, minus the agent
 *
 * Having moved, it still asked its own questions in its own shapes — starting
 * points, an objective, an audience, a readiness checklist — and then dropped
 * you on a settings screen that shared none of them. Anthony, 2026-08-01:
 * *"there is massive inconsistencies between the edit and the add"*, then
 * *"these are missing and the add has more fields that we need make it like teh
 * edit"*.
 *
 * So this screen is now the settings screen's three cards, in the same order,
 * with the same labels and the same help text — read from the settings screen's
 * own translation keys, so the wording cannot drift between them. What you set
 * here is what you will see when it opens.
 *
 * ## What went, and why
 *
 * - **Starting points.** Five templates across the top. Anthony, 2026-08-01:
 *   *"we dotn want there it shoudl onyl createa a start from scractch agent."*
 * - **Objective and audience.** Recorded into the audit trail and read by
 *   nothing. The description carries what they were reaching for.
 * - **The readiness checklist.** Four reassurances, one of which — that test
 *   questions had been set up — was only ever true for a template. The Active
 *   switch carries what is left of it: a new agent is a draft by default, and
 *   turning it on here says plainly that nothing has tested it yet.
 * - **"How should it work?"** — Balanced, Faster, More thorough. Recorded and
 *   read by nothing, so picking More thorough changed nothing. It is now
 *   Reasoning Effort, saved onto the agent.
 */

type ReasoningEffort = "LOW" | "MEDIUM" | "HIGH";
type ModelSelectionMode = "inherit" | "override";

const reasoningLevels: ReasoningEffort[] = ["LOW", "MEDIUM", "HIGH"];

/**
 * Mirrors of the runtime's platform defaults and ceilings.
 *
 * The same two objects the settings screen carries, for the same reason: a blank
 * box has to say what it will do. The drift guard in `quality-drift.test.ts`
 * pins them to the runtime values.
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
const AGENT_LIMIT_CEILINGS = { maxSteps: 100, maxToolCalls: 100, maxRuntimeMinutes: 60, maxInputTokens: 10000000, maxCostGBP: 50 } as const;

/** Empty, zero and nonsense all mean "inherit the default", matching the server. */
function parseLimitInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

type NewAgentForm = {
  name: string;
  description: string;
  avatar: string;
  modelId: string;
  modelSelectionMode: ModelSelectionMode;
  reasoningEffort: ReasoningEffort;
  allowInternetAccess: boolean;
  /** Inverted for display: the switch reads as the safe state being on. */
  requireHumanApproval: boolean;
  approvalExpiryHours: string;
  maxSteps: string;
  maxToolCalls: string;
  maxInputTokens: string;
  maxRuntimeMinutes: string;
  maxCostGBP: string;
  isActive: boolean;
  storageId?: Id<"_storage">;
};

const emptyForm: NewAgentForm = {
  name: "",
  description: "",
  avatar: "",
  modelId: "",
  modelSelectionMode: "inherit",
  reasoningEffort: "MEDIUM",
  allowInternetAccess: false,
  // A new agent stops for a person until somebody decides otherwise.
  requireHumanApproval: true,
  approvalExpiryHours: "",
  maxSteps: "",
  maxToolCalls: "",
  maxInputTokens: "",
  maxRuntimeMinutes: "",
  maxCostGBP: "",
  // A draft by default: worth a look before it can be run, but not a rule.
  isActive: false,
};

export default function NewAgentPage() {
  const router = useRouter();
  const t = useTranslations("admin.agents");
  // The settings screen's own copy, so the two screens cannot say the same thing
  // two different ways.
  const ts = useTranslations("admin.agents.details.settings");

  const createAgent = useMutation(api.agents.createAgent);
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "agent" });
  const approvalExpiry = useQuery(api.agentRuns.getApprovalExpiryConfig, {});

  const activeModels = useMemo(
    () => (activeModelsData ?? []) as Doc<"aiModels">[],
    [activeModelsData],
  );
  const defaultModel = activeModels.find((model) => model.isDefault);

  const [formData, setFormData] = useState<NewAgentForm>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  // What "follow the platform default" would actually mean, named before it is
  // chosen rather than left as a greyed-out box — exactly as settings names it.
  const inheritOptionLabel = defaultModel
    ? ts("sections.engine.model.followDefaultNamed", { model: formatModelDisplayName(defaultModel) })
    : activeModelsData === undefined
      ? ts("sections.engine.model.followDefault")
      : ts("sections.engine.model.followDefaultMissing");

  const describeModelPrice = (model: Doc<"aiModels">) => {
    const input = formatTokenCost(model.standardInputCostBelow200k);
    const output = formatTokenCost(model.outputResponseCost);
    if (input === "—" && output === "—") return "";
    return ` · ${input} in · ${output} out`;
  };

  const canCreate = Boolean(formData.name.trim());

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError("");

    try {
      const newAgentId = await createAgent({
        name: formData.name.trim(),
        description: formData.description,
        modelSelectionMode: formData.modelSelectionMode,
        ...(formData.modelSelectionMode === "override" ? { modelId: formData.modelId } : {}),
        reasoningEffort: formData.reasoningEffort,
        allowInternetAccess: formData.allowInternetAccess,
        autonomousToolExecution: !formData.requireHumanApproval,
        // Zero rather than omitted, because the server reads an unusable number
        // as "follow the platform default" — the same reading the update path
        // gives a cleared box.
        approvalExpiryHours: parseLimitInput(formData.approvalExpiryHours) ?? 0,
        maxSteps: parseLimitInput(formData.maxSteps) ?? 0,
        maxToolCalls: parseLimitInput(formData.maxToolCalls) ?? 0,
        maxInputTokens: parseLimitInput(formData.maxInputTokens) ?? 0,
        maxRuntimeMs: (parseLimitInput(formData.maxRuntimeMinutes) ?? 0) * 60000,
        maxCostGBP: parseLimitInput(formData.maxCostGBP) ?? 0,
        isActive: formData.isActive,
        ...(formData.storageId ? { storageId: formData.storageId } : {}),
      });

      router.push(`/admin/agents/${newAgentId}`);
    } catch (error: unknown) {
      setSubmitError(getErrorMessage(error, t("errors.create")));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div>
        <Link
          href="/admin/agents"
          className="text-[13px] text-secondary hover:text-foreground transition-colors inline-flex items-center gap-1.5 mb-2"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {t("builder.backToAgents")}
        </Link>
        <AdminPageHeader
          icon={<Bot className="w-6 h-6 text-brand" />}
          title={t("modal.initTitle")}
          description={t("modal.initDesc")}
        />
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
        <AdminSaveError>{submitError}</AdminSaveError>

        {/* The settings screen's layout, card for card. */}
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SettingsCard title={ts("sections.identity.title")}>
            <AdminAvatarPicker
              avatar={formData.avatar}
              labels={{
                updateButton: ts("sections.identity.avatar.updateButton"),
                hint: ts("sections.identity.avatar.hint"),
                modalTitle: ts("uploadModal.title"),
                modalSubtitle: ts("uploadModal.subtitle"),
                processing: ts("uploadModal.processing"),
                dropText: ts("uploadModal.dropText"),
                dropHint: ts("uploadModal.dropHint"),
                cancel: ts("uploadModal.cancel"),
                uploadFailed: ts("errors.uploadFailed"),
              }}
              onUploaded={({ storageId, previewUrl }) =>
                setFormData((previous) => ({ ...previous, storageId, avatar: previewUrl }))
              }
            />

            <FieldLabel htmlFor="agent-name">{ts("sections.identity.name")}</FieldLabel>
            <input
              id="agent-name"
              type="text"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className={adminFieldClassName}
              placeholder={t("placeholders.name")}
            />

            <FieldLabel htmlFor="agent-description">{ts("sections.identity.description")}</FieldLabel>
            <textarea
              id="agent-description"
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className={adminTextAreaClassName}
              placeholder={t("placeholders.description")}
            />
          </SettingsCard>

          <SettingsCard title={ts("sections.engine.groups.behaviour")}>
            <FieldLabel htmlFor="agent-model">{ts("sections.engine.model.label")}</FieldLabel>
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
            </select>
            <p className="text-[11px] leading-relaxed text-muted">
              {ts("sections.engine.model.hint")}
            </p>

            <div className="flex flex-col gap-2 pt-1">
              <FieldLabel>{ts("sections.engine.reasoning.label")}</FieldLabel>
              <SegmentedChoice
                label={ts("sections.engine.reasoning.label")}
                value={formData.reasoningEffort}
                options={reasoningLevels.map((level) => ({
                  value: level,
                  label: ts(`sections.engine.reasoning.levels.${level}`),
                }))}
                onChange={(level) => setFormData({ ...formData, reasoningEffort: level })}
              />
              <p className="text-[11px] leading-relaxed text-muted">
                {ts("sections.engine.reasoning.hint")}
              </p>
            </div>

            <div className="mt-1 divide-y divide-border-dim/40 border-t border-border-dim/40">
              <SettingSwitch
                label={ts("sections.engine.internet.label")}
                description={formData.allowInternetAccess
                  ? ts("sections.engine.internet.hintOn")
                  : ts("sections.engine.internet.hintOff")}
                checked={formData.allowInternetAccess}
                onChange={(next) => setFormData({ ...formData, allowInternetAccess: next })}
              />
              <SettingSwitch
                label={ts("sections.engine.approval.label")}
                description={formData.requireHumanApproval
                  ? ts("sections.engine.approval.hintRequired")
                  : ts("sections.engine.approval.hintAutonomous")}
                checked={formData.requireHumanApproval}
                onChange={(next) => setFormData({ ...formData, requireHumanApproval: next })}
              >
                {formData.requireHumanApproval && (
                  <div className="flex flex-col gap-1.5 pt-3">
                    <label htmlFor="agent-approval-expiry" className="text-[11px] text-secondary">
                      {ts("sections.engine.approval.expiryLabel")}
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
                      {ts("sections.engine.approval.expiryHint", {
                        hours: approvalExpiry?.expiryHours ?? 24,
                      })}
                    </p>
                  </div>
                )}
              </SettingSwitch>
            </div>
          </SettingsCard>

          <SettingsCard title={ts("sections.engine.groups.limits")} className="xl:col-span-2">
            <p className="-mt-1 text-[12px] leading-relaxed text-secondary">
              {ts("sections.engine.budget.hint")}
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
                      {ts(`sections.engine.budget.fields.${key}`)}
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
                      {ts("sections.engine.budget.inherits", {
                        value: AGENT_LIMIT_DEFAULTS[limit].toLocaleString("en-GB"),
                        ceiling: AGENT_LIMIT_CEILINGS[limit].toLocaleString("en-GB"),
                      })}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* The same switch the settings screen carries, and it works here
                for the same reason it works there: checks report, they do not
                decide. A new agent still defaults to a draft, because most are
                worth a look before they can be run. */}
            <div className="mt-2 border-t border-border-dim/40">
              <SettingSwitch
                label={formData.isActive
                  ? ts("sections.engine.status.active")
                  : ts("sections.engine.status.inactive")}
                description={formData.isActive
                  ? t("builder.startsOnWarning")
                  : ts("sections.engine.status.hintInactive")}
                checked={formData.isActive}
                onChange={(next) => setFormData({ ...formData, isActive: next })}
              />
            </div>
          </SettingsCard>
        </div>

        <div className="flex items-center gap-3">
          <AdminWriteButton
            type="submit"
            disabled={isSubmitting || !canCreate}
            className="rounded-[8px] bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? t("buttons.creating") : t("buttons.createDraft")}
          </AdminWriteButton>
          <Link
            href="/admin/agents"
            className="rounded-[8px] border border-border-dim px-4 py-2 text-[13px] text-secondary transition-colors hover:text-foreground"
          >
            {t("buttons.cancel")}
          </Link>
          {/* Said once, near the button, rather than by greying it out with no
              explanation — the wizard disabled Next and left you guessing. */}
          {!canCreate && !isSubmitting && (
            <span className="text-[12px] text-muted">{t("builder.whatIsMissing")}</span>
          )}
        </div>
      </form>
    </div>
  );
}
