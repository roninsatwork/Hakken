"use client";

import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { useState, useMemo } from "react";
import type { FormEvent } from "react";
import { useParams } from "next/navigation";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  SaveAction,
  SaveError,
} from "@/src/ui/components/screens/SaveControls";
import { isAssignableAgentRole } from "@/convex/utils/agentRoles";
import { formatModelDisplayName } from "@/src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils";
import { AgentFormSections, parseLimitInput, type AgentFormValues } from "../../_components/AgentFormSections";


/** The shared form, plus what only an existing agent carries. */
type AgentSettingsFormData = AgentFormValues & { thinkingMode: boolean };

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
  maxCostUsd: "",
  role: "NONE",
  plannerMode: "TEST",
};

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
  const approvalExpiry = useQuery(api.agentRunApprovals.getApprovalExpiryConfig, {});
  const accountablePeople = useQuery(api.users.getAccountablePeople) ?? [];
  const roleHolders = useQuery(api.agentRoles.listAgentRoleHolders, {}) ?? [];
  const updateAgent = useMutation(api.agents.updateAgent);
  const action = useAdminAction({ scope: "admin-agent-settings" });

  const [formData, setFormData] = useState<AgentSettingsFormData>(emptyFormData);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  // Only about the model that is actually saved: an unsaved change to this
  // control has not been judged yet.
  const isOverrideUnusable = modelReadiness?.source === "override"
    && modelReadiness.status === "WARN"
    && formData.modelSelectionMode === "override"
    && formData.modelId === modelReadiness.modelId;

  const [seenAgentId, setSeenAgentId] = useState<Id<"agents"> | null>(null);

  if (
    agent
    && seenAgentId !== agent._id
    && (agent.modelId || activeModelsData !== undefined)
  ) {
    setSeenAgentId(agent._id);
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
      maxCostUsd: agent.maxCostUsd ? String(agent.maxCostUsd) : "",
      role: isAssignableAgentRole(agent.systemKey) ? agent.systemKey : "NONE",
      plannerMode: agent.plannerMode ?? "TEST",
      storageId: undefined,
    });
  }

  // The wiki staff and the Decisions agent carry a role the code finds them
  // by, so it is shown and never offered for change.
  const hasFixedRole = Boolean(agent?.systemKey) && !isAssignableAgentRole(agent?.systemKey);

  const handleSave = async (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    const outcome = await action.run(
      () => updateAgent({
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
        maxCostUsd: parseLimitInput(formData.maxCostUsd) ?? 0,
        // A built-in role is never sent: the server refuses to move it.
        ...(hasFixedRole ? {} : { role: formData.role }),
        ...(formData.role === "DATAFORSEO_PLANNER" ? { plannerMode: formData.plannerMode } : {}),
        storageId: formData.storageId
      }),
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );
    if (outcome.ok) {
      setFormData((prev) => ({ ...prev, storageId: undefined }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
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
          <SaveAction
            type="submit"
            isSaving={action.isBusy()}
            label={t("sections.identity.saveButton")}
            savingLabel={t("sections.identity.saving")}
            successLabel={t("sections.identity.synchronized")}
            showSuccess={saveSuccess}
          />
        </div>
        <SaveError>{action.error}</SaveError>

        <AgentFormSections
          values={formData}
          onChange={(patch) => setFormData((prev) => ({ ...prev, ...patch }))}
          models={activeModels}
          inheritOptionLabel={inheritOptionLabel}
          modelWarning={isOverrideUnusable ? t("sections.engine.model.unusable") : undefined}
          accountablePeople={accountablePeople}
          approvalExpiry={approvalExpiry ?? undefined}
          roleHolders={roleHolders}
          agentId={agentId}
          builtInRoleName={hasFixedRole ? agent.name : undefined}
          activeDescription={t("sections.engine.status.hintActive")}
          statusExtra={activationWarning ? (
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
        />
      </form>

    </div>
  );
}
