"use client";

import { AlertCircle, CheckCircle2, Mail, Palette, PackageCheck } from "lucide-react";
import type { SystemSettingsFormData } from "./types";

type TranslationFn = (key: string) => string;

export type WhiteLabelHandoffSummary = {
  productName: string;
  brandColorHex: string;
  readinessScore: number;
  logoMode: "light-and-dark" | "partial" | "missing";
  emailFromAddress: string;
  widgetStatus: "ready" | "needs-review";
  widgetEvidence: string;
  diagnosticsStatus: "ready" | "needs-review";
  productionStatus: "manual";
  nextActions: string[];
  recommendedPresetKeys: string[];
};

type WhiteLabelHandoffSummarySectionProps = {
  formData: SystemSettingsFormData;
  summary?: WhiteLabelHandoffSummary;
  t: TranslationFn;
};

function isPresent(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function buildLocalSummary(formData: SystemSettingsFormData): WhiteLabelHandoffSummary {
  const productName = isPresent(formData.platformName) ? String(formData.platformName).trim() : "Sonae";
  const hasLightLogo = isPresent(formData.logoUrlLight);
  const hasDarkLogo = isPresent(formData.logoUrlDark);
  const logoMode = hasLightLogo && hasDarkLogo ? "light-and-dark" : hasLightLogo || hasDarkLogo ? "partial" : "missing";
  const senderAddress = isPresent(formData.emailSenderAddress) ? String(formData.emailSenderAddress).trim() : "noreply@ronins.co.uk";
  const senderName = isPresent(formData.emailSenderName) ? String(formData.emailSenderName).trim() : productName;

  return {
    productName,
    brandColorHex: isPresent(formData.brandColorHex) ? String(formData.brandColorHex) : "#E26D28",
    readinessScore: 0,
    logoMode,
    emailFromAddress: `${senderName} <${senderAddress}>`,
    widgetStatus: "needs-review",
    widgetEvidence: "needs-widget-branding-review",
    diagnosticsStatus: formData.diagnosticRoutingEnabled ? "needs-review" : "ready",
    productionStatus: "manual",
    nextActions: [],
    recommendedPresetKeys: [],
  };
}

function statusClass(status: "ready" | "needs-review" | "manual") {
  if (status === "ready") return "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20";
  if (status === "manual") return "text-brand bg-brand/10 border-brand/20";
  return "text-amber-500 bg-amber-500/10 border-amber-500/20";
}

export function WhiteLabelHandoffSummarySection({ formData, summary, t }: WhiteLabelHandoffSummarySectionProps) {
  const resolvedSummary = summary ?? buildLocalSummary(formData);
  const readinessPercent = Math.round(resolvedSummary.readinessScore * 100);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <PackageCheck className="w-4 h-4 mt-0.5 text-brand flex-shrink-0" />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted">{t("handoffSummary.fields.product")}</span>
              <span className="text-[16px] font-semibold text-foreground break-words">{resolvedSummary.productName}</span>
              <span className="text-[12px] text-muted">{t(`handoffSummary.logoModes.${resolvedSummary.logoMode}`)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Palette className="w-4 h-4 text-muted flex-shrink-0" />
            <span className="w-5 h-5 rounded-[6px] border border-border-dim" style={{ backgroundColor: resolvedSummary.brandColorHex }} />
            <span className="text-[12px] font-mono text-secondary">{resolvedSummary.brandColorHex}</span>
          </div>
        </div>

        <div className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <Mail className="w-4 h-4 mt-0.5 text-brand flex-shrink-0" />
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted">{t("handoffSummary.fields.email")}</span>
              <span className="text-[13px] text-foreground break-all">{resolvedSummary.emailFromAddress}</span>
              <span className="text-[12px] text-muted">{t("handoffSummary.emailNote")}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border border-border-dim rounded-[16px] overflow-hidden">
        <HandoffRow
          label={t("handoffSummary.fields.readiness")}
          value={`${readinessPercent}%`}
          status={readinessPercent >= 80 ? "ready" : "needs-review"}
          statusLabel={readinessPercent >= 80 ? t("whiteLabel.status.ready") : t("whiteLabel.status.pending")}
        />
        <HandoffRow
          label={t("handoffSummary.fields.widget")}
          value={t(`handoffSummary.widget.${resolvedSummary.widgetStatus}`)}
          detail={resolvedSummary.widgetEvidence}
          status={resolvedSummary.widgetStatus}
          statusLabel={resolvedSummary.widgetStatus === "ready" ? t("whiteLabel.status.ready") : t("whiteLabel.status.pending")}
        />
        <HandoffRow
          label={t("handoffSummary.fields.diagnostics")}
          value={t(`handoffSummary.diagnostics.${resolvedSummary.diagnosticsStatus}`)}
          status={resolvedSummary.diagnosticsStatus}
          statusLabel={resolvedSummary.diagnosticsStatus === "ready" ? t("whiteLabel.status.ready") : t("whiteLabel.status.pending")}
        />
        <HandoffRow
          label={t("handoffSummary.fields.production")}
          value={t("handoffSummary.production.manual")}
          status="manual"
          statusLabel={t("whiteLabel.status.manual")}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <HandoffList
          title={t("handoffSummary.fields.nextActions")}
          empty={t("handoffSummary.empty.nextActions")}
          items={resolvedSummary.nextActions.map((item) => t(`whiteLabel.items.${item}.label`))}
        />
        <HandoffList
          title={t("handoffSummary.fields.recommendedPresets")}
          empty={t("handoffSummary.empty.recommendedPresets")}
          items={resolvedSummary.recommendedPresetKeys.map((item) => t(`modulePresets.presets.${item}.title`))}
        />
      </div>
    </div>
  );
}

function HandoffRow({
  label,
  value,
  detail,
  status,
  statusLabel,
}: {
  label: string;
  value: string;
  detail?: string;
  status: "ready" | "needs-review" | "manual";
  statusLabel: string;
}) {
  const Icon = status === "ready" ? CheckCircle2 : AlertCircle;

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 p-4 bg-background/50 border-b border-border-dim last:border-b-0">
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="w-4 h-4 mt-0.5 text-current flex-shrink-0" />
        <div className="flex flex-col gap-1 min-w-0">
          <span className="text-[12px] font-semibold text-foreground">{label}</span>
          <span className="text-[12px] text-secondary break-words">{value}</span>
          {detail && <span className="text-[10px] font-mono text-muted/80 break-all">{detail}</span>}
        </div>
      </div>
      <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${statusClass(status)}`}>
        {statusLabel}
      </span>
    </div>
  );
}

function HandoffList({ title, empty, items }: { title: string; empty: string; items: string[] }) {
  return (
    <div className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex flex-col gap-3">
      <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted">{title}</span>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {items.map((item) => (
            <li key={item} className="text-[12px] text-secondary leading-relaxed flex gap-2">
              <span className="mt-[7px] w-1 h-1 rounded-full bg-brand/70 flex-shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-[12px] text-muted">{empty}</span>
      )}
    </div>
  );
}
