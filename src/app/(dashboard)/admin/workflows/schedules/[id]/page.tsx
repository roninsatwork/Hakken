"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  Timer,
  CheckCircle2,
  ToggleRight,
  ToggleLeft
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/atoms/Button";
import { useTranslations } from "next-intl";
import ScheduleBuilder from "../_components/ScheduleBuilder";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field } from "@/src/ui/components/screens/Field";
import { InlineSearchInput } from "@/src/ui/components/screens/Table";
import {
  createDefaultScheduleDraft,
  hydrateScheduleDraft,
  serializeScheduleDraft,
  validateScheduleDraft,
  type ScheduleDraft as ScheduleConfigDraft,
} from "../_lib/scheduleConfig";

type PayloadType = "workflow" | "agent";
type WorkflowRow = Doc<"workflows">;
type AgentRow = Doc<"agents">;

type ScheduleDraft = {
  payloadType: PayloadType;
  formData: {
    name: string;
    workflowId: Id<"workflows"> | "";
    agentId: Id<"agents"> | "";
  };
  schedule: ScheduleConfigDraft;
  isActive: boolean;
};

type EditableSchedule = {
  name?: string;
  workflowId?: Id<"workflows">;
  agentId?: Id<"agents">;
  intervalStr?: string;
  isActive?: boolean;
};


const DEFAULT_SCHEDULE_DRAFT: ScheduleDraft = {
  payloadType: "agent",
  formData: {
    name: "",
    workflowId: "",
    agentId: "",
  },
  schedule: createDefaultScheduleDraft(),
  isActive: true,
};

function createScheduleDraft(schedule: EditableSchedule): ScheduleDraft {
  const draft: ScheduleDraft = {
    ...DEFAULT_SCHEDULE_DRAFT,
    payloadType: schedule.agentId ? "agent" : "workflow",
    formData: {
      name: schedule.name || "",
      workflowId: schedule.agentId ? "" : schedule.workflowId || "",
      agentId: schedule.agentId || "",
    },
    isActive: schedule.isActive ?? true,
  };

  draft.schedule = hydrateScheduleDraft(schedule.intervalStr);

  return draft;
}

export default function EditSchedulePage() {
  const router = useRouter();
  const params = useParams();
  const scheduleId = params.id as Id<"schedules">;
  const t = useTranslations('admin.workflows.schedules.editor');
  const tCommon = useTranslations('common');

  const schedule = useQuery(api.scheduler.getSchedule, { scheduleId });
  const workflows = (useQuery(api.workflows.list) || []) as WorkflowRow[];
  const agents = (useQuery(api.agents.list) || []) as AgentRow[];
  const updateSchedule = useMutation(api.scheduler.updateSchedule);

  const [draft, setDraft] = useState<ScheduleDraft | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorModal, setErrorModal] = useState("");

  const form = draft ?? (schedule ? createScheduleDraft(schedule) : DEFAULT_SCHEDULE_DRAFT);

  const updateDraft = (updates: Partial<ScheduleDraft>) => {
    const current = draft ?? (schedule ? createScheduleDraft(schedule) : DEFAULT_SCHEDULE_DRAFT);
    setDraft({ ...current, ...updates });
  };

  const updateFormData = (updates: Partial<ScheduleDraft["formData"]>) => {
    const current = draft ?? (schedule ? createScheduleDraft(schedule) : DEFAULT_SCHEDULE_DRAFT);
    setDraft({ ...current, formData: { ...current.formData, ...updates } });
  };

  const filteredWorkflows = workflows.filter((w) =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (w.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredAgents = agents.filter((a) =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (a.description || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.payloadType === "workflow" && !form.formData.workflowId) {
      setErrorModal(t('errors.noWorkflow'));
      return;
    }
    if (form.payloadType === "agent" && !form.formData.agentId) {
      setErrorModal(t('errors.noWorkflow'));
      return;
    }

    const scheduleError = validateScheduleDraft(form.schedule);
    if (scheduleError) {
      setErrorModal(t(`errors.${scheduleError}`));
      return;
    }

    setIsSubmitting(true);

    try {
      await updateSchedule({
        scheduleId,
        name: form.formData.name,
        workflowId: form.formData.workflowId || undefined,
        agentId: form.formData.agentId || undefined,
        intervalStr: serializeScheduleDraft(form.schedule),
        isActive: form.isActive
      });
      router.push("/admin/workflows/schedules");
    } catch (err: unknown) {
      setErrorModal(getErrorMessage(err, "Failed to edit schedule."));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <DetailHeader
        back={{ label: tCommon('actions.back'), href: "/admin/workflows/schedules" }}
        icon={<Timer className="w-6 h-6 text-brand" />}
        title={t('editTitle')}
        description={t('description')}
        action={
          /* State Toggle in Header */
          <WriteButton
            type="button"
            onClick={() => updateDraft({ isActive: !form.isActive })}
            className={`flex items-center gap-3 group transition-colors ${form.isActive ? "text-[#10b981]" : "text-muted hover:text-foreground"}`}
          >
            <div className="flex flex-col items-end gap-0.5 text-right">
              <span className="text-[12px] font-bold tracking-widest uppercase">{form.isActive ? t('status.armed') : t('status.paused')}</span>
              <span className="text-[10px] text-muted/70 font-medium tracking-wide">{form.isActive ? t('status.armedDesc') : t('status.pausedDesc')}</span>
            </div>
            {form.isActive ? <ToggleRight className="w-9 h-9" /> : <ToggleLeft className="w-9 h-9" />}
          </WriteButton>
        }
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 relative w-full pt-2">

        {/* Core Settings Block */}
        <section className="flex flex-col gap-4">

          <div className="flex flex-col gap-3 ml-1">
            <Field
              label={t('fields.name.label')}
              required
              autoFocus
              value={form.formData.name}
              onChange={e => updateFormData({ name: e.target.value })}
              placeholder={t('fields.name.placeholder')}
            />
          </div>
        </section>

        <div className="w-full h-[1px] bg-border-dim/50 my-1" />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 ml-1">
            <div className="flex items-center gap-4">
              <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase shrink-0 pt-1">
                {t('fields.payload.label')}
              </label>
              
              {/* Segmented Control from Screenshot */}
              <div className="flex items-center p-1 bg-transparent border border-border-dim rounded-[12px] w-fit">
                {/* This pair stays raw: segmented-control halves whose fill swaps with selection — matches no variant. */}
                <button
                  type="button"
                  onClick={() => { updateDraft({ payloadType: "workflow", formData: { ...form.formData, agentId: "" } }); setSearchQuery(""); }}
                  className={`flex items-center gap-2 px-5 py-2 rounded-[8px] text-[13px] font-bold tracking-wide transition-all ${form.payloadType === "workflow" ? 'bg-foreground/10 text-foreground' : 'text-muted hover:text-foreground hover:bg-foreground/5'}`}
                >
                  <Timer className="w-4 h-4" />
                  {t('fields.payload.workflowGraph')}
                </button>
                <button
                  type="button"
                  onClick={() => { updateDraft({ payloadType: "agent", formData: { ...form.formData, workflowId: "" } }); setSearchQuery(""); }}
                  className={`flex items-center gap-2 px-5 py-2 rounded-[8px] text-[13px] font-bold tracking-wide transition-all ${form.payloadType === "agent" ? 'bg-foreground/10 text-foreground' : 'text-muted hover:text-foreground hover:bg-foreground/5'}`}
                >
                  <span className="w-4 h-4 flex items-center justify-center font-bold text-[14px]">🤖</span>
                  {t('fields.payload.autonomousAgent')}
                </button>
              </div>
            </div>

            {/* Workflow Mode */}
            {form.payloadType === "workflow" && (
              form.formData.workflowId ? (
                // Selected State
                <div className="flex items-center justify-between p-4 rounded-[12px] bg-brand/10 border border-brand/30 shadow-inner group transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] font-bold text-brand flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {workflows.find((w) => w._id === form.formData.workflowId)?.name}
                    </span>
                    <span className="text-[12px] text-brand/70 font-medium tracking-wide">{t('fields.workflow.selectedDesc')}</span>
                  </div>
                  <WriteButton
                    type="button"
                    onClick={() => updateFormData({ workflowId: "" })}
                    className="px-4 py-2 rounded-[8px] bg-brand/20 text-brand text-[11px] font-bold tracking-widest uppercase hover:bg-brand hover:text-white transition-all"
                  >
                    {t('fields.workflow.change')}
                  </WriteButton>
                </div>
              ) : (
                // Search & Select State
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-transparent border border-border-dim rounded-[10px] focus-within:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30">
                    <InlineSearchInput
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder={t('fields.workflow.searchPlaceholder')}
                    />
                  </div>

                  <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto custom-scrollbar p-1 border border-border-dim/30 rounded-[12px] bg-sidebar/10">
                    {filteredWorkflows.map((w) => (
                      <div
                        key={w._id}
                        onClick={() => { updateFormData({ workflowId: w._id }); setSearchQuery(""); }}
                        className="px-4 py-2 bg-transparent hover:bg-foreground/5 cursor-pointer rounded-[8px] flex flex-col gap-0.5 transition-colors border border-transparent hover:border-border-dim/50"
                      >
                        <span className="text-[14px] font-semibold text-foreground">{w.name}</span>
                        <span className="text-[12px] text-muted line-clamp-1">{w.description || t('fields.workflow.noDescription')}</span>
                      </div>
                    ))}
                    {filteredWorkflows.length === 0 && (
                      <div className="py-6 text-center text-muted text-[13px]">
                        {t('fields.workflow.noWorkflows')}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

            {/* Agent Mode */}
            {form.payloadType === "agent" && (
              form.formData.agentId ? (
                // Selected Agent State (matching screenshot style)
                <div className="flex items-center justify-between p-4 rounded-[12px] bg-[#d97736]/10 border border-[#d97736]/30 shadow-inner group transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] font-bold text-[#d97736] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {agents.find((a) => a._id === form.formData.agentId)?.name}
                    </span>
                    <span className="text-[12px] text-[#d97736]/70 font-medium tracking-wide">{t('fields.agent.selectedDesc')}</span>
                  </div>
                  <WriteButton
                    type="button"
                    onClick={() => updateFormData({ agentId: "" })}
                    className="px-4 py-2 rounded-[8px] bg-[#d97736]/20 text-[#d97736] text-[11px] font-bold tracking-widest uppercase hover:bg-[#d97736] hover:text-white transition-all"
                  >
                    {t('fields.agent.change')}
                  </WriteButton>
                </div>
              ) : (
                // Search & Select Agent State
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-transparent border border-border-dim rounded-[10px] focus-within:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30">
                    <InlineSearchInput
                      value={searchQuery}
                      onChange={setSearchQuery}
                      placeholder={t('fields.agent.searchPlaceholder')}
                    />
                  </div>

                  <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto custom-scrollbar p-1 border border-border-dim/30 rounded-[12px] bg-sidebar/10">
                    {filteredAgents.map((a) => (
                      <div
                        key={a._id}
                        onClick={() => { updateFormData({ agentId: a._id }); setSearchQuery(""); }}
                        className="px-4 py-2 bg-transparent hover:bg-foreground/5 cursor-pointer rounded-[8px] flex flex-col gap-0.5 transition-colors border border-transparent hover:border-border-dim/50"
                      >
                        <span className="text-[14px] font-semibold text-foreground">{a.name}</span>
                        <span className="text-[12px] text-muted line-clamp-1">{a.description || t('fields.agent.noDescription')}</span>
                      </div>
                    ))}
                    {filteredAgents.length === 0 && (
                      <div className="py-6 text-center text-muted text-[13px]">
                        {t('fields.agent.noAgents')}
                      </div>
                    )}
                  </div>
                </div>
              )
            )}

          </div>
        </section>

        <div className="w-full h-[1px] bg-border-dim/50 my-1" />

        <section className="ml-1">
          <ScheduleBuilder
            draft={form.schedule}
            onChange={(schedule) => updateDraft({ schedule })}
            targetKind={form.payloadType}
          />
        </section>

        {/* Action Belt */}
        <div className="flex items-center justify-end pt-4 border-t border-border-dim mt-2">
          <div className="flex items-center">
            <Button
              variant="ghost"
              onClick={() => router.push("/admin/workflows/schedules")}
              className="rounded-full font-bold tracking-wide mr-3 hover:bg-transparent"
              disabled={isSubmitting}
            >
              {t('actions.cancel')}
            </Button>
            <WriteButton
              type="submit"
              disabled={isSubmitting || (form.payloadType === "workflow" ? !form.formData.workflowId : !form.formData.agentId) || !form.formData.name}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
            >
              {isSubmitting ? t('actions.saving') : t('actions.save')}
              {!isSubmitting && <CheckCircle2 className="w-4 h-4" />}
            </WriteButton>
          </div>
        </div>

      </form>

      {/* Error Modal */}
      <SonaeModal
        isOpen={!!errorModal}
        onClose={() => setErrorModal("")}
        title={t('errors.configError')}
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>{errorModal}</p>
        </div>
        <div className="flex justify-end mt-8 pt-6 border-t border-border-dim">
          {/* Stays raw: a dismiss that floods solid red on hover — destructive keeps its tint, so no variant matches. */}
          <button
            type="button"
            onClick={() => setErrorModal("")}
            className="px-8 py-3 rounded-[10px] bg-red-500/10 text-red-500 transition-all text-sm font-bold tracking-widest uppercase hover:bg-red-500 hover:text-white"
          >
            {tCommon('actions.dismiss')}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
