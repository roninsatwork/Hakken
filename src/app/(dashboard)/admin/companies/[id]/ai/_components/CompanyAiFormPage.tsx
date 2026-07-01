"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
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
  return (
    <header className="flex flex-col gap-4">
      <Link
        href={backHref}
        className="inline-flex h-8 w-fit items-center gap-2 rounded-[8px] border border-border-dim bg-background/50 px-3 text-[12px] font-semibold text-secondary transition-colors hover:border-brand/30 hover:bg-brand/5 hover:text-brand"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back
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
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-border-dim pt-5 sm:flex-row sm:justify-end">
      <Link
        href={backHref}
        className="inline-flex h-9 items-center justify-center rounded-[8px] px-4 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground"
      >
        Cancel
      </Link>
      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-9 items-center justify-center rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  );
}
