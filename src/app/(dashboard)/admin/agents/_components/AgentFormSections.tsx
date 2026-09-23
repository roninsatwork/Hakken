"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";

import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ASSIGNABLE_AGENT_ROLES, isAssignableAgentRole, type AgentRoleChoice } from "@/convex/utils/agentRoles";
import { AdminAvatarPicker } from "@/src/app/(dashboard)/admin/_components/AdminAvatarPicker";
import { formatModelDisplayName, formatTokenCost } from "@/src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import {
  SegmentedChoice,
  SettingRow,
  SettingSwitch,
  SettingsCard,
} from "@/src/ui/components/screens/SettingsCard";
import { Select } from "@/src/ui/components/screens/Select";
import { AgentBudgetFields } from "./AgentBudgetFields";

/**
 * Everything about an agent, drawn once for both the create and the settings
 * screen.
 *
 * Anthony, 2026-09-23, finding Create still in the old layout the day Settings
 * moved to rows: *"having two different UX is not good."* It was the third
 * time the two had parted — the wording was already shared and the limit boxes
 * already shared, and the arrangement was not, so it was the arrangement that
 * drifted. Now the sections, their order, their wording and their controls
 * live here; a screen supplies only what it loaded and what its buttons do.
 */

/**
 * The kit's Select, which draws its own arrow inset from the edge instead of
 * the browser's, sized to match the text boxes beside it.
 */
const SELECT_WRAPPER = "w-full";
const SELECT_BOX = "h-[46px] rounded-[12px] bg-black/20 pl-4 pr-11 text-[14px]";

type ReasoningEffort = "LOW" | "MEDIUM" | "HIGH";
const REASONING_LEVELS: ReasoningEffort[] = ["LOW", "MEDIUM", "HIGH"];

export type AgentFormValues = {
  name: string;
  description: string;
  ownerId: string;
  riskLevel: string;
  avatar: string;
  modelId: string;
  modelSelectionMode: "inherit" | "override";
  reasoningEffort: ReasoningEffort;
  allowInternetAccess: boolean;
  /** Inverted for display: the switch reads as the safe state being on. */
  requireHumanApproval: boolean;
  /** Blank follows the platform window. */
  approvalExpiryHours: string;
  /** Blank means inherit the platform default. Held as text so a box can be empty. */
  maxSteps: string;
  maxToolCalls: string;
  maxInputTokens: string;
  maxRuntimeMinutes: string;
  maxCostUsd: string;
  isActive: boolean;
  /** The agent's job from the Role dropdown; a built-in role is not edited here. */
  role: AgentRoleChoice;
  /** The Planner's mode — shown and saved only while the role is DataForSEO Planner. */
  plannerMode: "TEST" | "LIVE";
  storageId?: Id<"_storage">;
};

/** Empty, zero and nonsense all mean "inherit the default", matching the server. */
export function parseLimitInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function AgentFormSections({
  values,
  onChange,
  models,
  inheritOptionLabel,
  modelWarning,
  accountablePeople,
  approvalExpiry,
  roleHolders,
  agentId,
  builtInRoleName,
  placeholders,
  activeDescription,
  statusExtra,
}: {
  values: AgentFormValues;
  onChange: (patch: Partial<AgentFormValues>) => void;
  models: Doc<"aiModels">[];
  /** What "follow the platform default" means for this agent, named. */
  inheritOptionLabel: string;
  /** Shown under the model box when the chosen model cannot run. */
  modelWarning?: string;
  accountablePeople: Array<{ _id: string; name: string }>;
  approvalExpiry?: { expiryHours: number; maxHours: number };
  roleHolders: Array<{ systemKey: string; agentId: string; name: string }>;
  /** The agent being edited, so its own role is not shown as taken. Absent when creating. */
  agentId?: string;
  /** Set when the agent holds a built-in role, which is shown and never changed. */
  builtInRoleName?: string;
  placeholders?: { name?: string; description?: string };
  /** What the Active switch says while it is on — creating warns, editing does not. */
  activeDescription: string;
  /** Anything a screen says under the Active switch, such as what is unproven. */
  statusExtra?: ReactNode;
}) {
  const t = useTranslations("admin.agents.details.settings");
  const tAgents = useTranslations("admin.agents");

  // A model's price, said beside its name in the model list.
  const describeModelPrice = (model: Doc<"aiModels">) => {
    const input = formatTokenCost(model.standardInputCostBelow200k);
    const output = formatTokenCost(model.outputResponseCost);
    if (input === "—" && output === "—") return "";
    return ` · ${t("sections.engine.model.price", { input, output })}`;
  };
  const isLegacyOverride = values.modelSelectionMode === "override"
    && Boolean(values.modelId)
    && models.length > 0
    && !models.some((model) => model.modelId === values.modelId);
  const builtInHolders = roleHolders.filter((entry) => !isAssignableAgentRole(entry.systemKey));

  return (
    <>
      {/* One setting per row, the words on the left and the control on the
          right. Anthony, 2026-09-23, choosing it over the two-column cards: each
          setting says what it is beside it, so the page reads top to bottom. */}
      <SettingsCard title={t("sections.identity.title")}>
        <div className="divide-y divide-border-dim/40">
          <SettingRow label={t("sections.identity.name")} description={t("sections.identity.nameHint")}>
            <Field
              label={t("sections.identity.name")}
              labelHidden
              id="agent-name"
              type="text"
              value={values.name}
              onChange={(e) => onChange({ name: e.target.value })}
              placeholder={placeholders?.name}
            />
          </SettingRow>
          <SettingRow label={t("sections.identity.description")} description={t("sections.identity.descriptionHint")}>
            <TextAreaField
              label={t("sections.identity.description")}
              labelHidden
              id="agent-description"
              rows={3}
              value={values.description}
              onChange={(e) => onChange({ description: e.target.value })}
              placeholder={placeholders?.description}
            />
          </SettingRow>
          <SettingRow label={t("sections.identity.image")} description={t("sections.identity.avatar.hint")}>
            <AdminAvatarPicker
              avatar={values.avatar}
              labels={{
                updateButton: t("sections.identity.avatar.updateButton"),
                hint: "",
                modalTitle: t("uploadModal.title"),
                modalSubtitle: t("uploadModal.subtitle"),
                processing: t("uploadModal.processing"),
                dropText: t("uploadModal.dropText"),
                dropHint: t("uploadModal.dropHint"),
                cancel: t("uploadModal.cancel"),
                uploadFailed: t("errors.uploadFailed"),
              }}
              onUploaded={({ storageId, previewUrl }) => onChange({ storageId, avatar: previewUrl })}
            />
          </SettingRow>
          {/* Who answers for this assistant now — not who created it, which
              the audit trail already records. */}
          <SettingRow label={tAgents("owner.label")} description={tAgents("owner.hint")}>
            <Select
              id="agent-owner"
              aria-label={tAgents("owner.label")}
              value={values.ownerId}
              onChange={(ownerId) => onChange({ ownerId })}
              className={SELECT_WRAPPER}
              selectClassName={SELECT_BOX}
            >
              <option value="">{tAgents("owner.choose")}</option>
              {accountablePeople.map((person) => (
                <option key={person._id} value={person._id}>{person.name}</option>
              ))}
            </Select>
          </SettingRow>
          {/* Not a label: High makes human approval a consequence, and the
              platform refuses to switch it off afterwards. */}
          <SettingRow
            label={tAgents("risk.label")}
            description={values.riskLevel === "HIGH" ? tAgents("risk.highHint") : tAgents("risk.hint")}
          >
            <Select
              id="agent-risk"
              aria-label={tAgents("risk.label")}
              value={values.riskLevel}
              onChange={(riskLevel) => onChange({ riskLevel })}
              className={SELECT_WRAPPER}
              selectClassName={SELECT_BOX}
            >
              <option value="">{tAgents("risk.unrated")}</option>
              <option value="LOW">{tAgents("risk.low")}</option>
              <option value="MEDIUM">{tAgents("risk.medium")}</option>
              <option value="HIGH">{tAgents("risk.high")}</option>
            </Select>
          </SettingRow>
        </div>
      </SettingsCard>

      {/* What the agent does. A role is a job the platform runs, found by the
          role and never by the agent's name — see convex/agentRoles.ts. */}
      <SettingsCard title={t("sections.role.title")}>
        <SettingRow
          label={t("sections.role.label")}
          description={builtInRoleName ? t("sections.role.fixedHint") : t("sections.role.hint")}
        >
          <Select
            id="agent-role"
            aria-label={t("sections.role.label")}
            value={builtInRoleName ? "FIXED" : values.role}
            disabled={Boolean(builtInRoleName)}
            onChange={(role) => onChange({ role: role as AgentRoleChoice })}
            className={SELECT_WRAPPER}
            selectClassName={SELECT_BOX}
          >
            {builtInRoleName ? (
              <option value="FIXED">{t("sections.role.fixed", { name: builtInRoleName })}</option>
            ) : (
              <>
                <option value="NONE">{t("sections.role.general")}</option>
                <optgroup label={t("sections.role.groups.dataforseo")}>
                  {ASSIGNABLE_AGENT_ROLES.map((role) => {
                    const holder = roleHolders.find((entry) => entry.systemKey === role && entry.agentId !== agentId);
                    return (
                      <option key={role} value={role} disabled={Boolean(holder)}>
                        {holder
                          ? t("sections.role.takenBy", { role: t(`sections.role.roles.${role}`), name: holder.name })
                          : t(`sections.role.roles.${role}`)}
                      </option>
                    );
                  })}
                </optgroup>
                {builtInHolders.length > 0 ? (
                  <optgroup label={t("sections.role.groups.builtIn")}>
                    {builtInHolders.map((entry) => (
                      <option key={entry.agentId} value={entry.systemKey} disabled>{entry.name}</option>
                    ))}
                  </optgroup>
                ) : null}
              </>
            )}
          </Select>
        </SettingRow>
        {/* Anthony, 2026-09-23: while testing, the Planner adds everything;
            live, it respects each company's cadence. Only the Planner has it. */}
        {values.role === "DATAFORSEO_PLANNER" && !builtInRoleName ? (
          <div className="border-t border-border-dim/40">
            <SettingRow
              label={t("sections.role.mode.label")}
              description={values.plannerMode === "LIVE" ? t("sections.role.mode.liveHint") : t("sections.role.mode.testHint")}
            >
              <SegmentedChoice
                label={t("sections.role.mode.label")}
                value={values.plannerMode}
                options={[
                  { value: "TEST", label: t("sections.role.mode.test") },
                  { value: "LIVE", label: t("sections.role.mode.live") },
                ]}
                onChange={(plannerMode) => onChange({ plannerMode })}
              />
            </SettingRow>
          </div>
        ) : null}
      </SettingsCard>

      <SettingsCard title={t("sections.engine.groups.behaviour")}>
        <div className="divide-y divide-border-dim/40">
          {/* One control, not two: the first option names what "follow the
              platform default" would actually run. */}
          <SettingRow label={t("sections.engine.model.label")} description={t("sections.engine.model.hint")}>
            <Select
              id="agent-model"
              aria-label={t("sections.engine.model.label")}
              value={values.modelSelectionMode === "inherit" ? "" : values.modelId || ""}
              className={SELECT_WRAPPER}
              selectClassName={`${SELECT_BOX} cursor-pointer`}
              onChange={(nextModelId) => {
                onChange({
                  modelSelectionMode: nextModelId ? "override" : "inherit",
                  ...(nextModelId ? { modelId: nextModelId } : {}),
                });
              }}
            >
              <option value="">{inheritOptionLabel}</option>
              {models.map((m) => (
                <option key={m.modelId} value={m.modelId}>
                  {formatModelDisplayName(m)}{describeModelPrice(m)}
                </option>
              ))}
              {isLegacyOverride && (
                <option value={values.modelId}>
                  {t("sections.engine.model.legacy", { id: values.modelId })}
                </option>
              )}
            </Select>
            {modelWarning ? (
              <p className="mt-2 text-[12px] leading-relaxed text-warning">{modelWarning}</p>
            ) : null}
          </SettingRow>

          <SettingRow label={t("sections.engine.reasoning.label")} description={t("sections.engine.reasoning.hint")}>
            <SegmentedChoice
              label={t("sections.engine.reasoning.label")}
              value={values.reasoningEffort}
              options={REASONING_LEVELS.map((level) => ({
                value: level,
                label: t(`sections.engine.reasoning.levels.${level}`),
              }))}
              onChange={(level) => onChange({ reasoningEffort: level })}
            />
          </SettingRow>

          <SettingSwitch
            label={t("sections.engine.internet.label")}
            description={values.allowInternetAccess
              ? t("sections.engine.internet.hintOn")
              : t("sections.engine.internet.hintOff")}
            checked={values.allowInternetAccess}
            onChange={(next) => onChange({ allowInternetAccess: next })}
          />
          <SettingSwitch
            label={t("sections.engine.approval.label")}
            description={values.requireHumanApproval
              ? t("sections.engine.approval.hintRequired")
              : t("sections.engine.approval.hintAutonomous")}
            checked={values.requireHumanApproval}
            onChange={(next) => onChange({ requireHumanApproval: next })}
          />
          {/* Only meaningful while approval is on: an autonomous agent never
              waits, so there is nothing for a window to bound. */}
          {values.requireHumanApproval && (
            <SettingRow
              label={t("sections.engine.approval.expiryLabel")}
              description={t("sections.engine.approval.expiryHint", { hours: approvalExpiry?.expiryHours ?? 24 })}
            >
              <Field
                label={t("sections.engine.approval.expiryLabel")}
                labelHidden
                id="agent-approval-expiry"
                type="number"
                min={0}
                step="1"
                max={approvalExpiry?.maxHours ?? 720}
                value={values.approvalExpiryHours}
                onChange={(e) => onChange({ approvalExpiryHours: e.target.value })}
                placeholder={String(approvalExpiry?.expiryHours ?? 24)}
              />
            </SettingRow>
          )}
        </div>
      </SettingsCard>

      {/* The budget is what remains when approval is off. */}
      <SettingsCard title={t("sections.engine.groups.limits")}>
        <p className="-mt-1 text-[12px] leading-relaxed text-secondary">{t("sections.engine.budget.hint")}</p>
        <AgentBudgetFields layout="rows" values={values} onChange={(key, value) => onChange({ [key]: value })} />
      </SettingsCard>

      <SettingsCard title={t("sections.status.title")}>
        <SettingSwitch
          label={values.isActive ? t("sections.engine.status.active") : t("sections.engine.status.inactive")}
          description={values.isActive ? activeDescription : t("sections.engine.status.hintInactive")}
          checked={values.isActive}
          onChange={(next) => onChange({ isActive: next })}
        >
          {statusExtra}
        </SettingSwitch>
      </SettingsCard>
    </>
  );
}
