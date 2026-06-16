"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, CircleDot, ExternalLink } from "lucide-react";
import type { SystemSettingsFormData } from "./types";

type TranslationFn = (key: string) => string;

type ReadinessStatus = "ready" | "pending" | "manual";

type ReadinessItem = {
  key: string;
  label: string;
  description: string;
  status: ReadinessStatus;
  href?: string;
  command?: string;
};

type WhiteLabelReadinessSectionProps = {
  formData: SystemSettingsFormData;
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

export function WhiteLabelReadinessSection({ formData, t }: WhiteLabelReadinessSectionProps) {
  const platformName = typeof formData.platformName === "string" ? formData.platformName.trim() : "";
  const hasCustomName = platformName.length > 0 && !DEFAULT_PLATFORM_NAMES.has(platformName.toLowerCase());
  const hasEmailSender = isLikelyEmailAddress(formData.emailSenderAddress);

  const items: ReadinessItem[] = [
    {
      key: "identity",
      label: t("whiteLabel.items.identity.label"),
      description: hasCustomName
        ? t("whiteLabel.items.identity.ready")
        : t("whiteLabel.items.identity.pending"),
      status: hasCustomName ? "ready" : "pending",
    },
    {
      key: "logos",
      label: t("whiteLabel.items.logos.label"),
      description: isPresent(formData.logoUrlLight) && isPresent(formData.logoUrlDark)
        ? t("whiteLabel.items.logos.ready")
        : t("whiteLabel.items.logos.pending"),
      status: isPresent(formData.logoUrlLight) && isPresent(formData.logoUrlDark) ? "ready" : "pending",
    },
    {
      key: "brandColor",
      label: t("whiteLabel.items.brandColor.label"),
      description: isHexColor(formData.brandColorHex)
        ? t("whiteLabel.items.brandColor.ready")
        : t("whiteLabel.items.brandColor.pending"),
      status: isHexColor(formData.brandColorHex) ? "ready" : "pending",
    },
    {
      key: "diagnostics",
      label: t("whiteLabel.items.diagnostics.label"),
      description: formData.diagnosticRoutingEnabled
        ? t("whiteLabel.items.diagnostics.pending")
        : t("whiteLabel.items.diagnostics.ready"),
      status: formData.diagnosticRoutingEnabled ? "pending" : "ready",
    },
    {
      key: "widget",
      label: t("whiteLabel.items.widget.label"),
      description: t("whiteLabel.items.widget.manual"),
      status: "manual",
      href: "/admin/ai/widget",
    },
    {
      key: "email",
      label: t("whiteLabel.items.email.label"),
      description: hasEmailSender
        ? t("whiteLabel.items.email.ready")
        : t("whiteLabel.items.email.manual"),
      status: hasEmailSender ? "ready" : "manual",
      command: hasEmailSender ? undefined : "RESEND_FROM_EMAIL",
    },
    {
      key: "production",
      label: t("whiteLabel.items.production.label"),
      description: t("whiteLabel.items.production.manual"),
      status: "manual",
      command: "npm run setup:validate -- --profile=production",
    },
  ];

  const readyCount = items.filter((item) => item.status === "ready").length;
  const pendingCount = items.filter((item) => item.status === "pending").length;
  const manualCount = items.filter((item) => item.status === "manual").length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="border border-border-dim rounded-[12px] bg-background/50 px-4 py-3">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted font-mono">{t("whiteLabel.summary.ready")}</span>
          <span className="mt-1 block text-[24px] leading-none font-bold text-foreground">{readyCount}</span>
        </div>
        <div className="border border-border-dim rounded-[12px] bg-background/50 px-4 py-3">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted font-mono">{t("whiteLabel.summary.pending")}</span>
          <span className="mt-1 block text-[24px] leading-none font-bold text-foreground">{pendingCount}</span>
        </div>
        <div className="border border-border-dim rounded-[12px] bg-background/50 px-4 py-3">
          <span className="block text-[10px] uppercase tracking-[0.18em] text-muted font-mono">{t("whiteLabel.summary.manual")}</span>
          <span className="mt-1 block text-[24px] leading-none font-bold text-foreground">{manualCount}</span>
        </div>
      </div>

      <div className="border border-border-dim rounded-[16px] overflow-hidden">
        {items.map((item, index) => {
          const styles = getStatusStyles(item.status);
          const Icon = styles.icon;
          return (
            <div
              key={item.key}
              className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-5 bg-background/50 ${index === 0 ? "" : "border-t border-border-dim"} ${styles.rowClass}`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <Icon className="w-4 h-4 mt-0.5 flex-shrink-0 text-current" />
                <div className="flex flex-col gap-1 min-w-0">
                  <span className="text-[14px] text-foreground font-semibold">{item.label}</span>
                  <span className="text-[12px] text-muted leading-relaxed">{item.description}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 lg:justify-end">
                {item.href && (
                  <Link
                    href={item.href}
                    className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand/80"
                  >
                    {t("whiteLabel.open")}
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
