"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { lazy, Suspense, useState } from "react";
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
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";

const loadScheduleDialogs = () => import("./ScheduleDialogs");
const ScheduleDialogs = lazy(() =>
  loadScheduleDialogs().then((module) => ({ default: module.ScheduleDialogs })),
);

type ScheduleRow = Doc<"schedules"> & {
  workflowName?: string;
  agentName?: string;
  targetName?: string;
};


export default function SchedulesPage() {
  const router = useRouter();
  const t = useTranslations('admin.workflows.schedules');
  const scheduleSummary = useScheduleSummary();
  const tCommon = useTranslations('common');

  const schedules = (useQuery(api.scheduler.getSchedules) || []) as ScheduleRow[];

  const deleteSchedule = useMutation(api.scheduler.deleteSchedule);
  const toggleSchedule = useMutation(api.scheduler.toggleSchedule);
  const manualRunSchedule = useMutation(api.scheduler.manualRunSchedule);
  const action = useAdminAction({ scope: "admin-workflow-schedules" });

  const [searchTerm, setSearchTerm] = useState("");
  const [deletingSchedule, setDeletingSchedule] = useState<ScheduleRow | null>(null);
  const [messageModal, setMessageModal] = useState<{ title: string; body: string } | null>(null);
  const [dialogsActivated, setDialogsActivated] = useState(false);

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

  const activateDialogs = () => {
    void loadScheduleDialogs();
    setDialogsActivated(true);
  };

  const showMessage = (message: { title: string; body: string }) => {
    activateDialogs();
    setMessageModal(message);
  };

  const confirmDelete = async () => {
    if (!deletingSchedule) return;
    const outcome = await action.run(() => deleteSchedule({ scheduleId: deletingSchedule._id }), {
      key: `delete:${deletingSchedule._id}`,
      suppressErrorToast: true,
      fallbackMessage: tCommon('errors.default'),
    });

    if (outcome.ok) {
      setDeletingSchedule(null);
      return;
    }
    if (outcome.message) {
      showMessage({ title: t('modals.error.deleteFailed'), body: outcome.message });
    }
  };

  const handleManualRun = async (
    scheduleId: Id<"schedules">,
    target: { workflowId?: Id<"workflows">; agentId?: Id<"agents"> },
    e: MouseEvent<HTMLButtonElement>
  ) => {
    e.stopPropagation();
    const outcome = await action.run(() => manualRunSchedule(target), {
      key: `run:${scheduleId}`,
      suppressErrorToast: true,
      fallbackMessage: tCommon('errors.default'),
    });

    if (outcome.ok) {
      showMessage({ title: t('modals.execution.title'), body: t('modals.execution.body') });
      return;
    }
    if (outcome.message) {
      showMessage({ title: t('modals.error.executionFailed'), body: outcome.message });
    }
  };

  const handleToggle = async (scheduleId: Id<"schedules">, current: boolean, e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    const outcome = await action.run(() => toggleSchedule({ scheduleId, isActive: !current }), {
      key: `toggle:${scheduleId}`,
      suppressErrorToast: true,
      fallbackMessage: tCommon('errors.default'),
    });

    if (!outcome.ok && outcome.message) {
      showMessage({ title: t('modals.error.statusFailed'), body: outcome.message });
    }
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
            {scheduleSummary(schedule.intervalStr)}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: t('table.status'),
      cell: (schedule) => (
        // Stays raw: a labelled toggle glyph whose colour is the state — matches no variant.
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
                schedule._id,
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
            onClick={() => {
              activateDialogs();
              setDeletingSchedule(schedule);
            }}
          >
            <Trash2 className="w-4 h-4" />
          </RowIconButton>
        </RowActions>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        divider
        icon={<Timer className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('description')}
        action={
          <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
            <WriteButton
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-brand text-white font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>{t('newSchedule')}</span>
            </WriteButton>
          </div>
        }
      />

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
      {dialogsActivated ? (
        <Suspense fallback={null}>
          <ScheduleDialogs
            deletingSchedule={deletingSchedule}
            isSubmitting={deletingSchedule ? action.isBusy(`delete:${deletingSchedule._id}`) : false}
            onCloseDelete={() => setDeletingSchedule(null)}
            onConfirmDelete={confirmDelete}
            messageModal={messageModal}
            onCloseMessage={() => setMessageModal(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
