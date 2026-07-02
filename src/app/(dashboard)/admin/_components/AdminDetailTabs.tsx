"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/src/ui/lib/utils";

type AdminDetailTabIcon = ComponentType<{ className?: string }>;

export type AdminDetailDropdownItem = {
  href: string;
  icon: AdminDetailTabIcon;
  label: string;
  matches?: (pathname: string, searchParams: URLSearchParams) => boolean;
  query?: Record<string, string>;
};

export type AdminDetailTab = {
  dropdownItems?: AdminDetailDropdownItem[];
  href: string;
  icon: AdminDetailTabIcon;
  label: string;
  matches?: (pathname: string, searchParams: URLSearchParams) => boolean;
};

type AdminDetailTabsProps = {
  tabs: AdminDetailTab[];
  rootHref: string;
};

function getHrefPath(href: string) {
  return href.split("?")[0];
}

function hasMatchingQuery(searchParams: URLSearchParams, query?: Record<string, string>) {
  if (!query) return true;

  return Object.entries(query).every(([key, value]) => searchParams.get(key) === value);
}

function isActiveTab(pathname: string, href: string, rootHref: string) {
  const hrefPath = getHrefPath(href);
  if (hrefPath === rootHref) return pathname === hrefPath;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

function isActiveDropdownItem(
  pathname: string,
  searchParams: URLSearchParams,
  item: AdminDetailDropdownItem,
  parentHref: string
) {
  if (item.matches) return item.matches(pathname, searchParams);

  const hrefPath = getHrefPath(item.href);
  const parentPath = getHrefPath(parentHref);
  if (!hasMatchingQuery(searchParams, item.query)) return false;
  if (hrefPath === parentPath) return pathname === hrefPath;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

export function AdminDetailTabs({ tabs, rootHref }: AdminDetailTabsProps) {
  const pathname = usePathname() || rootHref;
  const readonlySearchParams = useSearchParams();
  const searchParams = new URLSearchParams(readonlySearchParams?.toString());
  const [openTabHref, setOpenTabHref] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const hasDropdownTabs = tabs.some((tab) => tab.dropdownItems);

  useEffect(() => {
    if (!openTabHref) return;

    function handlePointerDown(event: PointerEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenTabHref(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenTabHref(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openTabHref]);

  return (
    <div
      ref={navRef}
      className={cn(
        "flex items-center gap-1 border-b border-border-dim/50 pb-px mt-2",
        hasDropdownTabs ? "overflow-visible" : "overflow-x-auto custom-scrollbar"
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const activeDropdownItem = tab.dropdownItems?.find((item) => isActiveDropdownItem(pathname, searchParams, item, tab.href));
        const isActive = Boolean(tab.matches?.(pathname, searchParams) || activeDropdownItem || isActiveTab(pathname, tab.href, rootHref));

        if (tab.dropdownItems) {
          const isOpen = openTabHref === tab.href;

          return (
            <div key={tab.href} className="relative shrink-0">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-haspopup="menu"
                onClick={() => setOpenTabHref((current) => current === tab.href ? null : tab.href)}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-[100] mt-2 w-[240px] overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl"
                >
                  {tab.dropdownItems.map((item) => {
                    const ItemIcon = item.icon;
                    const isItemActive = isActiveDropdownItem(pathname, searchParams, item, tab.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        role="menuitem"
                        onClick={() => setOpenTabHref(null)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors",
                          isItemActive
                            ? "bg-brand text-white"
                            : "text-secondary hover:bg-foreground/5 hover:text-foreground"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ItemIcon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.label}</span>
                        </span>
                        {isItemActive && <Check aria-label={`${item.label} selected`} className="h-4 w-4 shrink-0" />}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

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
