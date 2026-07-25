"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleDot, ExternalLink } from "lucide-react";
import type { SystemSettingsFormData } from "./types";

type TranslationFn = (key: string) => string;

type ReadinessStatus = "ready" | "pending" | "manual";

type ReadinessItem = {
  key: string;
  status: ReadinessStatus;
  href?: string;
  command?: string;
  evidence?: string;
};

export type WhiteLabelReadiness = {
  score: number;
  readyCount: number;
  pendingCount: number;
  manualCount: number;
  totalCount: number;
  items: ReadinessItem[];
  nextActions: string[];
};

type WhiteLabelReadinessSectionProps = {
  formData: SystemSettingsFormData;
  readiness?: WhiteLabelReadiness;
  t: TranslationFn;
};

const DEFAULT_PLATFORM_NAMES = new Set(["sonae"]);

function isPresent(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isHexColor(value: unknown) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isLikelyEmailAddress(value: unknown) {
  return typeof value === "string" && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim());
}

function getStatusStyles(status: ReadinessStatus) {
  if (status === "ready") {
    return {
      icon: CheckCircle2,
      labelClass: "text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20",
      rowClass: "border-[#10B981]/20",
    };
  }

  if (status === "manual") {
    return {
      icon: CircleDot,
      labelClass: "text-brand bg-brand/10 border-brand/20",
      rowClass: "border-brand/20",
    };
  }

  return {
    icon: AlertCircle,
    labelClass: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    rowClass: "border-amber-500/20",
  };
}

function buildLocalReadiness(formData: SystemSettingsFormData): WhiteLabelReadiness {
  const platformName = typeof formData.platformName === "string" ? formData.platformName.trim() : "";
  const hasCustomName = platformName.length > 0 && !DEFAULT_PLATFORM_NAMES.has(platformName.toLowerCase());
  const hasEmailSender = isLikelyEmailAddress(formData.emailSenderAddress);

  const items: ReadinessItem[] = [
    // Each row already named the tab that fixes it — "Set a customer-facing
    // product name in Core Identity" — and then made the reader go and find it.
    {
      key: "identity",
      status: hasCustomName ? "ready" : "pending",
      href: "/admin/settings?tab=identity",
    },
    {
      key: "logos",
      status: isPresent(formData.logoUrlLight) && isPresent(formData.logoUrlDark) ? "ready" : "pending",
      href: "/admin/settings?tab=appearance",
    },
    {
      key: "brandColor",
      status: isHexColor(formData.brandColorHex) ? "ready" : "pending",
      href: "/admin/settings?tab=appearance",
    },
    {
      key: "diagnostics",
      status: formData.diagnosticRoutingEnabled ? "pending" : "ready",
      href: "/admin/settings?tab=options",
    },
    {
      key: "widget",
      status: "pending",
      href: "/admin/ai/widget",
    },
    {
      key: "email",
      status: hasEmailSender ? "ready" : "manual",
      command: hasEmailSender ? undefined : "RESEND_FROM_EMAIL",
    },
    {
      key: "production",
      status: "manual",
      command: "npm run setup:validate -- --profile=production",
    },
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const manualCount = items.filter((item) => item.status === "manual").length;

  return {
    score: readyCount / items.length,
    readyCount,
    pendingCount,
    manualCount,
    totalCount: items.length,
    items,
    nextActions: items.filter((item) => item.status !== "ready").slice(0, 3).map((item) => item.key),
  };
}

export function WhiteLabelReadinessSection({ formData, readiness, t }: WhiteLabelReadinessSectionProps) {
  const resolvedReadiness = readiness ?? buildLocalReadiness(formData);
  const readinessPercent = Math.round(resolvedReadiness.score * 100);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="border border-border-dim rounded-[12px] bg-background/50 px-4 py-3">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted font-mono">{t("whiteLabel.summary.score")}</span>
          <span className="mt-1 block text-[24px] leading-none font-bold text-foreground">{readinessPercent}%</span>
          {/* A bare percentage invites the question it does not answer. */}
          <span className="mt-1 block text-[11px] text-muted">
            {resolvedReadiness.readyCount} of {resolvedReadiness.totalCount} checks pass
          </span>
        </div>
        <div className="border border-border-dim rounded-[12px] bg-background/50 px-4 py-3">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted font-mono">{t("whiteLabel.summary.ready")}</span>
          <span className="mt-1 block text-[24px] leading-none font-bold text-foreground">{resolvedReadiness.readyCount}</span>
        </div>
        <div className="border border-border-dim rounded-[12px] bg-background/50 px-4 py-3">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted font-mono">{t("whiteLabel.summary.pending")}</span>
          <span className="mt-1 block text-[24px] leading-none font-bold text-foreground">{resolvedReadiness.pendingCount}</span>
        </div>
        <div className="border border-border-dim rounded-[12px] bg-background/50 px-4 py-3">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted font-mono">{t("whiteLabel.summary.manual")}</span>
          <span className="mt-1 block text-[24px] leading-none font-bold text-foreground">{resolvedReadiness.manualCount}</span>
          <span className="mt-1 block text-[11px] text-muted">{t("whiteLabel.summary.manualHint")}</span>
        </div>
      </div>

      <div className="border border-border-dim rounded-[16px] overflow-hidden">
        {resolvedReadiness.items.map((item, index) => {
          const styles = getStatusStyles(item.status);
          const Icon = styles.icon;
          const descriptionKey = item.status === "ready" ? "ready" : item.status === "pending" ? "pending" : "manual";
          return (
            <div
              key={item.key}
              className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-background/50 ${index === 0 ? "" : "border-t border-border-dim"} ${styles.rowClass}`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-current" />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[14px] text-foreground font-semibold">{t(`whiteLabel.items.${item.key}.label`)}</span>
                  <span className="text-[12px] text-muted leading-relaxed">{t(`whiteLabel.items.${item.key}.${descriptionKey}`)}</span>
                  {item.evidence && (
                    // A machine value — "missing-logo-variant", "#E26D28" —
                    // useful when someone asks why, but not part of the sentence.
                    <span className="text-[10px] font-mono text-muted/60">
                      {t("whiteLabel.detected")}: {item.evidence}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 lg:justify-end">
                {item.href && (
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand/80"
                  >
                    {t("whiteLabel.fixThis")}
                    <ExternalLink className="w-3 h-3" />
                  </Link>
                )}
                {item.command && (
                  <code className="rounded-[8px] border border-border-dim bg-card/70 px-2.5 py-1 text-[11px] text-secondary break-all">
                    {item.command}
                  </code>
                )}
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${styles.labelClass}`}>
                  {t(`whiteLabel.status.${item.status}`)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
