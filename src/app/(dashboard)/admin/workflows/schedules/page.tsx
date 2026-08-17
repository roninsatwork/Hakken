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
  Trash2,
  ToggleLeft,
  ToggleRight,
  Play
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
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
  const itemsPerPage = TABLE_PAGE_SIZE;

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

  const columns: DataTableColumn<ScheduleRow>[] = [
    {
      key: "details",
      header: t('table.details'),
      cell: (schedule) => (
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[8px] bg-card border border-border-dim flex items-center justify-center text-foreground">
            <Timer className="w-4 h-4 text-brand" />
          </div>
          <div className="flex flex-col">
            <span className="font-medium text-[13px] text-foreground leading-tight">{schedule.name}</span>
          </div>
        </div>
      ),
    },
    {
      key: "workflow",
      header: t('table.workflow'),
      cell: (schedule) => (
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] text-foreground/80 font-medium">
            {schedule.targetName || schedule.workflowName || schedule.agentName}
          </span>
          <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-border-dim/50 text-muted">
            {schedule.agentId ? 'Agent' : 'Workflow'}
          </span>
        </div>
      ),
    },
    {
      key: "interval",
      header: t('table.interval'),
      cell: (schedule) => (
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] bg-foreground/5 border border-border-dim w-fit">
          <span className="text-[10px] font-mono tracking-widest text-foreground/80 uppercase">
            {formatScheduleInterval(schedule.intervalStr)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: t('table.status'),
      cell: (schedule) => (
        <button
          onClick={(e) => handleToggle(schedule._id, schedule.isActive, e)}
          className={`transition-colors flex-shrink-0 flex items-center gap-2 ${schedule.isActive ? "text-[#10B981]" : "text-border-dim"}`}
        >
          {schedule.isActive ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
          <span className="text-[12px] uppercase tracking-wider font-semibold text-foreground/50">
            {schedule.isActive ? t('status.armed') : t('status.paused')}
          </span>
        </button>
      ),
    },
    {
      key: "actions",
      header: t('table.actions'),
      align: "right",
      cell: (schedule) => (
        <RowActions>
          <RowIconButton
            label={t('actions.forceRun')}
            onClick={() =>
              handleManualRun(
                { workflowId: schedule.workflowId, agentId: schedule.agentId },
                { stopPropagation: () => {} } as MouseEvent<HTMLButtonElement>
              )
            }
          >
            <Play className="w-4 h-4 fill-current" />
          </RowIconButton>
          <RowIconButton
            label={t('actions.delete')}
            tone="danger"
            onClick={() => setDeletingSchedule(schedule)}
          >
            <Trash2 className="w-4 h-4" />
          </RowIconButton>
        </RowActions>
      ),
    },
  ];

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
          <WriteButton
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>{t('newSchedule')}</span>
          </WriteButton>
        </div>
      </div>

      <DataTable<ScheduleRow>
        rows={paginatedSchedules}
        rowKey={(schedule) => schedule._id}
        columns={columns}
        search={{ value: searchTerm, onChange: handleSearch, placeholder: t('searchPlaceholder') }}
        onRowClick={(schedule) => router.push(`/admin/workflows/schedules/${schedule._id}`)}
        className="flex-1"
        empty={{
          icon: <Timer className="w-8 h-8 text-muted/30" />,
          label: t('table.noSchedules'),
        }}
        footer={{
          mode: "paged",
          page: currentPage,
          totalPages,
          totalCount: totalItems,
          pageSize: itemsPerPage,
          isLoading: false,
          onPageChange: setCurrentPage,
          labels: { empty: t('table.noSchedules') },
        }}
      />



      <ConfirmationModal
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
      </ConfirmationModal>

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
