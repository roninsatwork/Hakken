"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/atoms/Button";
import { WriteButton, useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Field } from "@/src/ui/components/screens/Field";
import {
  AlertTriangle,
  Clock,
  Database,
  Loader2,
  Play,
  Settings2,
  Square,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import {
  PaginationFooter,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import {
  purgePipelineKeys,
  type PurgeConfigMap,
  type PurgePipelineConfig,
  type PurgePipelineKey,
} from "./types";
import { EXPECTED_RETENTION_DAYS } from "@/convex/governanceDashboardService";

export function RetentionRulesSection() {
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

  // READ_ONLY oversight roles can see everything here but run nothing; the
  // mutations would refuse them anyway, so the buttons must not pretend.
  const canWrite = useCanWriteHere();
  const purgeConfigs = useQuery(api.purges.getPipelineConfig);
  const previewCounts = useQuery(api.purges.getPurgePreviewCounts);
  const updatePurgeConfigs = useMutation(api.purges.updatePipelineConfig);
  const manualPurgeMutation = useMutation(api.purges.runManualPurge);
  const cancelPurgeMutation = useMutation(api.purges.cancelPurge);
  const runningPurges = useQuery(api.purges.getRunningPurges);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [page, setPage] = useState(1);

  const filteredKeys = purgePipelineKeys.filter((key) => {
    const configs = (purgeConfigs || {}) as Partial<PurgeConfigMap>;
    const enabled = Boolean(configs[key]?.enabled);
    if (statusFilter === "enabled" && !enabled) return false;
    if (statusFilter === "disabled" && enabled) return false;
    const needle = searchTerm.trim().toLowerCase();
    if (!needle) return true;
    const haystack = `${t(`purges.categories.${key}.title`)} ${t(`purges.categories.${key}.description`)}`.toLowerCase();
    return haystack.includes(needle);
  });

  const pageStart = (page - 1) * TABLE_PAGE_SIZE;
  const pageKeys = filteredKeys.slice(pageStart, pageStart + TABLE_PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filteredKeys.length / TABLE_PAGE_SIZE));

  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [configModalPipeline, setConfigModalPipeline] = useState<PurgePipelineKey | null>(null);
  const [configModalData, setConfigModalData] = useState<PurgePipelineConfig>({});

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalPipeline, setConfirmModalPipeline] = useState<PurgePipelineKey | null>(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelModalHistoryId, setCancelModalHistoryId] = useState<Id<"purgeHistory"> | null>(null);
  const [cancelModalPipeline, setCancelModalPipeline] = useState<PurgePipelineKey | null>(null);
  const [isCancelRunning, setIsCancelRunning] = useState(false);

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

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="flex-1">
                <SearchBar
                  value={searchTerm}
                  onChange={(value) => {
                    setSearchTerm(value);
                    setPage(1);
                  }}
                  placeholder={t('purges.table.searchPlaceholder')}
                />
              </div>
              <div className="flex items-center gap-1 rounded-[10px] border border-border-dim bg-sidebar/30 p-1">
                {([
                  { id: 'all', label: t('purges.table.filterAll') },
                  { id: 'enabled', label: t('purges.modals.config.enabled') },
                  { id: 'disabled', label: t('purges.modals.config.disabled') },
                ] as const).map((tab) => (
                  // Stays raw: a segmented-filter tab whose fill swaps with selection — matches no variant.
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setStatusFilter(tab.id);
                      setPage(1);
                    }}
                    className={`rounded-[7px] px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                      statusFilter === tab.id
                        ? 'bg-foreground/10 text-foreground'
                        : 'text-secondary hover:text-foreground'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <TableShell
              minWidthClassName="min-w-[900px]"
              footer={filteredKeys.length > 0 ? (
                <PaginationFooter
                  page={page}
                  totalPages={totalPages}
                  totalCount={filteredKeys.length}
                  pageSize={TABLE_PAGE_SIZE}
                  isLoading={purgeConfigs === undefined}
                  onPageChange={setPage}
                />
              ) : undefined}
            >
                <thead>
                  <TableHeaderRow>
                    <TableHeaderCell>{t('purges.table.category')}</TableHeaderCell>
                    <TableHeaderCell>{t('purges.table.description')}</TableHeaderCell>
                    <TableHeaderCell className="w-[190px]">{t('purges.table.retention')}</TableHeaderCell>
                    <TableHeaderCell className="w-[190px]">{t('purges.table.interval')}</TableHeaderCell>
                    <TableHeaderCell className="w-[120px]">{t('purges.table.status')}</TableHeaderCell>
                    <TableHeaderCell className="w-[110px]" align="right">{t('purges.table.actions')}</TableHeaderCell>
                  </TableHeaderRow>
                </thead>
                <tbody>
                    {purgeConfigs === undefined ? (
                      <TableLoadingRow colSpan={6} />
                    ) : filteredKeys.length === 0 ? (
                      <TableEmptyRow
                        colSpan={6}
                        icon={<Database className="h-8 w-8 text-muted/30" />}
                        label={t('purges.table.noMatches')}
                      />
                    ) : (
                      pageKeys.map((key) => {
                        const configs = (purgeConfigs || {}) as Partial<PurgeConfigMap>;
                        const conf = configs[key] || {};
                        const isEnabled = conf.enabled;
                        const runningLog = runningPurges?.find(
                          (log) => log.pipelineKey === key
                        );

                        return (
                          <tr key={key} className="group border-b border-border-dim/50 transition-colors hover:bg-foreground/[0.02]">
                            <td className="px-4 py-3">
                              <span className="text-[13px] font-medium text-foreground">{t(`purges.categories.${key}.title`)}</span>
                            </td>
                            <td className="px-4 py-3 max-w-md">
                              <span className="text-[12px] text-secondary leading-snug inline-block">{t(`purges.categories.${key}.description`)}</span>
                            </td>
                            <td className="px-4 py-3">
                              <span className="text-[13px] font-mono font-medium text-foreground">{t('purges.modals.config.days', { days: conf.retentionDays || 0 })}</span>
                              {previewCounts?.[key] && (
                                <span className="block text-[11px] text-muted mt-0.5">
                                  {previewCounts[key].count === 0
                                    ? t('purges.table.previewNone')
                                    : previewCounts[key].capped
                                      ? t('purges.table.previewCapped', { count: previewCounts[key].count.toLocaleString() })
                                      : t('purges.table.previewNow', { count: previewCounts[key].count.toLocaleString() })}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
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
                            <td className="px-4 py-3">
                              <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-[6px] text-[11px] font-medium tracking-wide uppercase ${isEnabled ? 'bg-brand/10 text-brand' : 'bg-foreground/5 text-muted'}`}>
                                <div className={`w-1.5 h-1.5 rounded-full ${isEnabled ? 'bg-brand' : 'bg-muted'}`} />
                                {isEnabled ? t('purges.modals.config.enabled') : t('purges.modals.config.disabled')}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {canWrite && <div className="flex items-center justify-end gap-2">
                                <Button
                                  variant="icon"
                                  onClick={() => {
                                    setConfigModalPipeline(key);
                                    setConfigModalData({ ...conf });
                                    setIsConfigModalOpen(true);
                                  }}
                                  className="rounded-[6px] p-1.5"
                                  title={t('purges.table.configure')}
                                >
                                  <Settings2 className="w-4 h-4" />
                                </Button>
                                {runningLog ? (
                                  <Button
                                    variant="icon"
                                    onClick={() => {
                                      setCancelModalHistoryId(runningLog._id);
                                      setCancelModalPipeline(key);
                                      setIsCancelModalOpen(true);
                                    }}
                                    className="rounded-[6px] p-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 animate-pulse"
                                    title={t('purges.table.stop')}
                                  >
                                    <Square className="w-4 h-4 fill-destructive" />
                                  </Button>
                                ) : (
                                  <Button
                                    variant="icon"
                                    onClick={() => {
                                      setConfirmModalPipeline(key);
                                      setIsConfirmModalOpen(true);
                                    }}
                                    disabled={isManualRunning}
                                    className="rounded-[6px] p-1.5 hover:text-brand hover:bg-brand/5 disabled:opacity-50"
                                    title={t('purges.table.runNow')}
                                  >
                                    <Play className="w-4 h-4" />
                                  </Button>
                                )}
                              </div>}
                            </td>
                          </tr>
                        );
                      })
                    )}
                </tbody>
            </TableShell>

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
            {/* Stays raw: a bare toggle glyph whose colour is the state — matches no variant. */}
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
                <Field
                  label={t('purges.modals.config.customLabel')}
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
              <p className="rounded-[10px] bg-warning/10 px-4 py-3 text-[13px] leading-relaxed text-warning">
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
            <Button
              variant="ghost"
              onClick={() => setIsConfigModalOpen(false)}
              className="rounded-[10px] hover:bg-foreground/5"
            >
              {t('purges.modals.config.cancel')}
            </Button>
            <WriteButton
              onClick={async () => {
                if (configModalPipeline) {
                  // Write exactly what the select displays. The old fallback
                  // pair disagreed (display ?? 90, save || 30), so a modal
                  // opened before the server sent a value showed "90 Days"
                  // and silently saved 30.
                  const retentionDays = Math.max(30, configModalData.retentionDays ?? 90);
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
            </WriteButton>
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
          <div className="flex items-start gap-4 p-5 bg-destructive/10 border border-destructive/20 rounded-[16px]">
            <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2">
              <p className="text-[14px] text-destructive font-medium">
                {confirmModalPipeline ? t('purges.modals.confirm.body', {
                  category: t(`purges.categories.${confirmModalPipeline}.title`),
                  cutoffDate: new Date(Date.now() - (((purgeConfigs || {}) as Partial<PurgeConfigMap>)[confirmModalPipeline]?.retentionDays || 90) * 24 * 60 * 60 * 1000).toLocaleDateString(),
                  days: ((purgeConfigs || {}) as Partial<PurgeConfigMap>)[confirmModalPipeline]?.retentionDays || 90
                }) : ""}
              </p>
              <p className="text-[13px] text-destructive/80">
                {t('purges.modals.confirm.warning')}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-2 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={() => setIsConfirmModalOpen(false)}
              className="rounded-[10px] hover:bg-foreground/5"
            >
              {t('purges.modals.confirm.cancel')}
            </Button>
            <WriteButton
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
              className="px-6 py-2.5 rounded-[10px] bg-destructive text-white font-medium hover:bg-destructive/90 transition-all shadow-xl shadow-destructive/20 text-[13px] flex items-center gap-2 disabled:opacity-50"
            >
              {isManualRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {t('purges.modals.confirm.confirm')}
            </WriteButton>
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
          <div className="flex items-start gap-4 p-5 bg-destructive/10 border border-destructive/20 rounded-[16px]">
            <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2">
              <p className="text-[14px] text-destructive font-medium">
                {cancelModalPipeline ? t('purges.modals.cancelConfirm.body', {
                  category: t(`purges.categories.${cancelModalPipeline}.title`),
                }) : ""}
              </p>
              <p className="text-[13px] text-destructive/80">
                {t('purges.modals.cancelConfirm.warning')}
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-2 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={() => setIsCancelModalOpen(false)}
              className="rounded-[10px] hover:bg-foreground/5"
            >
              {t('purges.modals.cancelConfirm.cancel')}
            </Button>
            <WriteButton
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
              className="px-6 py-2.5 rounded-[10px] bg-destructive text-white font-medium hover:bg-destructive/90 transition-all shadow-xl shadow-destructive/20 text-[13px] flex items-center gap-2 disabled:opacity-50"
            >
              {isCancelRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-white" />}
              {t('purges.modals.cancelConfirm.confirm')}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
