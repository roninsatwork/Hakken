"use client";

import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";
import { AdminDetailTabs, type AdminDetailTab } from "./AdminDetailTabs";

type AdminDetailLayoutProps = {
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: ReactNode;
  headerClassName?: string;
  leading?: ReactNode;
  rootHref: string;
  tabs: AdminDetailTab[];
  title: ReactNode;
};

export function AdminDetailLayout({
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
      <div className={cn("flex flex-col gap-6 relative z-50", headerClassName)}>
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
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

          {actions ? <div className="flex items-center gap-3 z-20">{actions}</div> : null}
        </header>

        <AdminDetailTabs tabs={tabs} rootHref={rootHref} />
      </div>

      <div
        className={cn(
          "relative z-0 flex-1 flex flex-col min-h-0 bg-transparent pt-4",
          contentClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
