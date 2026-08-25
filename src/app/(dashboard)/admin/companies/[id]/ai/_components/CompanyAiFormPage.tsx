"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

export function getSafeCompanyAiReturnTo(
  returnTo: string | null | undefined,
  companyId: string,
  fallbackHref: string
) {
  if (!returnTo) return fallbackHref;
  if (returnTo.includes("://") || returnTo.startsWith("//")) return fallbackHref;
  const companyPrefix = `/admin/companies/${companyId}`;
  return returnTo.startsWith(companyPrefix) ? returnTo : fallbackHref;
}

/**
 * The same guard for the platform's own AI screens, which have no company in
 * their address. A returnTo is a value from the address bar, so it may only
 * ever send the reader back inside /admin/ai.
 */
export function getSafeGlobalAiReturnTo(
  returnTo: string | null | undefined,
  fallbackHref: string
) {
  if (!returnTo) return fallbackHref;
  if (returnTo.includes("://") || returnTo.startsWith("//")) return fallbackHref;
  return returnTo.startsWith("/admin/ai") ? returnTo : fallbackHref;
}

type CompanyAiFormPageHeaderProps = {
  backHref: string;
  title: string;
  description: string;
  icon: ReactNode;
};

export function CompanyAiFormPageHeader({
  backHref,
  title,
  description,
  icon,
}: CompanyAiFormPageHeaderProps) {
  const t = useTranslations("common");
  return (
    <header className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex h-8 w-fit items-center gap-2 rounded-[8px] border border-border-dim bg-background/50 px-3 text-[12px] font-semibold text-secondary transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("back")}
      </Link>
      <div>
        <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
          {icon}
          {title}
        </h1>
        <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
          {description}
        </p>
      </div>
    </header>
  );
}

type CompanyAiFormActionsProps = {
  backHref: string;
  submitLabel: string;
  isSubmitting: boolean;
};

export function CompanyAiFormActions({
  backHref,
  submitLabel,
  isSubmitting,
}: CompanyAiFormActionsProps) {
  const t = useTranslations("common");
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border-dim pt-5 sm:flex-row sm:justify-end">
      <Link
        href={backHref}
        className="inline-flex h-9 items-center justify-center rounded-[8px] px-4 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        {t("cancel")}
      </Link>
      <Button
        variant="brand"
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-9 items-center justify-center rounded-[8px] font-semibold disabled:opacity-50"
      >
        {submitLabel}
      </Button>
    </div>
  );
}
