"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import {
  Timer,
  Plus,
  Search,
  Trash2,
  CheckCircle2,
  XCircle,
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

export default function SchedulesPage() {
  const router = useRouter();
  const t = useTranslations('admin.workflows.schedules');
  const tCommon = useTranslations('common');

  const schedules = useQuery((api as any).scheduler.getSchedules) || [];
  const workflows = useQuery((api as any).workflows.list) || [];

  const createSchedule = useMutation((api as any).scheduler.createSchedule);
  const deleteSchedule = useMutation((api as any).scheduler.deleteSchedule);
  const toggleSchedule = useMutation((api as any).scheduler.toggleSchedule);
  const manualRunWorkflow = useMutation((api as any).scheduler.manualRunWorkflow);

  const [searchTerm, setSearchTerm] = useState("");
  const [deletingSchedule, setDeletingSchedule] = useState<any | null>(null);
  const [messageModal, setMessageModal] = useState<{ title: string; body: string } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const filteredSchedules = schedules.filter((s: any) =>
    (s.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.workflowName || "").toLowerCase().includes(searchTerm.toLowerCase())
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
      } catch (err: any) {
        setMessageModal({ title: t('modals.error.deleteFailed'), body: err.message || tCommon('errors.default') });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleManualRun = async (workflowId: string, e: any) => {
    e.stopPropagation();
    try {
      await manualRunWorkflow({ workflowId: workflowId as any });
      setMessageModal({ title: t('modals.execution.title'), body: t('modals.execution.body') });
    } catch (e: any) {
      setMessageModal({ title: t('modals.error.executionFailed'), body: e.message || tCommon('errors.default') });
    }
  };

  const handleToggle = async (scheduleId: string, current: boolean, e: any) => {
    e.stopPropagation();
    try {
      await toggleSchedule({ scheduleId: scheduleId as any, isActive: !current });
    } catch (e: any) {
      setMessageModal({ title: t('modals.error.statusFailed'), body: e.message || tCommon('errors.default') });
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Timer className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t('description')}</p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{t('newSchedule')}</span>
        </button>
      </div>

      <div className="flex items-center gap-4 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl">
        <div className="flex-1 flex items-center gap-3 px-3 py-2 bg-background border border-border-dim rounded-[10px] text-secondary focus-within:text-foreground focus-within:border-brand/50 transition-all">
          <Search className="w-[18px] h-[18px]" />
          <input
            type="text"
            placeholder={t('searchPlaceholder')}
            value={searchTerm}
            onChange={e => handleSearch(e.target.value)}
            className="bg-transparent border-none outline-none w-full text-[14px] placeholder:text-muted"
          />
        </div>
      </div>

      <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl overflow-hidden shadow-sm flex-1 flex flex-col">
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
                    {paginatedSchedules.map((schedule: any) => (
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
                          <span className="truncate text-[13px] text-foreground/80 font-medium">
                            {schedule.workflowName}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-foreground/5 border border-border-dim w-fit">
                            <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
                              {schedule.intervalStr}
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

                            <button onClick={(e) => handleManualRun(schedule.workflowId, e)} className="p-2 rounded-full hover:bg-brand/10 text-secondary hover:text-brand transition-colors" title={t('actions.forceRun')}>
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



      <SonaeModal
        isOpen={!!deletingSchedule}
        onClose={() => setDeletingSchedule(null)}
        title={t('modals.delete.title')}
      >
        <div className="text-secondary mb-6 text-[15px] leading-relaxed flex flex-col gap-4">
          <p>
            {t('modals.delete.confirm', { name: deletingSchedule?.name })}
          </p>
        </div>
        <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-border-dim">
          <button
            type="button"
            onClick={() => setDeletingSchedule(null)}
            className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
            disabled={isSubmitting}
          >
            {t('modals.delete.cancel')}
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={isSubmitting}
            className="px-5 py-2.5 rounded-[10px] bg-red-500/90 text-white hover:bg-red-500 transition-all text-sm font-medium shadow-lg shadow-red-500/20 disabled:opacity-50"
          >
            {isSubmitting ? t('modals.delete.submitting') : t('modals.delete.submit')}
          </button>
        </div>
      </SonaeModal>

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
