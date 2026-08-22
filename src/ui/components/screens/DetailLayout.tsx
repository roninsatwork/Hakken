"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";
import { LAYER } from "@/src/ui/lib/layers";
import { DetailTabs, type DetailTab } from "./DetailTabs";

type AdminDetailLayoutProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: ReactNode;
  headerClassName?: string;
  leading?: ReactNode;
  rootHref: string;
  tabs: DetailTab[];
  title: ReactNode;
};

export function DetailLayout({
  actions,
  children,
  className,
  contentClassName,
  description,
  headerClassName,
  leading,
  rootHref,
  tabs,
  title,
}: AdminDetailLayoutProps) {
  return (
    <div className={cn("flex flex-col gap-6 w-full h-full pl-2", className)}>
      {/* Above the page body so the tab dropdowns clear it, but below the app
          header, which owns the account menu. Raised to the sidebar's level
          this block sat over that menu, and "Back to Agents" drew straight
          through it. PAGE_CHROME is defined below HEADER, so the role now
          guarantees what the hand-picked number only happened to get right. */}
      <div className={cn("flex flex-col gap-6 relative", LAYER.PAGE_CHROME, headerClassName)}>
        {/* Tabbed sections share the ruled-header anatomy (2026-08-22
            decision): title, rule, then the tab strip. */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border-dim pb-6">
          <div className="flex items-center gap-4 min-w-0">
            {leading}
            <div className="flex flex-col gap-0.5 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                {title}
              </h1>
              {description ? (
                <p className="text-[13px] text-secondary mt-1 max-w-[500px] truncate">
                  {description}
                </p>
              ) : null}
            </div>
          </div>

          {actions ? <div className={cn("flex items-center gap-3", LAYER.PAGE_CHROME)}>{actions}</div> : null}
        </header>

        <DetailTabs tabs={tabs} rootHref={rootHref} />
      </div>

      <div
        className={cn(
          "relative flex-1 flex flex-col min-h-0 bg-transparent pt-4",
          LAYER.CONTENT,
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
