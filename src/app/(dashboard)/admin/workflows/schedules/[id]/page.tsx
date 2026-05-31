"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
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

type PayloadType = "workflow" | "agent";
type Frequency = "hourly" | "daily" | "weekly" | "monthly";
type WorkflowRow = Doc<"workflows">;
type AgentRow = Doc<"agents">;

type ScheduleDraft = {
  payloadType: PayloadType;
  formData: {
    name: string;
    workflowId: Id<"workflows"> | "";
    agentId: Id<"agents"> | "";
  };
  frequency: Frequency;
  hourlyInterval: string;
  timeOfDay: string;
  dayOfWeek: string;
  dayOfMonth: string;
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
  frequency: "hourly",
  hourlyInterval: "1",
  timeOfDay: "09:00",
  dayOfWeek: "Monday",
  dayOfMonth: "1",
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

  const intervalStr = (schedule.intervalStr || "").toLowerCase();
  if (intervalStr.startsWith("every") && intervalStr.includes("hours")) {
    draft.frequency = "hourly";
    const hoursMatch = intervalStr.match(/every (\d+) hours/i);
    if (hoursMatch) draft.hourlyInterval = hoursMatch[1];
  } else if (intervalStr === "hourly") {
    draft.frequency = "hourly";
    draft.hourlyInterval = "1";
  } else if (intervalStr.startsWith("daily")) {
    draft.frequency = "daily";
    const timeParts = intervalStr.split(" at ");
    if (timeParts.length === 2) draft.timeOfDay = timeParts[1];
  } else if (intervalStr.startsWith("every") && intervalStr.includes("at")) {
    draft.frequency = "weekly";
    const dayMatch = intervalStr.match(/every ([a-z]+) at/i);
    if (dayMatch && dayMatch[1]) draft.dayOfWeek = dayMatch[1].charAt(0).toUpperCase() + dayMatch[1].slice(1);
    const timeParts = intervalStr.split(" at ");
    if (timeParts.length === 2) draft.timeOfDay = timeParts[1];
  } else if (intervalStr.startsWith("monthly") || intervalStr.startsWith("on day")) {
    draft.frequency = "monthly";
    const dayMatch = intervalStr.match(/day (\d+) of/i);
    if (dayMatch && dayMatch[1]) draft.dayOfMonth = dayMatch[1];
    const timeParts = intervalStr.split(" at ");
    if (timeParts.length === 2) draft.timeOfDay = timeParts[1];
  }

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

    setIsSubmitting(true);

    // Construct human-readable interval string
    let constructedInterval = t('intervals.hourly', { hours: form.hourlyInterval });
    if (form.frequency === "hourly" && form.hourlyInterval === "1") constructedInterval = t('intervals.hourlySingle');
    if (form.frequency === "daily") constructedInterval = t('intervals.daily', { time: form.timeOfDay });
    if (form.frequency === "weekly") constructedInterval = t('intervals.weekly', { day: t(`fields.interval.days.${form.dayOfWeek.toLowerCase()}`), time: form.timeOfDay });
    if (form.frequency === "monthly") constructedInterval = t('intervals.monthly', { day: form.dayOfMonth, time: form.timeOfDay });

    try {
      await updateSchedule({
        scheduleId,
        name: form.formData.name,
        workflowId: form.formData.workflowId || undefined,
        agentId: form.formData.agentId || undefined,
        intervalStr: constructedInterval,
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
              {t('editTitle')}
            </h1>
            <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
          </div>
        </div>

        {/* State Toggle in Header */}
        <button
          type="button"
          onClick={() => updateDraft({ isActive: !form.isActive })}
          className={`flex items-center gap-3 group transition-colors ${form.isActive ? "text-[#10b981]" : "text-muted hover:text-foreground"}`}
        >
          <div className="flex flex-col items-end gap-0.5 text-right">
            <span className="text-[12px] font-bold tracking-widest uppercase">{form.isActive ? t('status.armed') : t('status.paused')}</span>
            <span className="text-[10px] text-muted/70 font-medium tracking-wide">{form.isActive ? t('status.armedDesc') : t('status.pausedDesc')}</span>
          </div>
          {form.isActive ? <ToggleRight className="w-9 h-9" /> : <ToggleLeft className="w-9 h-9" />}
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
              value={form.formData.name}
              onChange={e => updateFormData({ name: e.target.value })}
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
                  <button
                    type="button"
                    onClick={() => updateFormData({ workflowId: "" })}
                    className="px-4 py-2 rounded-[8px] bg-brand/20 text-brand text-[11px] font-bold tracking-widest uppercase hover:bg-brand hover:text-white transition-all"
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
                  <button
                    type="button"
                    onClick={() => updateFormData({ agentId: "" })}
                    className="px-4 py-2 rounded-[8px] bg-[#d97736]/20 text-[#d97736] text-[11px] font-bold tracking-widest uppercase hover:bg-[#d97736] hover:text-white transition-all"
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

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-6 ml-1">

            {/* Dynamic Inputs Based on Frequency */}
            <div className="flex items-end gap-4 flex-wrap">

              {/* Frequency Selector */}
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t('fields.interval.label')}</label>
                <div className="flex bg-transparent rounded-[12px] p-1 border border-border-dim w-fit">
                  {[
                    { id: "hourly", label: t('fields.interval.hourly') },
                    { id: "daily", label: t('fields.interval.daily') },
                    { id: "weekly", label: t('fields.interval.weekly') },
                    { id: "monthly", label: t('fields.interval.monthly') },
                  ].map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => updateDraft({ frequency: f.id as Frequency })}
                      className={`px-6 py-2 rounded-[8px] text-[12px] font-bold tracking-wide transition-all ${form.frequency === f.id ? 'bg-foreground/10 text-foreground' : 'text-muted hover:bg-foreground/5'}`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {form.frequency === "hourly" && (
                <div className="flex flex-col gap-2 w-[200px]">
                  <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase flex items-center justify-between">
                    {t('fields.interval.everyXHours')}
                  </label>
                  <select
                    value={form.hourlyInterval} onChange={e => updateDraft({ hourlyInterval: e.target.value })}
                    className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30 font-mono appearance-none"
                    style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="none" stroke="gray" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9"></polyline></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                  >
                    {Array.from({ length: 24 }, (_, i) => i + 1).map(h => (
                      <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.frequency === "weekly" && (
                <div className="flex flex-col gap-2 w-[200px]">
                  <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t('fields.interval.dayOfWeek')}</label>
                  <select
                    value={form.dayOfWeek} onChange={e => updateDraft({ dayOfWeek: e.target.value })}
                    className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30 appearance-none"
                    style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="none" stroke="gray" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9"></polyline></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                  >
                    {["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map(d => (
                      <option key={d} value={d}>{t(`fields.interval.days.${d.toLowerCase()}`)}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.frequency === "monthly" && (
                <div className="flex flex-col gap-2 w-[200px]">
                  <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t('fields.interval.dayOfMonth')}</label>
                  <select
                    value={form.dayOfMonth} onChange={e => updateDraft({ dayOfMonth: e.target.value })}
                    className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30 flex-shrink-0 appearance-none"
                    style={{ backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="none" stroke="gray" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="6 9 12 15 18 9"></polyline></svg>')`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1rem' }}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}

              {form.frequency !== "hourly" && (
                <div className="flex flex-col gap-2 w-[200px]">
                  <label className="text-[10px] font-mono tracking-[0.2em] text-muted uppercase">{t('fields.interval.timeLabel')}</label>
                  <input
                    type="time"
                    value={form.timeOfDay} onChange={e => updateDraft({ timeOfDay: e.target.value })}
                    className="w-full bg-transparent border border-border-dim rounded-[10px] px-4 py-2.5 text-[13px] text-foreground outline-none focus:border-brand/40 transition-colors shadow-sm dark:bg-[#111111]/30 font-mono"
                  />
                </div>
              )}

            </div>
          </div>
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
            <button
              type="submit"
              disabled={isSubmitting || (form.payloadType === "workflow" ? !form.formData.workflowId : !form.formData.agentId) || !form.formData.name}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]"
            >
              {isSubmitting ? t('actions.saving') : t('actions.save')}
              {!isSubmitting && <CheckCircle2 className="w-4 h-4" />}
            </button>
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
