"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useLocale, useTranslations } from "next-intl";
import { EXPECTED_RETENTION_DAYS } from "@/convex/governanceDashboardService";
import { AlertTriangle, Clock, Loader2, Play, Square } from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field } from "@/src/ui/components/screens/Field";
import type { PurgeConfigMap, PurgePipelineConfig, PurgePipelineKey } from "./types";

type RetentionRuleDialogsProps = {
  purgeConfigs: Partial<PurgeConfigMap>;
  configModalOpen: boolean;
  configModalPipeline: PurgePipelineKey | null;
  configModalData: PurgePipelineConfig;
  setConfigModalData: Dispatch<SetStateAction<PurgePipelineConfig>>;
  renderConfigToggle: () => ReactNode;
  closeConfigModal: () => void;
  saveConfig: () => Promise<void>;
  confirmModalOpen: boolean;
  confirmModalPipeline: PurgePipelineKey | null;
  getConfirmCutoffDate: () => string;
  closeConfirmModal: () => void;
  confirmManualPurge: () => Promise<void>;
  isManualRunning: boolean;
  cancelModalOpen: boolean;
  cancelModalPipeline: PurgePipelineKey | null;
  closeCancelModal: () => void;
  confirmCancelPurge: () => Promise<void>;
  isCancelRunning: boolean;
};

export function RetentionRuleDialogs({
  purgeConfigs,
  configModalOpen,
  configModalPipeline,
  configModalData,
  setConfigModalData,
  renderConfigToggle,
  closeConfigModal,
  saveConfig,
  confirmModalOpen,
  confirmModalPipeline,
  getConfirmCutoffDate,
  closeConfirmModal,
  confirmManualPurge,
  isManualRunning,
  cancelModalOpen,
  cancelModalPipeline,
  closeCancelModal,
  confirmCancelPurge,
  isCancelRunning,
}: RetentionRuleDialogsProps) {
  const t = useTranslations("admin.settings");
  const locale = useLocale();

  const getOrdinalSuffix = (day: number) => {
    if (locale === "it") return `${day}°`;
    const j = day % 10;
    const k = day % 100;
    if (j === 1 && k !== 11) return `${day}st`;
    if (j === 2 && k !== 12) return `${day}nd`;
    if (j === 3 && k !== 13) return `${day}rd`;
    return `${day}th`;
  };

  return (
    <>
      <SonaeModal
        isOpen={configModalOpen}
        onClose={closeConfigModal}
        title={configModalPipeline ? t("purges.modals.config.title", { category: t(`purges.categories.${configModalPipeline}.title`) }) : ""}
      >
        <div className="flex flex-col gap-8">
          <div className="flex items-center justify-between p-5 bg-background border border-border-dim rounded-[16px]">
            <div className="flex flex-col gap-1">
              <span className="text-[14px] text-foreground font-semibold">{t("purges.modals.config.status")}</span>
            </div>
            {renderConfigToggle()}
          </div>

          <div className={`flex flex-col gap-6 transition-all duration-300 ${configModalData.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            <div className="flex flex-col gap-2 relative">
              <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("purges.modals.config.retention")}</span>
              <select
                value={[30, 60, 90, 180, 365].includes(configModalData.retentionDays ?? 90) ? (configModalData.retentionDays ?? 90) : "custom"}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "custom") {
                    setConfigModalData({ ...configModalData, retentionDays: 90, isCustom: true });
                  } else {
                    setConfigModalData({ ...configModalData, retentionDays: parseInt(value), isCustom: false });
                  }
                }}
                className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
              >
                {[30, 60, 90, 180, 365].map((days) => (
                  <option key={days} value={days}>{t("purges.modals.config.days", { days })}</option>
                ))}
                <option value="custom">{t("purges.modals.config.custom")}</option>
              </select>
            </div>

            {(configModalData.isCustom || (![30, 60, 90, 180, 365].includes(configModalData.retentionDays ?? 90) && (configModalData.retentionDays ?? 0) > 0)) && (
              <div className="flex flex-col gap-2 relative">
                <Field
                  label={t("purges.modals.config.customLabel")}
                  type="number"
                  min="30"
                  value={configModalData.retentionDays || ""}
                  onChange={(event) => {
                    const parsed = parseInt(event.target.value);
                    setConfigModalData({ ...configModalData, retentionDays: isNaN(parsed) ? 30 : parsed });
                  }}
                  onBlur={() => {
                    if ((configModalData.retentionDays ?? 30) < 30) {
                      setConfigModalData({ ...configModalData, retentionDays: 30 });
                    }
                  }}
                  placeholder={t("purges.modals.config.customPlaceholder")}
                />
              </div>
            )}

            {configModalData.enabled && (configModalData.retentionDays ?? 0) > 0
              && (configModalData.retentionDays ?? 0) < EXPECTED_RETENTION_DAYS ? (
              <p className="rounded-[10px] bg-warning/10 px-4 py-3 text-[13px] leading-relaxed text-warning">
                {t("purges.modals.config.tooShort", { days: EXPECTED_RETENTION_DAYS })}
              </p>
            ) : null}

            <div className="flex flex-col gap-2 relative">
              <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("purges.modals.config.interval")}</span>
              <select
                value={configModalData.interval || "Daily"}
                onChange={(event) => setConfigModalData({ ...configModalData, interval: event.target.value as PurgePipelineConfig["interval"] })}
                className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
              >
                {["Hourly", "Daily", "Weekly", "Monthly"].map((interval) => (
                  <option key={interval} value={interval}>{t(`purges.intervals.${interval}`)}</option>
                ))}
              </select>
            </div>

            {configModalData.interval === "Weekly" && (
              <div className="flex flex-col gap-2 relative">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("purges.modals.config.dayOfWeek")}</span>
                <select
                  value={configModalData.dayOfWeek !== undefined ? configModalData.dayOfWeek : 0}
                  onChange={(event) => setConfigModalData({ ...configModalData, dayOfWeek: parseInt(event.target.value) })}
                  className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                >
                  {Array.from({ length: 7 }, (_, index) => index).map((day) => (
                    <option key={day} value={day}>{t(`purges.daysOfWeek.${day}`)}</option>
                  ))}
                </select>
              </div>
            )}

            {configModalData.interval === "Monthly" && (
              <div className="flex flex-col gap-2 relative">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("purges.modals.config.dayOfMonth")}</span>
                <select
                  value={configModalData.dayOfMonth !== undefined ? configModalData.dayOfMonth : 1}
                  onChange={(event) => setConfigModalData({ ...configModalData, dayOfMonth: parseInt(event.target.value) })}
                  className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                >
                  {Array.from({ length: 28 }, (_, index) => index + 1).map((date) => (
                    <option key={date} value={date}>{getOrdinalSuffix(date)}</option>
                  ))}
                </select>
              </div>
            )}

            {configModalData.interval !== "Hourly" && (
              <div className="flex flex-col gap-2 relative">
                <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("purges.modals.config.hour")}</span>
                <select
                  value={configModalData.hourUtc || 0}
                  onChange={(event) => setConfigModalData({ ...configModalData, hourUtc: parseInt(event.target.value) })}
                  className="w-full bg-background border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                >
                  {Array.from({ length: 24 }, (_, index) => index).map((hour) => {
                    const hh = hour.toString().padStart(2, "0");
                    return <option key={hour} value={hour}>{hh}:00 UTC</option>;
                  })}
                </select>
                <div className="mt-1 ml-1 text-[12px] text-secondary/80 font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand/70" />
                  <span>
                    {t("purges.modals.config.ukTimeDual", {
                      gmt: `${String(configModalData.hourUtc || 0).padStart(2, "0")}:00`,
                      bst: `${String(((configModalData.hourUtc || 0) + 1) % 24).padStart(2, "0")}:00`,
                    })}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-4 mt-2 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={closeConfigModal}
              className="rounded-[10px] hover:bg-foreground/5"
            >
              {t("purges.modals.config.cancel")}
            </Button>
            <WriteButton
              onClick={saveConfig}
              className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 text-[13px]"
            >
              {t("purges.modals.config.save")}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={confirmModalOpen}
        onClose={closeConfirmModal}
        title={t("purges.modals.confirm.title")}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4 p-5 bg-destructive/10 border border-destructive/20 rounded-[16px]">
            <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2">
              <p className="text-[14px] text-destructive font-medium">
                {confirmModalPipeline ? t("purges.modals.confirm.body", {
                  category: t(`purges.categories.${confirmModalPipeline}.title`),
                  cutoffDate: getConfirmCutoffDate(),
                  days: purgeConfigs[confirmModalPipeline]?.retentionDays || 90,
                }) : ""}
              </p>
              <p className="text-[13px] text-destructive/80">{t("purges.modals.confirm.warning")}</p>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-2 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={closeConfirmModal}
              className="rounded-[10px] hover:bg-foreground/5"
            >
              {t("purges.modals.confirm.cancel")}
            </Button>
            <WriteButton
              onClick={confirmManualPurge}
              disabled={isManualRunning}
              className="px-6 py-2.5 rounded-[10px] bg-destructive text-white font-medium hover:bg-destructive/90 transition-all shadow-xl shadow-destructive/20 text-[13px] flex items-center gap-2 disabled:opacity-50"
            >
              {isManualRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {t("purges.modals.confirm.confirm")}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={cancelModalOpen}
        onClose={closeCancelModal}
        title={t("purges.modals.cancelConfirm.title")}
      >
        <div className="flex flex-col gap-6">
          <div className="flex items-start gap-4 p-5 bg-destructive/10 border border-destructive/20 rounded-[16px]">
            <AlertTriangle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2">
              <p className="text-[14px] text-destructive font-medium">
                {cancelModalPipeline ? t("purges.modals.cancelConfirm.body", {
                  category: t(`purges.categories.${cancelModalPipeline}.title`),
                }) : ""}
              </p>
              <p className="text-[13px] text-destructive/80">{t("purges.modals.cancelConfirm.warning")}</p>
            </div>
          </div>

          <div className="flex justify-end gap-4 mt-2 pt-6 border-t border-border-dim">
            <Button
              variant="ghost"
              onClick={closeCancelModal}
              className="rounded-[10px] hover:bg-foreground/5"
            >
              {t("purges.modals.cancelConfirm.cancel")}
            </Button>
            <WriteButton
              onClick={confirmCancelPurge}
              disabled={isCancelRunning}
              className="px-6 py-2.5 rounded-[10px] bg-destructive text-white font-medium hover:bg-destructive/90 transition-all shadow-xl shadow-destructive/20 text-[13px] flex items-center gap-2 disabled:opacity-50"
            >
              {isCancelRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-3.5 h-3.5 fill-white" />}
              {t("purges.modals.cancelConfirm.confirm")}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
