"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import type { MouseEvent } from "react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  Timer,
  Plus,
  Search,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ChevronLeft,
  ChevronRight,
  Play
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AdminConfirmationModal } from "@/src/app/(dashboard)/admin/_components/AdminConfirmationModal";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import {
  formatUtcPreview,
  getPrimaryScheduleTime,
  hydrateScheduleDraft,
  normalizeTimes,
} from "./_lib/scheduleConfig";

type ScheduleRow = Doc<"schedules"> & {
  workflowName?: string;
  agentName?: string;
  targetName?: string;
};


export default function SchedulesPage() {
  const router = useRouter();
  const t = useTranslations('admin.workflows.schedules');
  const tCommon = useTranslations('common');

  const schedules = (useQuery(api.scheduler.getSchedules) || []) as ScheduleRow[];

  const deleteSchedule = useMutation(api.scheduler.deleteSchedule);
  const toggleSchedule = useMutation(api.scheduler.toggleSchedule);
  const manualRunSchedule = useMutation(api.scheduler.manualRunSchedule);

  const [searchTerm, setSearchTerm] = useState("");
  const [deletingSchedule, setDeletingSchedule] = useState<ScheduleRow | null>(null);
  const [messageModal, setMessageModal] = useState<{ title: string; body: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = ADMIN_PAGE_SIZE;

  const filteredSchedules = schedules.filter((s) =>
    (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.workflowName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.agentName || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.targetName || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalItems = filteredSchedules.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const paginatedSchedules = filteredSchedules.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const handleSearch = (v: string) => {
    setSearchTerm(v);
    setCurrentPage(1);
  };

  const handleOpenAdd = () => {
    router.push("/admin/workflows/schedules/new");
  };

  const confirmDelete = async () => {
    if (deletingSchedule) {
      setIsSubmitting(true);
      try {
        await deleteSchedule({ scheduleId: deletingSchedule._id });
        setDeletingSchedule(null);
      } catch (err: unknown) {
        setMessageModal({ title: t('modals.error.deleteFailed'), body: getErrorMessage(err, tCommon('errors.default')) });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleManualRun = async (
    target: { workflowId?: Id<"workflows">; agentId?: Id<"agents"> },
    e: MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    try {
      await manualRunSchedule(target);
      setMessageModal({ title: t('modals.execution.title'), body: t('modals.execution.body') });
    } catch (e: unknown) {
      setMessageModal({ title: t('modals.error.executionFailed'), body: getErrorMessage(e, tCommon('errors.default')) });
    }
  };

  const handleToggle = async (scheduleId: Id<"schedules">, current: boolean, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    try {
      await toggleSchedule({ scheduleId, isActive: !current });
    } catch (e: unknown) {
      setMessageModal({ title: t('modals.error.statusFailed'), body: getErrorMessage(e, tCommon('errors.default')) });
    }
  };

  const formatScheduleInterval = (intervalStr: string) => {
    const draft = hydrateScheduleDraft(intervalStr);
    if (draft.mode === "targetedTimes") {
      const times = normalizeTimes(draft.timesLocal);
      return times.length > 0
        ? t("scheduleSummary.targeted", { times: times.join(", ") })
        : t("scheduleSummary.targetedEmpty");
    }

    const utcTime = formatUtcPreview(getPrimaryScheduleTime(draft));
    if (draft.cadence === "hourly") {
      return t("scheduleSummary.hourly", {
        hours: String(draft.everyHours),
        time: draft.startTimeLocal,
        utcTime,
      });
    }
    if (draft.cadence === "weekly") {
      return t("scheduleSummary.weekly", {
        day: t(`editor.fields.interval.days.${["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][draft.dayOfWeek] ?? "monday"}`),
        time: draft.timeLocal,
        utcTime,
      });
    }
    if (draft.cadence === "monthly") {
      return t("scheduleSummary.monthly", {
        day: String(draft.dayOfMonth),
        time: draft.timeLocal,
        utcTime,
      });
    }
    return t("scheduleSummary.daily", {
      time: draft.timeLocal,
      utcTime,
    });
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Timer className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
          <div className="flex-1 sm:w-[250px] flex items-center gap-2 px-3 py-2 bg-sidebar/50 border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all shadow-sm">
            <Search className="w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder={t('searchPlaceholder')}
              value={searchTerm}
              onChange={e => handleSearch(e.target.value)}
              className="bg-transparent border-none outline-none w-full text-[13px] placeholder:text-muted"
            />
          </div>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{t('newSchedule')}</span>
          </button>
        </div>
      </div>

      <div className="bg-sidebar/40 border border-border-dim rounded-[16px] backdrop-blur-xl overflow-hidden shadow-sm flex-1 flex flex-col w-full">
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-medium">{t('table.details')}</th>
                <th className="px-4 py-3 font-medium">{t('table.workflow')}</th>
                <th className="px-4 py-3 font-medium">{t('table.interval')}</th>
                <th className="px-4 py-3 font-medium">{t('table.status')}</th>
                <th className="px-4 py-3 font-medium text-right">{t('table.actions')}</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {paginatedSchedules.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-secondary">
                      {t('table.noSchedules')}
                    </td>
                  </tr>
                ) : (
                  <>
                    {paginatedSchedules.map((schedule) => (
                      <motion.tr
                        key={schedule._id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        onClick={() => router.push(`/admin/workflows/schedules/${schedule._id}`)}
                        className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-[8px] bg-card border border-border-dim flex items-center justify-center text-foreground">
                              <Timer className="w-4 h-4 text-brand" />
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-[13px] text-foreground leading-tight">
                                {schedule.name}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-[13px] text-foreground/80 font-medium">
                              {schedule.targetName || schedule.workflowName || schedule.agentName}
                            </span>
                            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-border-dim/50 text-muted">
                              {schedule.agentId ? 'Agent' : 'Workflow'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-foreground/5 border border-border-dim w-fit">
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                              {formatScheduleInterval(schedule.intervalStr)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={(e) => handleToggle(schedule._id, schedule.isActive, e)}
                            className={`transition-colors flex-shrink-0 flex items-center gap-2 ${schedule.isActive ? "text-[#10B981]" : "text-border-dim"}`}
                          >
                            {schedule.isActive ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                            <span className="text-[12px] uppercase tracking-wider font-semibold text-foreground/50">{schedule.isActive ? t('status.armed') : t('status.paused')}</span>
                          </button>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">

                            <button
                              onClick={(e) => handleManualRun({ workflowId: schedule.workflowId, agentId: schedule.agentId }, e)}
                              className="p-2 rounded-full hover:bg-brand/10 text-secondary hover:text-brand transition-colors"
                              title={t('actions.forceRun')}
                            >
                              <Play className="w-4 h-4 fill-current" />
                            </button>

                            <button onClick={(e) => { e.stopPropagation(); setDeletingSchedule(schedule); }} className="p-2 rounded-full hover:bg-red-500/10 text-secondary hover:text-red-500 transition-colors" title={t('actions.delete')}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </>
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border-dim bg-sidebar/50">
            <div className="flex items-center gap-2 text-[12px] text-muted">
              <span>{tCommon('pagination.showing')}</span>
              <span className="font-medium text-foreground">{Math.min((currentPage - 1) * itemsPerPage + 1, totalItems)}</span>
              <span>{tCommon('pagination.to')}</span>
              <span className="font-medium text-foreground">{Math.min(currentPage * itemsPerPage, totalItems)}</span>
              <span>{tCommon('pagination.of')}</span>
              <span className="font-medium text-foreground">{totalItems}</span>
              <span>{tCommon('pagination.items')}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>



      <AdminConfirmationModal
        isOpen={!!deletingSchedule}
        onClose={() => setDeletingSchedule(null)}
        title={t('modals.delete.title')}
        cancelLabel={t('modals.delete.cancel')}
        confirmLabel={isSubmitting ? t('modals.delete.submitting') : t('modals.delete.submit')}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
      >
        <p>
          {t('modals.delete.confirm', { name: deletingSchedule?.name ?? "" })}
        </p>
      </AdminConfirmationModal>

      {/* Generic Message Modal */}
      <SonaeModal
        isOpen={!!messageModal}
        onClose={() => setMessageModal(null)}
        title={messageModal?.title || ""}
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>{messageModal?.body}</p>
        </div>
        <div className="flex justify-end mt-8 pt-6 border-t border-border-dim">
          <button
            type="button"
            onClick={() => setMessageModal(null)}
            className="px-8 py-3 rounded-[10px] bg-foreground text-background transition-all text-sm font-bold tracking-widest uppercase hover:opacity-90"
          >
            {t('modals.error.dismiss')}
          </button>
        </div>
      </SonaeModal>
    </div>
  );
}
