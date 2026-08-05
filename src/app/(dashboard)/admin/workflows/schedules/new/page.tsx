"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ArrowLeft,
  Timer,
  Search,
  CheckCircle2,
  ToggleRight,
  ToggleLeft
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useTranslations } from "next-intl";
import ScheduleBuilder from "../_components/ScheduleBuilder";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import {
  createDefaultScheduleDraft,
  serializeScheduleDraft,
  validateScheduleDraft,
} from "../_lib/scheduleConfig";

type PayloadType = "workflow" | "agent";
type WorkflowRow = Doc<"workflows">;
type AgentRow = Doc<"agents">;

type ScheduleFormData = {
  name: string;
  workflowId: Id<"workflows"> | "";
  agentId: Id<"agents"> | "";
};

export default function NewSchedulePage() {
  const router = useRouter();
  const t = useTranslations('admin.workflows.schedules.editor');
  const tCommon = useTranslations('common');

  const workflows = (useQuery(api.workflows.list) || []) as WorkflowRow[];
  const agents = (useQuery(api.agents.list) || []) as AgentRow[];
  const createSchedule = useMutation(api.scheduler.createSchedule);

  const [payloadType, setPayloadType] = useState<PayloadType>("agent"); // matched screenshot
  
  const [formData, setFormData] = useState<ScheduleFormData>({
    name: "",
    workflowId: "",
    agentId: "",
  });

  const [scheduleDraft, setScheduleDraft] = useState(() => createDefaultScheduleDraft());

  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [errorModal, setErrorModal] = useState("");

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
    if (payloadType === "workflow" && !formData.workflowId) {
      setErrorModal(t('errors.noWorkflow'));
      return;
    }
    if (payloadType === "agent" && !formData.agentId) {
      setErrorModal(t('errors.noWorkflow')); // Maps to generic no payload text
      return;
    }

    const scheduleError = validateScheduleDraft(scheduleDraft);
    if (scheduleError) {
      setErrorModal(t(`errors.${scheduleError}`));
      return;
    }

    setIsSubmitting(true);

    try {
      await createSchedule({
        name: formData.name,
        workflowId: formData.workflowId || undefined,
        agentId: formData.agentId || undefined,
        intervalStr: serializeScheduleDraft(scheduleDraft),
        isActive
      });
      router.push("/admin/workflows/schedules");
    } catch (err: unknown) {
      setErrorModal(getErrorMessage(err, "Failed to create schedule."));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin/workflows/schedules")}
            className="w-10 h-10 rounded-full bg-sidebar/50 border border-border-dim flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
              <Timer className="w-6 h-6 text-brand" />
              {t('createTitle')}
            </h1>
            <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
          </div>
        </div>

        {/* State Toggle in Header */}
        <button
          type="button"
          onClick={() => setIsActive(!isActive)}
          className={`flex items-center gap-3 group transition-colors ${isActive ? "text-[#10b981]" : "text-muted hover:text-foreground"}`}
        >
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="text-[12px] font-bold tracking-widest uppercase">{isActive ? t('status.armed') : t('status.paused')}</span>
            <span className="text-[10px] text-muted/70 font-medium tracking-wide">{isActive ? t('status.armedDesc') : t('status.pausedDesc')}</span>
          </div>
          {isActive ? <ToggleRight className="w-9 h-9" /> : <ToggleLeft className="w-9 h-9" />}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 flex-1 relative w-full pt-2">

        {/* Core Settings Block */}
        <section className="flex flex-col gap-4">

          <div className="flex flex-col gap-3 ml-1">
            <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t('fields.name.label')}</label>
            <input
              type="text"
              required
              autoFocus
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder={t('fields.name.placeholder')}
              className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30 font-medium tracking-wide"
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
                <button
                  type="button"
                  onClick={() => { setPayloadType("workflow"); setFormData(p => ({ ...p, agentId: "" })); setSearchQuery(""); }}
                  className={`flex items-center gap-2 px-5 py-2 rounded-[8px] text-[13px] font-bold tracking-wide transition-all ${payloadType === "workflow" ? 'bg-foreground/10 text-foreground' : 'text-muted hover:text-foreground hover:bg-foreground/5'}`}
                >
                  <Timer className="w-4 h-4" />
                  {t('fields.payload.workflowGraph')}
                </button>
                <button
                  type="button"
                  onClick={() => { setPayloadType("agent"); setFormData(p => ({ ...p, workflowId: "" })); setSearchQuery(""); }}
                  className={`flex items-center gap-2 px-5 py-2 rounded-[8px] text-[13px] font-bold tracking-wide transition-all ${payloadType === "agent" ? 'bg-foreground/10 text-foreground' : 'text-muted hover:text-foreground hover:bg-foreground/5'}`}
                >
                  <span className="w-4 h-4 flex items-center justify-center font-bold text-[14px]">🤖</span>
                  {t('fields.payload.autonomousAgent')}
                </button>
              </div>
            </div>

            {/* Workflow Mode */}
            {payloadType === "workflow" && (
              formData.workflowId ? (
                // Selected State
                <div className="flex items-center justify-between p-4 rounded-[12px] bg-sidebar/50 border border-border-dim shadow-inner group transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] font-bold text-foreground flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {workflows.find((w) => w._id === formData.workflowId)?.name}
                    </span>
                    <span className="text-[12px] text-muted font-medium tracking-wide">{t('fields.workflow.selectedDesc')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, workflowId: "" })}
                    className="px-4 py-2 rounded-[8px] bg-foreground/10 text-foreground text-[11px] font-bold tracking-widest uppercase hover:bg-foreground hover:text-background transition-all"
                  >
                    {t('fields.workflow.change')}
                  </button>
                </div>
              ) : (
                // Search & Select State
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-transparent border border-border-dim rounded-[10px] focus-within:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30">
                    <Search className="w-5 h-5 text-muted" />
                    <input
                      type="text"
                      placeholder={t('fields.workflow.searchPlaceholder')}
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-[14px] text-foreground placeholder:text-muted"
                    />
                  </div>

                  <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto custom-scrollbar p-1 border border-border-dim/30 rounded-[12px] bg-sidebar/10">
                    {filteredWorkflows.map((w) => (
                      <div
                        key={w._id}
                        onClick={() => { setFormData({ ...formData, workflowId: w._id }); setSearchQuery(""); }}
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
            {payloadType === "agent" && (
              formData.agentId ? (
                // Selected Agent State (matching screenshot style)
                <div className="flex items-center justify-between p-4 rounded-[12px] bg-sidebar/50 border border-border-dim shadow-inner group transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] font-bold text-foreground flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" />
                      {agents.find((a) => a._id === formData.agentId)?.name}
                    </span>
                    <span className="text-[12px] text-muted font-medium tracking-wide">{t('fields.agent.selectedDesc')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, agentId: "" })}
                    className="px-4 py-2 rounded-[8px] bg-foreground/10 text-foreground text-[11px] font-bold tracking-widest uppercase hover:bg-foreground hover:text-background transition-all"
                  >
                    {t('fields.agent.change')}
                  </button>
                </div>
              ) : (
                // Search & Select Agent State
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 px-4 py-2.5 bg-transparent border border-border-dim rounded-[10px] focus-within:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30">
                    <Search className="w-5 h-5 text-muted" />
                    <input
                      type="text"
                      placeholder={t('fields.agent.searchPlaceholder')}
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="bg-transparent border-none outline-none w-full text-[14px] text-foreground placeholder:text-muted"
                    />
                  </div>

                  <div className="flex flex-col gap-1 max-h-[220px] overflow-y-auto custom-scrollbar p-1 border border-border-dim/30 rounded-[12px] bg-sidebar/10">
                    {filteredAgents.map((a) => (
                      <div
                        key={a._id}
                        onClick={() => { setFormData({ ...formData, agentId: a._id }); setSearchQuery(""); }}
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
            draft={scheduleDraft}
            onChange={setScheduleDraft}
            targetKind={payloadType}
          />
        </section>

        {/* Action Belt */}
        <div className="flex items-center justify-end pt-4 border-t border-border-dim mt-2">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => router.push("/admin/workflows/schedules")}
              className="px-5 py-2.5 rounded-full text-secondary hover:text-foreground transition-all text-[13px] font-bold tracking-wide mr-3"
              disabled={isSubmitting}
            >
              {t('actions.cancel')}
            </button>
            <AdminWriteButton
              type="submit"
              disabled={isSubmitting || (payloadType === "workflow" ? !formData.workflowId : !formData.agentId) || !formData.name}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
            >
              {isSubmitting ? t('actions.deploying') : t('actions.deploy')}
              {!isSubmitting && <Timer className="w-4 h-4" />}
            </AdminWriteButton>
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
