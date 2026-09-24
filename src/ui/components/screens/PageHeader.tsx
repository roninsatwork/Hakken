"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "@/src/ui/components/screens/Button";
import { useCanWriteHere } from "./AccessLevel";

type AdminPageHeaderProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /**
   * Status chips under the description — a script's category and risk, a
   * document's format and state. Part of the Detail A header (2026-08-22):
   * pills belong in the title block, never woven into the title row.
   */
  pills?: ReactNode;
  /**
   * Rule under the title, for pages that carry a tab bar beneath it.
   *
   * The Artificial Intelligence pages had their own near-identical copy of this
   * component purely to add this line, and the Skill Center had a third copy
   * with no line at all. Opting in here converges the three without changing how
   * any other admin page looks.
   */
  divider?: boolean;
};

export function PageHeader({ icon, title, description, action, pills, divider = false }: AdminPageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4${divider ? " border-b border-border-dim pb-6" : ""}`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          {icon}
          {title}
        </h1>
        {description ? <p className="text-[13px] text-secondary mt-1 tracking-wide">{description}</p> : null}
        {pills ? <div className="flex flex-wrap items-center gap-2 mt-2.5">{pills}</div> : null}
      </div>

      {action}
    </div>
  );
}

type AdminDetailHeaderProps = Omit<AdminPageHeaderProps, "divider"> & {
  /** Where the quiet "← Back to …" row leads; `onClick` for history-driven backs. */
  back: { label: string; href?: string; onClick?: () => void };
};

const BACK_ROW_CLASSES =
  "inline-flex items-center gap-2 self-start text-[13px] text-secondary hover:text-foreground transition-colors";

/**
 * The record-level header — Detail A, chosen 2026-08-22.
 *
 * Every page that opens on top of a record (a rule editor, a script, a
 * schedule, a document) wears this: a quiet back row on its own line, then
 * the standard title block with the standard rule under it. The back row
 * lives up here rather than woven into the title row so the title starts at
 * the left edge exactly like every other admin page.
 */
export function DetailHeader({ back, ...headerProps }: AdminDetailHeaderProps) {
  return (
    <div className="flex flex-col gap-3">
      <BackRow {...back} />
      <PageHeader {...headerProps} divider />
    </div>
  );
}

/**
 * The quiet "← Back to …" row on its own. `DetailHeader` draws it above a
 * record's title; a list page opened from a link on another page — a figure
 * that opens the records behind it, on the client's Sites screens — draws it
 * alone above its own header, so the reader can return the way they came.
 */
export function BackRow({ label, href, onClick }: AdminDetailHeaderProps["back"]) {
  return href ? (
    <Link href={href} className={BACK_ROW_CLASSES}>
      <ArrowLeft className="w-3.5 h-3.5" />
      {label}
    </Link>
  ) : (
    <Button
      variant="ghost"
      onClick={onClick}
      className={cn(BACK_ROW_CLASSES, "px-0 py-0 rounded-none hover:bg-transparent")}
    >
      <ArrowLeft className="w-3.5 h-3.5" />
      {label}
    </Button>
  );
}

type AdminPagePrimaryActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  children: ReactNode;
  /**
   * Admin's ruled headers (2026-08-22 decision) carry a brand-orange action;
   * the app-side pages keep the white one until that side is looked at, which
   * is why this is opt-in rather than the default.
   */
  variant?: "primary" | "brand";
};

export function PagePrimaryAction({
  icon,
  children,
  className = "",
  type = "button",
  variant = "primary",
  ...buttonProps
}: AdminPagePrimaryActionProps) {
  const canWriteHere = useCanWriteHere();

  // Removed rather than disabled. A greyed-out button invites the reader to
  // work out why it will not press; nothing at all reads as "this screen is for
  // looking at", which is exactly what a read-only account is for.
  if (!canWriteHere) return null;

  return (
    <Button
      variant={variant}
      type={type}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-[13px] whitespace-nowrap disabled:cursor-not-allowed",
        className
      )}
      {...buttonProps}
    >
      {icon}
      <span>{children}</span>
    </Button>
  );
}
