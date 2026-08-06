"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import {
  AlertTriangle,
  Clock,
  Database,
  History,
  Loader2,
  Play,
  Settings2,
  Square,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  purgePipelineKeys,
  type PurgeConfigMap,
  type PurgeHistoryRow,
  type PurgePipelineConfig,
  type PurgePipelineKey,
} from "./types";
import { EXPECTED_RETENTION_DAYS } from "@/convex/governanceDashboardService";

export function PurgesSettingsSection() {
  const t = useTranslations('admin.settings');
  const locale = useLocale();

  const getOrdinalSuffix = (day: number) => {
    if (locale === "it") return `${day}°`;
    const j = day % 10, k = day % 100;
    if (j === 1 && k !== 11) return `${day}st`;
    if (j === 2 && k !== 12) return `${day}nd`;
    if (j === 3 && k !== 13) return `${day}rd`;
    return `${day}th`;
  };

  const purgeConfigs = useQuery(api.purges.getPipelineConfig);
  const updatePurgeConfigs = useMutation(api.purges.updatePipelineConfig);
  const manualPurgeMutation = useMutation(api.purges.runManualPurge);
  const cancelPurgeMutation = useMutation(api.purges.cancelPurge);
  const recentPurges = useQuery(api.purges.getRecentPurges);

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalPipeline, setConfigModalPipeline] = useState<PurgePipelineKey | null>(null);
  const [configModalData, setConfigModalData] = useState<PurgePipelineConfig>({});

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalPipeline, setConfirmModalPipeline] = useState<PurgePipelineKey | null>(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelModalHistoryId, setCancelModalHistoryId] = useState<Id<"purgeHistory"> | null>(null);
  const [cancelModalPipeline, setCancelModalPipeline] = useState<PurgePipelineKey | null>(null);
  const [isCancelRunning, setIsCancelRunning] = useState(false);

  const [purgesCurrentPage, setPurgesCurrentPage] = useState(1);
  const [isManualRunning, setIsManualRunning] = useState(false);

  return (
    <>
          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-1 ml-2">
              <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase flex items-center gap-2">
                <Database className="w-3.5 h-3.5" /> {t('purges.title')}
              </h3>
              <p className="text-[13px] text-secondary mt-1 max-w-2xl">{t('purges.subtitle')}</p>
            </div>

            <div className="w-full bg-sidebar/40 border border-border-dim/50 rounded-[20px] overflow-hidden shadow-sm backdrop-blur-xl mt-2">
              <div className="w-full overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border-dim/50 bg-foreground/[0.02] whitespace-nowrap">
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.table.category')}</th>
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.table.description')}</th>
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.table.retention')}</th>
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.table.interval')}</th>
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.table.status')}</th>
                      <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em] text-right">{t('purges.table.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/30">
                    {purgeConfigs === undefined ? (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-brand mx-auto" /></td>
                      </tr>
                    ) : (
                      purgePipelineKeys.map((key) => {
                        const configs = (purgeConfigs || {}) as Partial<PurgeConfigMap>;
                        const conf = configs[key] || {};
                        const isEnabled = conf.enabled;
                        const runningLog = recentPurges?.find(
                          (log) => log.pipelineKey === key && log.status === "RUNNING"
                        );

                        return (
                          <tr key={key} className="group hover:bg-foreground/[0.03] transition-colors">
                            <td className="px-5 py-4">
                              <span className="text-[13px] font-medium text-foreground">{t(`purges.categories.${key}.title`)}</span>
                            </td>
                            <td className="px-5 py-4 max-w-xs">
                              <span className="text-[12px] text-secondary leading-snug inline-block">{t(`purges.categories.${key}.description`)}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[13px] font-mono font-medium text-foreground">{t('purges.modals.config.days', { days: conf.retentionDays || 0 })}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[13px] font-mono font-medium text-foreground">
                                {conf.interval === "Weekly" ? (
                                  `${t('purges.intervals.Weekly')} (${t(`purges.daysOfWeek.${conf.dayOfWeek !== undefined ? conf.dayOfWeek : 0}`)})`
                                ) : conf.interval === "Monthly" ? (
                                  `${t('purges.intervals.Monthly')} (${getOrdinalSuffix(conf.dayOfMonth || 1)})`
                                ) : (
                                  t(`purges.intervals.${conf.interval || "Daily"}`)
                                )}
                              </span>
                              {conf.interval !== "Hourly" && (
                                <span className="text-[11px] text-muted ml-2">@{String(conf.hourUtc || 0).padStart(2, '0')}:00 UTC</span>
                              )}
                            </td>
                            <td className="px-5 py-4">
                              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium tracking-wide uppercase ${isEnabled ? 'bg-brand/10 text-brand' : 'bg-foreground/5 text-muted'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-brand' : 'bg-muted'}`} />
                                {isEnabled ? t('purges.modals.config.enabled') : t('purges.modals.config.disabled')}
                              </div>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setConfigModalPipeline(key);
                                    setConfigModalData({ ...conf });
                                    setIsConfigModalOpen(true);
                                  }}
                                  className="p-1.5 text-secondary hover:text-foreground hover:bg-foreground/5 rounded-[6px] transition-colors"
                                  title={t('purges.table.configure')}
                                >
                                  <Settings2 className="w-4 h-4" />
                                </button>
                                {runningLog ? (
                                  <button
                                    onClick={() => {
                                      setCancelModalHistoryId(runningLog._id);
                                      setCancelModalPipeline(key);
                                      setIsCancelModalOpen(true);
                                    }}
                                    className="p-1.5 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 rounded-[6px] transition-colors animate-pulse"
                                    title={t('purges.table.stop')}
                                  >
                                    <Square className="w-4 h-4 fill-rose-500" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setConfirmModalPipeline(key);
                                      setIsConfirmModalOpen(true);
                                    }}
                                    disabled={isManualRunning}
                                    className="p-1.5 text-secondary hover:text-brand hover:bg-brand/5 rounded-[6px] transition-colors disabled:opacity-50"
                                    title={t('purges.table.runNow')}
                                  >
                                    <Play className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-6">
              <div className="flex flex-col gap-1 ml-2">
                <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase flex items-center gap-2">
                  <History className="w-3.5 h-3.5" /> {t('purges.history.title')}
                </h3>
                <p className="text-[13px] text-secondary mt-1">{t('purges.history.subtitle')}</p>
              </div>

              <div className="w-full bg-sidebar/40 border border-border-dim/50 rounded-[20px] overflow-hidden shadow-sm backdrop-blur-xl">
                <div className="w-full overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-border-dim/50 bg-foreground/[0.02] whitespace-nowrap">
                        <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.history.table.pipeline')}</th>
                        <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.history.table.trigger')}</th>
                        <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.history.table.status')}</th>
                        <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">{t('purges.history.table.purged')}</th>
                        <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em] text-right">{t('purges.history.table.started')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/30">
                      {recentPurges === undefined ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center"><Loader2 className="w-5 h-5 animate-spin text-brand mx-auto" /></td>
                        </tr>
                      ) : recentPurges.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-5 py-8 text-center text-secondary text-[13px]">{t('purges.history.table.empty')}</td>
                        </tr>
                      ) : (
                        (recentPurges as PurgeHistoryRow[])
                          .slice((purgesCurrentPage - 1) * ADMIN_PAGE_SIZE, purgesCurrentPage * ADMIN_PAGE_SIZE)
                          .map((log) => (
                          <tr key={log._id} className="group hover:bg-foreground/[0.03] transition-colors">
                            <td className="px-5 py-4">
                              <span className="text-[13px] font-medium text-foreground">{t(`purges.categories.${log.pipelineKey}.title`)}</span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[13px] font-medium text-secondary">
                                {log.triggerType === "SCHEDULED" ? t('purges.history.table.system') : `${t('purges.history.table.manual')} (${log.actorName})`}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[10px] font-bold tracking-wide uppercase ${
                                log.status === 'SUCCESS' ? 'bg-brand/10 text-brand' :
                                log.status === 'FAILED' ? 'bg-rose-500/10 text-rose-500' :
                                'bg-sky-500/10 text-sky-500'
                              }`}>
                                {log.status === 'RUNNING' && <Loader2 className="w-3 h-3 animate-spin" />}
                                {t(`purges.history.table.${log.status.toLowerCase()}`)}
                              </span>
                            </td>
                            <td className="px-5 py-4">
                              <span className="text-[13px] font-mono text-foreground">{log.recordsPurged.toLocaleString()}</span>
                            </td>
                            <td className="px-5 py-4 text-right">
                              <span className="text-[12px] font-mono text-secondary">{new Date(log.startedAt).toLocaleString()}</span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {recentPurges && recentPurges.length > ADMIN_PAGE_SIZE && (
                  <div className="flex items-center justify-between px-5 py-3 border-t border-border-dim/50 bg-background/50">
                    <span className="text-[12px] text-secondary">
                      Showing {(purgesCurrentPage - 1) * ADMIN_PAGE_SIZE + 1} to {Math.min(purgesCurrentPage * ADMIN_PAGE_SIZE, recentPurges.length)} of {recentPurges.length} entries
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPurgesCurrentPage(Math.max(1, purgesCurrentPage - 1))}
                        disabled={purgesCurrentPage === 1}
                        className="px-2.5 py-1 text-[12px] text-foreground bg-foreground/5 hover:bg-foreground/10 rounded-[6px] transition-colors disabled:opacity-30"
                      >
                        Previous
                      </button>
                      <button
                        onClick={() => setPurgesCurrentPage(Math.min(Math.ceil(recentPurges.length / ADMIN_PAGE_SIZE), purgesCurrentPage + 1))}
                        disabled={purgesCurrentPage === Math.ceil(recentPurges.length / ADMIN_PAGE_SIZE)}
                        className="px-2.5 py-1 text-[12px] text-foreground bg-foreground/5 hover:bg-foreground/10 rounded-[6px] transition-colors disabled:opacity-30"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

      {/* Purges Configuration Modal */}
      <SonaeModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
        title={configModalPipeline ? t('purges.modals.config.title', { category: t(`purges.categories.${configModalPipeline}.title`) }) : ""}
      >
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between p-5 bg-background border border-border-dim rounded-[16px]">
            <div className="flex flex-col gap-1">
              <span className="text-[14px] text-foreground font-semibold">{t('purges.modals.config.status')}</span>
            </div>
            <button
              onClick={() => setConfigModalData({ ...configModalData, enabled: !configModalData.enabled })}
              className={`transition-colors flex-shrink-0 ${configModalData.enabled ? "text-brand" : "text-muted"}`}
            >
              {configModalData.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
            </button>
          </div>

          <div className={`flex flex-col gap-6 transition-all duration-300 ${configModalData.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            <div className="flex flex-col gap-2 relative">
              <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('purges.modals.config.retention')}</span>
              <select
                value={[30, 60, 90, 180, 365].includes(configModalData.retentionDays ?? 90) ? (configModalData.retentionDays ?? 90) : "custom"}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "custom") {
                    setConfigModalData({ ...configModalData, retentionDays: 90, isCustom: true });
                  } else {
                    setConfigModalData({ ...configModalData, retentionDays: parseInt(val), isCustom: false });
                  }
                }}
                className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
              >
                {[30, 60, 90, 180, 365].map(d => (
                  <option key={d} value={d}>{t('purges.modals.config.days', { days: d })}</option>
                ))}
                <option value="custom">{t('purges.modals.config.custom')}</option>
              </select>
            </div>

            {(configModalData.isCustom || (![30, 60, 90, 180, 365].includes(configModalData.retentionDays ?? 90) && (configModalData.retentionDays ?? 0) > 0)) && (
              <div className="flex flex-col gap-2 relative">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('purges.modals.config.customLabel')}</span>
                <input
                  type="number"
                  min="30"
                  value={configModalData.retentionDays || ""}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value);
                    setConfigModalData({ ...configModalData, retentionDays: isNaN(parsed) ? 30 : parsed });
                  }}
                  onBlur={() => {
                    if ((configModalData.retentionDays ?? 30) < 30) {
                      setConfigModalData({ ...configModalData, retentionDays: 30 });
                    }
                  }}
                  className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors"
                  placeholder={t('purges.modals.config.customPlaceholder')}
                />
              </div>
            )}

            {/*
              Said where the choice is made, not only on a dashboard afterwards.
              A number chosen here quietly destroys records someone is expected
              to still have, and the person choosing it is the one who can
              change their mind.
            */}
            {configModalData.enabled && (configModalData.retentionDays ?? 0) > 0
              && (configModalData.retentionDays ?? 0) < EXPECTED_RETENTION_DAYS ? (
              <p className="rounded-[10px] bg-[#fef3c7]/60 dark:bg-[#78350f]/30 px-4 py-3 text-[13px] leading-relaxed text-[#78350f] dark:text-[#fef3c7]">
                {t('purges.modals.config.tooShort', { days: EXPECTED_RETENTION_DAYS })}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 relative">
              <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('purges.modals.config.interval')}</span>
              <select
                value={configModalData.interval || "Daily"}
                onChange={(e) => setConfigModalData({ ...configModalData, interval: e.target.value as PurgePipelineConfig["interval"] })}
                className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
              >
                {['Hourly', 'Daily', 'Weekly', 'Monthly'].map(int => (
                  <option key={int} value={int}>{t(`purges.intervals.${int}`)}</option>
                ))}
              </select>
            </div>

            {configModalData.interval === "Weekly" && (
              <div className="flex flex-col gap-2 relative">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('purges.modals.config.dayOfWeek')}</span>
                <select
                  value={configModalData.dayOfWeek !== undefined ? configModalData.dayOfWeek : 0}
                  onChange={(e) => setConfigModalData({ ...configModalData, dayOfWeek: parseInt(e.target.value) })}
                  className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                >
                  {Array.from({ length: 7 }, (_, i) => i).map(day => (
                    <option key={day} value={day}>{t(`purges.daysOfWeek.${day}`)}</option>
                  ))}
                </select>
              </div>
            )}

            {configModalData.interval === "Monthly" && (
              <div className="flex flex-col gap-2 relative">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('purges.modals.config.dayOfMonth')}</span>
                <select
                  value={configModalData.dayOfMonth !== undefined ? configModalData.dayOfMonth : 1}
                  onChange={(e) => setConfigModalData({ ...configModalData, dayOfMonth: parseInt(e.target.value) })}
                  className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(date => (
                    <option key={date} value={date}>{getOrdinalSuffix(date)}</option>
                  ))}
                </select>
              </div>
            )}

            {configModalData.interval !== "Hourly" && (
              <div className="flex flex-col gap-2 relative">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('purges.modals.config.hour')}</span>
                <select
                  value={configModalData.hourUtc || 0}
                  onChange={(e) => setConfigModalData({ ...configModalData, hourUtc: parseInt(e.target.value) })}
                  className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                >
                  {Array.from({ length: 24 }, (_, i) => i).map(hour => {
                    const hh = hour.toString().padStart(2, '0');
                    return <option key={hour} value={hour}>{hh}:00 UTC</option>;
                  })}
                </select>
                <div className="mt-1 ml-1 text-[12px] text-secondary/80 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand/70" />
                  <span>
                    {t('purges.modals.config.ukTimeDual', {
                      gmt: String(configModalData.hourUtc || 0).padStart(2, '0') + ":00",
                      bst: String(((configModalData.hourUtc || 0) + 1) % 24).padStart(2, '0') + ":00"
                    })}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 mt-2 pt-6 border-t border-border-dim">
            <button
              onClick={() => setIsConfigModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-[13px] font-medium"
            >
              {t('purges.modals.config.cancel')}
            </button>
            <AdminWriteButton
              onClick={async () => {
                if (configModalPipeline) {
                  const retentionDays = Math.max(30, configModalData.retentionDays || 30);
                  const updated = { ...((purgeConfigs || {}) as Partial<PurgeConfigMap>), [configModalPipeline]: {
                    enabled: configModalData.enabled,
                    retentionDays,
                    interval: configModalData.interval,
                    hourUtc: configModalData.hourUtc,
                    dayOfWeek: configModalData.dayOfWeek !== undefined ? configModalData.dayOfWeek : 0,
                    dayOfMonth: configModalData.dayOfMonth !== undefined ? configModalData.dayOfMonth : 1
                  }};
                  await updatePurgeConfigs({ configStr: JSON.stringify(updated) });
                  setIsConfigModalOpen(false);
                }
              }}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-[13px]"
            >
              {t('purges.modals.config.save')}
            </AdminWriteButton>
          </div>
        </div>
      </SonaeModal>

      {/* Manual Purge Confirmation Modal */}
      <SonaeModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title={t('purges.modals.confirm.title')}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4 p-5 bg-rose-500/10 border border-rose-500/20 rounded-[16px]">
            <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2">
              <p className="text-[14px] text-rose-500 font-medium">
                {confirmModalPipeline ? t('purges.modals.confirm.body', {
                  category: t(`purges.categories.${confirmModalPipeline}.title`),
                  cutoffDate: new Date(Date.now() - (((purgeConfigs || {}) as Partial<PurgeConfigMap>)[confirmModalPipeline]?.retentionDays || 90) * 24 * 60 * 60 * 1000).toLocaleDateString(),
                  days: ((purgeConfigs || {}) as Partial<PurgeConfigMap>)[confirmModalPipeline]?.retentionDays || 90
                }) : ""}
              </p>
              <p className="text-[13px] text-rose-500/80">
                {t('purges.modals.confirm.warning')}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-2 pt-6 border-t border-border-dim">
            <button
              onClick={() => setIsConfirmModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-[13px] font-medium"
            >
              {t('purges.modals.confirm.cancel')}
            </button>
            <AdminWriteButton
              onClick={async () => {
                if (confirmModalPipeline) {
                  setIsManualRunning(true);
                  try {
                    await manualPurgeMutation({ 
                      pipelineKey: confirmModalPipeline
                    });
                    setIsConfirmModalOpen(false);
                  } finally {
                    setIsManualRunning(false);
                  }
                }
              }}
              disabled={isManualRunning}
              className="px-6 py-2.5 rounded-[10px] bg-rose-500 text-white font-medium hover:bg-rose-600 transition-all shadow-xl shadow-rose-500/20 text-[13px] flex items-center gap-2 disabled:opacity-50"
            >
              {isManualRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {t('purges.modals.confirm.confirm')}
            </AdminWriteButton>
          </div>
        </div>
      </SonaeModal>

      {/* Cancel Purge Confirmation Modal */}
      <SonaeModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title={t('purges.modals.cancelConfirm.title')}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4 p-5 bg-rose-500/10 border border-rose-500/20 rounded-[16px]">
            <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2">
              <p className="text-[14px] text-rose-500 font-medium">
                {cancelModalPipeline ? t('purges.modals.cancelConfirm.body', {
                  category: t(`purges.categories.${cancelModalPipeline}.title`),
                }) : ""}
              </p>
              <p className="text-[13px] text-rose-500/80">
                {t('purges.modals.cancelConfirm.warning')}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-2 pt-6 border-t border-border-dim">
            <button
              onClick={() => setIsCancelModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-[13px] font-medium"
            >
              {t('purges.modals.cancelConfirm.cancel')}
            </button>
            <AdminWriteButton
              onClick={async () => {
                if (cancelModalHistoryId) {
                  setIsCancelRunning(true);
                  try {
                    await cancelPurgeMutation({ historyId: cancelModalHistoryId });
                    setIsCancelModalOpen(false);
                  } catch (err) {
                    console.error("Failed to cancel active purge execution:", err);
                  } finally {
                    setIsCancelRunning(false);
                  }
                }
              }}
              disabled={isCancelRunning}
              className="px-6 py-2.5 rounded-[10px] bg-rose-500 text-white font-medium hover:bg-rose-600 transition-all shadow-xl shadow-rose-500/20 text-[13px] flex items-center gap-2 disabled:opacity-50"
            >
              {isCancelRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-white" />}
              {t('purges.modals.cancelConfirm.confirm')}
            </AdminWriteButton>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
