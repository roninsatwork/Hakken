"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";

type AdminDetailTabIcon = ComponentType<{ className?: string }>;

export type AdminDetailTab = {
  href: string;
  icon: AdminDetailTabIcon;
  label: string;
};

type AdminDetailTabsProps = {
  tabs: AdminDetailTab[];
  rootHref: string;
};

function isActiveTab(pathname: string, href: string, rootHref: string) {
  return href === rootHref ? pathname === href : pathname.startsWith(href);
}

export function AdminDetailTabs({ tabs, rootHref }: AdminDetailTabsProps) {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 border-b border-border-dim/50 overflow-x-auto custom-scrollbar pb-px mt-2">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = isActiveTab(pathname, tab.href, rootHref);

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap ${
              isActive
                ? "border-brand text-brand bg-brand/5"
                : "border-transparent text-secondary hover:text-foreground hover:border-foreground/30"
            } rounded-t-[8px]`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
