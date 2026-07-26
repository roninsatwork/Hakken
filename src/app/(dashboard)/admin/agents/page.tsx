"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { FormEvent } from "react";
import Image from "next/image";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Bot,
  Workflow,
  Plus,
  Trash2,
  Settings,
  Sparkles,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AdminConfirmationModal } from "@/src/app/(dashboard)/admin/_components/AdminConfirmationModal";
import {
  AdminPageHeader,
  AdminPagePrimaryAction,
} from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import {
  AdminLoadMoreFooter,
  AdminRowActions,
  AdminRowIconButton,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";

type Agent = Doc<"agents">;

const BUILDER_STEPS = ["template", "mission", "policy", "readiness"] as const;
type BuilderStep = typeof BUILDER_STEPS[number];

type BuilderForm = {
  objective: string;
  audience: string;
  modelBehavior: "balanced" | "fast" | "careful";
  knowledgePlan: "template" | "later";
  toolPlan: "template" | "later";
  readinessAcknowledged: boolean;
};

const defaultBuilderForm: BuilderForm = {
  objective: "",
  audience: "",
  modelBehavior: "balanced",
  knowledgePlan: "template",
  toolPlan: "template",
  readinessAcknowledged: false,
};

export default function AgentsPage() {
  const router = useRouter();
  const t = useTranslations('admin.agents');
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "agent" });
  const activeModels = activeModelsData || [];
  const createAgent = useMutation(api.agents.createAgent);
  const createAgentFromTemplate = useMutation(api.agents.createAgentFromTemplate);
  const deleteAgent = useMutation(api.agents.deleteAgent);
  const templates = useQuery(api.agents.getAgentTemplatesForCreation) || [];
  // Asked once for the whole page, not once per row.
  const inheritedModels = useQuery(api.agents.getInheritedAgentModels);

  /**
   * What this agent actually runs.
   *
   * This column used to print the agent's stored `modelId` regardless of whether
   * the agent uses it. The runtime only applies an agent's own model when its
   * mode is "override", so every inheriting agent was listed against a leftover
   * value — naming a model it never touches.
   */
  const describeAgentModel = (agent: { modelId: string; modelSelectionMode?: string; workflowId?: string }) => {
    if (agent.modelSelectionMode === "override") {
      const ownModel = activeModels.find((model) => model.modelId === agent.modelId);
      return ownModel?.friendlyName || ownModel?.displayName || agent.modelId;
    }

    const inherited = agent.workflowId ? inheritedModels?.workflow : inheritedModels?.agent;
    if (!inheritedModels) return "";
    return inherited
      ? t('table.followsPlatformDefault', { model: inherited.displayName })
      : t('table.platformDefaultNotSet');
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);

  const [formData, setFormData] = useState({ name: "", description: "" });
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [builderStepIndex, setBuilderStepIndex] = useState(0);
  const [builderForm, setBuilderForm] = useState<BuilderForm>(defaultBuilderForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const itemsPerPage = ADMIN_PAGE_SIZE;
  const {
    results: paginatedAgents,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.agents.getPaginatedAgents,
    { searchTerm },
    { initialNumItems: itemsPerPage }
  );
  const isLoading = status === "LoadingFirstPage" || activeModelsData === undefined;
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  const handleOpenAdd = () => {
    setFormData({ name: "", description: "" });
    setSelectedTemplateId(null);
    setBuilderStepIndex(0);
    setBuilderForm(defaultBuilderForm);
    setSubmitError("");
    setIsAddModalOpen(true);
  };

  const selectedTemplate = templates.find((template) => template.id === selectedTemplateId);
  const currentBuilderStep: BuilderStep = BUILDER_STEPS[builderStepIndex];
  const builderIntent = {
    objective: builderForm.objective.trim(),
    audience: builderForm.audience.trim(),
    modelBehavior: builderForm.modelBehavior,
    knowledgePlan: builderForm.knowledgePlan,
    toolPlan: builderForm.toolPlan,
    smokeEvalRequired: true,
    readinessAcknowledged: builderForm.readinessAcknowledged,
  };
  const canAdvanceBuilder =
    currentBuilderStep === "template" ||
    (currentBuilderStep === "mission" && Boolean(builderForm.objective.trim()) && Boolean(selectedTemplateId || formData.name.trim())) ||
    currentBuilderStep === "policy" ||
    (currentBuilderStep === "readiness" && builderForm.readinessAcknowledged);

  const goToNextBuilderStep = () => {
    if (!canAdvanceBuilder) return;
    setBuilderStepIndex((step) => Math.min(step + 1, BUILDER_STEPS.length - 1));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (builderStepIndex < BUILDER_STEPS.length - 1) {
      goToNextBuilderStep();
      return;
    }
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const newAgentId = selectedTemplateId
        ? await createAgentFromTemplate({
            templateId: selectedTemplateId,
            name: formData.name.trim() || undefined,
            builderIntent,
          })
        : await createAgent({
            name: formData.name,
            description: formData.description || builderForm.objective,
            builderIntent,
          });
      setIsAddModalOpen(false);
      // Navigate straight to the new agent's config page
      router.push(`/admin/agents/${newAgentId}`);
    } catch (err: unknown) {
      setSubmitError(getErrorMessage(err, t('errors.create')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (deletingAgent) {
      setIsSubmitting(true);
      try {
        await deleteAgent({ id: deletingAgent._id });
        setDeletingAgent(null);
      } catch (err: unknown) {
        setSubmitError(getErrorMessage(err, t('errors.delete')));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <AdminPageHeader
        icon={<Workflow className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('description')}
        action={
          <AdminPagePrimaryAction icon={<Plus className="w-4 h-4" />} onClick={handleOpenAdd}>
            {t('new')}
          </AdminPagePrimaryAction>
        }
      />

      <AdminSearchBar value={searchTerm} onChange={handleSearch} placeholder={t('searchPlaceholder')} />

      {/* Table */}
      <AdminTableShell
        footer={
          <AdminLoadMoreFooter
            visibleCount={paginatedAgents.length}
            canLoadMore={canLoadMore}
            isLoading={isLoadingMore}
            onLoadMore={() => loadMore(itemsPerPage)}
            labels={{
              empty: t('table.empty'),
              showing: (count) => t('table.showingLoaded', { count }),
              loadMore: t('table.loadMore'),
              loading: t('table.loadingMore'),
            }}
          />
        }
        minWidthClassName="min-w-[800px]"
      >
            <thead>
              <AdminTableHeaderRow>
                <AdminTableHeaderCell>{t('table.agent')}</AdminTableHeaderCell>
                <AdminTableHeaderCell>{t('table.model')}</AdminTableHeaderCell>
                <AdminTableHeaderCell>{t('table.status')}</AdminTableHeaderCell>
                <AdminTableHeaderCell align="right">{t('table.actions')}</AdminTableHeaderCell>
              </AdminTableHeaderRow>
            </thead>
            <tbody>
              <AnimatePresence>
                {isLoading ? (
                  <AdminTableLoadingRow colSpan={4} />
                ) : paginatedAgents.length === 0 ? (
                  <AdminTableEmptyRow
                    colSpan={4}
                    icon={<Bot className="w-8 h-8 text-muted/30" />}
                    label={t('table.empty')}
                  />
                ) : (
                  <>
                    {paginatedAgents.map((agent) => (
                      <motion.tr
                        key={agent._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => router.push(`/admin/agents/${agent._id}`)}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {agent.avatar ? (
                              <Image
                                src={agent.avatar}
                                alt={agent.name}
                                width={32}
                                height={32}
                                unoptimized
                                className="w-8 h-8 rounded-full border border-border-dim object-cover"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center text-foreground">
                                <Bot className="w-4 h-4 text-brand" />
                              </div>
                            )}
                            <div className="flex flex-col">
                              <span className="font-medium text-[13px] text-foreground leading-tight">
                                {agent.name}
                              </span>
                              {agent.description && (
                                <span className="text-[11px] text-secondary mt-0.5 line-clamp-1 max-w-[300px]">
                                  {agent.description}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                            {/* Not lowercased: a published model name such as
                                "MoonshotAI: Kimi K3" is not the platform's to
                                restyle, and the label is now a phrase. */}
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80">
                              {describeAgentModel(agent)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className={`flex items-center gap-2 text-[12px] font-medium ${agent.isActive ? 'text-green-500' : 'text-neutral-500'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${agent.isActive ? 'bg-green-500' : 'bg-neutral-500'}`} />
                            {agent.isActive ? t('table.active') : t('table.draft')}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <AdminRowActions>
                            <AdminRowIconButton label={t('table.configure')} onClick={() => router.push(`/admin/agents/${agent._id}`)}>
                              <Settings className="w-4 h-4" />
                            </AdminRowIconButton>
                            <AdminRowIconButton label={t('buttons.delete')} tone="danger" onClick={() => setDeletingAgent(agent)}>
                              <Trash2 className="w-4 h-4" />
                            </AdminRowIconButton>
                          </AdminRowActions>
                        </td>
                      </motion.tr>
                    ))}
                  </>
                )}
              </AnimatePresence>
            </tbody>
      </AdminTableShell>

      {/* Add Modal */}
      <SonaeModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={t('modal.initTitle')}
      >
        <p className="text-secondary mb-6 text-[15px]">{t('modal.initDesc')}</p>
        <AdminModalFormError className="mb-4">{submitError}</AdminModalFormError>
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-4 gap-2">
            {BUILDER_STEPS.map((step, index) => (
              <button
                key={step}
                type="button"
                onClick={() => setBuilderStepIndex(index)}
                className={`rounded-[8px] border px-2 py-2 text-[11px] font-medium transition-colors ${
                  index === builderStepIndex
                    ? "border-brand bg-brand/10 text-foreground"
                    : "border-border-dim bg-foreground/[0.03] text-muted hover:text-foreground"
                }`}
              >
                {t(`builder.steps.${step}`)}
              </button>
            ))}
          </div>

          {currentBuilderStep === "template" && templates.length > 0 && (
            <AdminModalFormField label={t('modal.template')}>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId(null)}
                  className={`rounded-[12px] border px-4 py-3 text-left transition-colors ${
                    selectedTemplateId === null
                      ? "border-brand bg-brand/10 text-foreground"
                      : "border-border-dim bg-foreground/[0.03] text-secondary hover:text-foreground"
                  }`}
                >
                  <span className="text-[13px] font-semibold">{t('modal.blankTemplate')}</span>
                  <span className="mt-1 block text-[11px] text-muted">{t('modal.blankTemplateDesc')}</span>
                </button>
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => {
                      setSelectedTemplateId(template.id);
                      setFormData((previous) => ({
                        ...previous,
                        name: previous.name || template.agentName,
                      }));
                    }}
                    className={`rounded-[12px] border px-4 py-3 text-left transition-colors ${
                      selectedTemplateId === template.id
                        ? "border-brand bg-brand/10 text-foreground"
                        : "border-border-dim bg-foreground/[0.03] text-secondary hover:text-foreground"
                    }`}
                  >
                    <span className="flex items-center gap-2 text-[13px] font-semibold">
                      <Sparkles className="h-3.5 w-3.5 text-brand" />
                      {template.name}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-[11px] leading-relaxed text-muted">
                      {template.description}
                    </span>
                  </button>
                ))}
              </div>
            </AdminModalFormField>
          )}

          {currentBuilderStep === "mission" && (
            <>
              <AdminModalFormField label={t('modal.name')}>
                <input
                  type="text"
                  required={!selectedTemplateId}
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className={adminModalInputClassName}
                  placeholder={selectedTemplate?.agentName || t('placeholders.name')}
                />
              </AdminModalFormField>

              <AdminModalFormField label={t('builder.objective')}>
                <textarea
                  required
                  value={builderForm.objective}
                  onChange={(e) => setBuilderForm({ ...builderForm, objective: e.target.value })}
                  className={`${adminModalInputClassName} min-h-[96px] resize-none`}
                  placeholder={t('builder.objectivePlaceholder')}
                />
              </AdminModalFormField>

              <AdminModalFormField label={t('builder.audience')}>
                <input
                  type="text"
                  value={builderForm.audience}
                  onChange={(e) => setBuilderForm({ ...builderForm, audience: e.target.value })}
                  className={adminModalInputClassName}
                  placeholder={t('builder.audiencePlaceholder')}
                />
              </AdminModalFormField>

              {!selectedTemplateId && (
                <AdminModalFormField label={t('modal.description')}>
                  <input
                    type="text"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className={adminModalInputClassName}
                    placeholder={t('placeholders.description')}
                  />
                </AdminModalFormField>
              )}
            </>
          )}

          {currentBuilderStep === "policy" && (
            <div className="grid gap-4">
              <AdminModalFormField label={t('builder.modelBehavior')}>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(["balanced", "fast", "careful"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setBuilderForm({ ...builderForm, modelBehavior: value })}
                      className={`rounded-[10px] border px-3 py-3 text-left text-[12px] transition-colors ${
                        builderForm.modelBehavior === value ? "border-brand bg-brand/10 text-foreground" : "border-border-dim bg-foreground/[0.03] text-secondary"
                      }`}
                    >
                      {t(`builder.behavior.${value}`)}
                    </button>
                  ))}
                </div>
              </AdminModalFormField>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-3 rounded-[10px] border border-border-dim bg-foreground/[0.03] px-3 py-3 text-[12px] text-secondary">
                  <input
                    type="checkbox"
                    checked={builderForm.knowledgePlan === "template"}
                    onChange={(e) => setBuilderForm({ ...builderForm, knowledgePlan: e.target.checked ? "template" : "later" })}
                  />
                  {t('builder.useTemplateKnowledge')}
                </label>
                <label className="flex items-center gap-3 rounded-[10px] border border-border-dim bg-foreground/[0.03] px-3 py-3 text-[12px] text-secondary">
                  <input
                    type="checkbox"
                    checked={builderForm.toolPlan === "template"}
                    onChange={(e) => setBuilderForm({ ...builderForm, toolPlan: e.target.checked ? "template" : "later" })}
                  />
                  {t('builder.useTemplateTools')}
                </label>
              </div>
            </div>
          )}

          {currentBuilderStep === "readiness" && (
            <div className="grid gap-3">
              {[
                t('builder.checks.draft'),
                t('builder.checks.eval'),
                t('builder.checks.approvals'),
                selectedTemplate ? t('builder.checks.template', { name: selectedTemplate.name }) : t('builder.checks.blank'),
              ].map((item) => (
                <div key={item} className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-foreground/[0.03] px-3 py-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-brand" />
                  <span className="text-[12px] leading-relaxed text-secondary">{item}</span>
                </div>
              ))}
              <label className="flex items-start gap-3 rounded-[10px] border border-brand/30 bg-brand/10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={builderForm.readinessAcknowledged}
                  onChange={(e) => setBuilderForm({ ...builderForm, readinessAcknowledged: e.target.checked })}
                  className="mt-1"
                />
                <span className="text-[12px] leading-relaxed text-foreground">{t('builder.readinessAck')}</span>
              </label>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setBuilderStepIndex((step) => Math.max(step - 1, 0))}
              disabled={builderStepIndex === 0 || isSubmitting}
              className="inline-flex items-center gap-2 rounded-[8px] border border-border-dim px-4 py-2 text-[13px] text-secondary transition-colors hover:text-foreground disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('builder.back')}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                disabled={isSubmitting}
                className="rounded-[8px] border border-border-dim px-4 py-2 text-[13px] text-secondary transition-colors hover:text-foreground disabled:opacity-40"
              >
                {t('buttons.cancel')}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !canAdvanceBuilder}
                className="inline-flex items-center gap-2 rounded-[8px] bg-foreground px-4 py-2 text-[13px] font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSubmitting
                  ? t('buttons.creating')
                  : builderStepIndex === BUILDER_STEPS.length - 1
                    ? t('buttons.createDraft')
                    : t('builder.next')}
                {builderStepIndex < BUILDER_STEPS.length - 1 && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          </div>

        </form>
      </SonaeModal>

      <AdminConfirmationModal
        isOpen={!!deletingAgent}
        onClose={() => {
          setDeletingAgent(null);
          setSubmitError("");
        }}
        title={t('modal.deleteTitle')}
        cancelLabel={t('buttons.cancel')}
        confirmLabel={isSubmitting ? t('buttons.deleting') : t('buttons.delete')}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
      >
        <p>
          {t('modal.deleteConfirm', { name: deletingAgent?.name ?? "" })}
        </p>
        <p className="text-[13px] text-muted">{t('modal.undone')}</p>
      </AdminConfirmationModal>
    </div>
  );
}
