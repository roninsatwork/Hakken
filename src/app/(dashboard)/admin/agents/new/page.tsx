"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Bot } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { formatModelDisplayName } from "@/src/app/(dashboard)/admin/ai/models/_components/modelAdminUtils";
import { describePurposeAndOwnerProblems } from "@/convex/agentAccountabilityService";
import { AgentFormSections, parseLimitInput, type AgentFormValues } from "../_components/AgentFormSections";

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
 * So this screen is now the settings screen's sections, drawn by the very same
 * component — `AgentFormSections` — so the layout, the order, the wording and
 * the controls cannot drift between them. It had drifted a third time on
 * 2026-09-23, when Settings moved to rows and this screen did not. What you set
 * here, the role included, is what you will see when it opens.
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

const emptyForm: AgentFormValues = {
  name: "",
  description: "",
  ownerId: "",
  riskLevel: "",
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
  maxCostUsd: "",
  // A draft by default: worth a look before it can be run, but not a rule.
  isActive: false,
  role: "NONE",
  plannerMode: "TEST",
};

export default function NewAgentPage() {
  const router = useRouter();
  const t = useTranslations("admin.agents");
  // The settings screen's own copy, so the two screens cannot say the same thing
  // two different ways.
  const ts = useTranslations("admin.agents.details.settings");

  const createAgent = useMutation(api.agents.createAgent);
  const action = useAdminAction({ scope: "admin-agents-new" });
  const accountablePeople = useQuery(api.users.getAccountablePeople) ?? [];
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "agent" });
  const approvalExpiry = useQuery(api.agentRunApprovals.getApprovalExpiryConfig, {});
  const roleHolders = useQuery(api.agentRoles.listAgentRoleHolders, {}) ?? [];

  const activeModels = useMemo(
    () => (activeModelsData ?? []) as Doc<"aiModels">[],
    [activeModelsData],
  );
  const defaultModel = activeModels.find((model) => model.isDefault);

  const [formData, setFormData] = useState<AgentFormValues>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // What "follow the platform default" would actually mean, named before it is
  // chosen rather than left as a greyed-out box — exactly as settings names it.
  const inheritOptionLabel = defaultModel
    ? ts("sections.engine.model.followDefaultNamed", { model: formatModelDisplayName(defaultModel) })
    : activeModelsData === undefined
      ? ts("sections.engine.model.followDefault")
      : ts("sections.engine.model.followDefaultMissing");

  /**
   * What still has to be said before this can be created.
   *
   * The purpose and owner rules come from the same function the server uses, so
   * the form and the backend cannot disagree about what is required or word it
   * two different ways.
   */
  const missingPieces = [
    ...(formData.name.trim() ? [] : [t("builder.whatIsMissing")]),
    ...describePurposeAndOwnerProblems({
      purpose: formData.description,
      ownerId: formData.ownerId || undefined,
    }),
  ];
  const canCreate = missingPieces.length === 0;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canCreate || isSubmitting) return;

    setIsSubmitting(true);

    const outcome = await action.run(
      () => createAgent({
        name: formData.name.trim(),
        description: formData.description,
        ownerId: formData.ownerId ? (formData.ownerId as Id<"users">) : undefined,
        ...(formData.riskLevel ? { riskLevel: formData.riskLevel as "LOW" | "MEDIUM" | "HIGH" } : {}),
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
        maxCostUsd: parseLimitInput(formData.maxCostUsd) ?? 0,
        isActive: formData.isActive,
        ...(formData.role !== "NONE" ? { role: formData.role } : {}),
        ...(formData.role === "DATAFORSEO_PLANNER" ? { plannerMode: formData.plannerMode } : {}),
        ...(formData.storageId ? { storageId: formData.storageId } : {}),
      }),
      { suppressErrorToast: true, fallbackMessage: t("errors.create") },
    );

    if (outcome.ok) {
      router.push(`/admin/agents/${outcome.data}`);
      return;
    }
    setIsSubmitting(false);
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
        <PageHeader
          icon={<Bot className="w-6 h-6 text-brand" />}
          title={t("modal.initTitle")}
          description={t("modal.initDesc")}
        />
      </div>

      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6">
        <SaveError>{action.error}</SaveError>

        {/* The settings screen's sections, drawn by the same component. */}
        <AgentFormSections
          values={formData}
          onChange={(patch) => setFormData((previous) => ({ ...previous, ...patch }))}
          models={activeModels}
          inheritOptionLabel={inheritOptionLabel}
          accountablePeople={accountablePeople}
          approvalExpiry={approvalExpiry ?? undefined}
          roleHolders={roleHolders}
          placeholders={{ name: t("placeholders.name"), description: t("placeholders.description") }}
          // Checks report, they do not decide: switching a new agent on here
          // says plainly that nothing has tested it yet.
          activeDescription={t("builder.startsOnWarning")}
        />

        <div className="flex items-center gap-3">
          <WriteButton
            type="submit"
            disabled={isSubmitting || !canCreate}
            className="rounded-[8px] bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? t("buttons.creating") : t("buttons.createDraft")}
          </WriteButton>
          <Link
            href="/admin/agents"
            className="rounded-[8px] border border-border-dim px-4 py-2 text-[13px] text-secondary transition-colors hover:text-foreground"
          >
            {t("buttons.cancel")}
          </Link>
          {/* Said once, near the button, rather than by greying it out with no
              explanation — the wizard disabled Next and left you guessing. */}
          {!canCreate && !isSubmitting && (
            <span className="text-[12px] text-muted">{missingPieces.join(" ")}</span>
          )}
        </div>
      </form>
    </div>
  );
}
