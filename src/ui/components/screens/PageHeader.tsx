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
    <div data-part="page-header" className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4${divider ? " border-b border-border-dim pb-6" : ""}`}>
      <div>
        <div className="flex items-center gap-3">
          <h1 data-part-title className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            {icon}
            {title}
          </h1>
        </div>
        {description ? <p className="text-[13px] text-secondary mt-1 tracking-wide">{description}</p> : null}
        {pills ? <div className="flex flex-wrap items-center gap-2 mt-2.5">{pills}</div> : null}
      </div>

      {action}
    </div>
  );
}

type AdminDetailHeaderProps = Omit<AdminPageHeaderProps, "divider" | "icon"> & {
  /**
   * Where the quiet "← Back to …" row leads; `onClick` for history-driven
   * backs. `page` is the name of the page it leads to, which the `path`
   * layout shows as "Fan-out queries /"; without one it falls back to the row.
   */
  back: { label: string; href?: string; onClick?: () => void; page?: string };
  /** The record's icon, beside the title. The `path` layout has none. */
  icon?: ReactNode;
  /**
   * `stacked`, the default: the back row, then the standard title block.
   * `path`: a search's page in Sites (Anthony chose "B" on 2026-09-29, from
   * a drawing of that page, for that page alone): the way back as a quiet path
   * above the title, the labels on the title row to the right, and one
   * sentence about this record under it — no icon, and no box repeating the
   * labels.
   * `compact`: the standard website header (Anthony, 2026-10-30, on the
   * Conversions canvas; before it, docs/plans/active/ga-header-plan.md): the
   * website's name on its own row, then one row with its status label
   * (`pills`, "Updated …") on the left and the page's filters (`action`) on
   * the right. It draws no description and no note: the property line and
   * the "figures to" line were dropped as clutter ("the header is getting
   * very cluttered"), and the eye lives in the top bar (`Header`). Every
   * section with a website wears it; `src/website-header-drift.test.ts`
   * holds that.
   */
  layout?: "stacked" | "path" | "compact";
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
export function DetailHeader({ back, layout = "stacked", icon, ...headerProps }: AdminDetailHeaderProps) {
  if (layout === "path") return <PathHeader back={back} {...headerProps} />;
  if (layout === "compact") return <CompactHeader back={back} icon={icon} {...headerProps} />;
  return (
    <div data-part="detail-header" className="flex flex-col gap-3">
      <BackRow {...back} />
      <PageHeader icon={icon} {...headerProps} divider />
    </div>
  );
}

/**
 * The `path` layout of `DetailHeader`. The labels share the title's row, on
 * the right, and fall beneath it when the row is too narrow; the sentence
 * under the title is about this record, so it carries none of the stock
 * description's letter-spacing.
 */
function PathHeader({ back, title, description, pills, action }: Omit<AdminDetailHeaderProps, "layout" | "icon">) {
  return (
    <div data-part="detail-header" data-part-variant="path" className="flex flex-col gap-2 border-b border-border-dim pb-6">
      {back.page && back.href ? (
        <Link data-part="back" data-part-label={back.page} href={back.href} aria-label={back.label} className={cn(BACK_ROW_CLASSES, "gap-1.5")}>
          {back.page}
          <span aria-hidden="true" className="text-muted">/</span>
        </Link>
      ) : (
        <BackRow {...back} />
      )}
      <div className="flex flex-col gap-x-6 gap-y-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <h1 data-part-title className="min-w-0 break-words text-2xl font-bold tracking-tight text-foreground">{title}</h1>
        </div>
        {pills || action ? (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
            {pills}
            {action}
          </div>
        ) : null}
      </div>
      {description ? <p className="max-w-2xl text-[13px] leading-relaxed text-secondary">{description}</p> : null}
    </div>
  );
}

/**
 * The `compact` layout of `DetailHeader`: the standard website header. The
 * name has its row to itself, so a long one has the width ("to give space
 * for long URLs"); the status label and the filters share the row under it,
 * the filters on the right, and go under the label on a phone. Whatever a
 * caller passes as `description` is not drawn: the line went on 2026-10-30.
 */
function CompactHeader({ back, icon, title, pills, action }: Omit<AdminDetailHeaderProps, "layout">) {
  return (
    <div data-part="detail-header" data-part-variant="compact" className="flex flex-col gap-3">
      <BackRow {...back} />
      <div data-part="page-header" className="flex flex-col gap-3 border-b border-border-dim pb-6">
        <div className="flex min-w-0 items-center gap-3">
          <h1 data-part-title className="flex min-w-0 items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            {icon}
            {title}
          </h1>
        </div>
        {pills || action ? (
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">{pills}</div>
            {action}
          </div>
        ) : null}
      </div>
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
    <Link data-part="back" data-part-label={label} href={href} className={BACK_ROW_CLASSES}>
      <ArrowLeft className="w-3.5 h-3.5" />
      {label}
    </Link>
  ) : (
    <Button
      data-part="back"
      data-part-label={label}
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
      data-part="primary-action"
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
