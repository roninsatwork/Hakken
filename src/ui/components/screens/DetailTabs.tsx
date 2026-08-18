"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { Check, ChevronDown } from "lucide-react";

import { cn } from "@/src/ui/lib/utils";
import { LAYER } from "@/src/ui/lib/layers";

type AdminDetailTabIcon = ComponentType<{ className?: string }>;

export type DetailDropdownItem = {
  href: string;
  icon: AdminDetailTabIcon;
  label: string;
  matches?: (pathname: string, searchParams: URLSearchParams) => boolean;
  query?: Record<string, string>;
};

export type DetailTab = {
  dropdownItems?: DetailDropdownItem[];
  href: string;
  icon: AdminDetailTabIcon;
  label: string;
  matches?: (pathname: string, searchParams: URLSearchParams) => boolean;
};

type AdminDetailTabsProps = {
  tabs: DetailTab[];
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
  item: DetailDropdownItem,
  parentHref: string
) {
  if (item.matches) return item.matches(pathname, searchParams);

  const hrefPath = getHrefPath(item.href);
  const parentPath = getHrefPath(parentHref);
  if (!hasMatchingQuery(searchParams, item.query)) return false;
  if (hrefPath === parentPath) return pathname === hrefPath;
  return pathname === hrefPath || pathname.startsWith(`${hrefPath}/`);
}

const MENU_WIDTH = 240;

export function DetailTabs({ tabs, rootHref }: AdminDetailTabsProps) {
  const pathname = usePathname() || rootHref;
  const readonlySearchParams = useSearchParams();
  const searchParams = new URLSearchParams(readonlySearchParams?.toString());
  const [openTabHref, setOpenTabHref] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openTriggerRef = useRef<HTMLButtonElement | null>(null);

  /**
   * The menu is fixed to the viewport and measured from its tab, the same way
   * `TableFilterSelect` places its panel. It used to hang absolutely under the
   * tab, which forced the whole row to `overflow-visible` so the menu would not
   * be clipped — and a row that cannot scroll runs off the right-hand edge of a
   * phone with the far tabs unreachable. Fixed placement frees the row to
   * scroll at every width; clamping `left` keeps the menu on screens narrower
   * than it would like.
   */
  const measure = useCallback(() => {
    const trigger = openTriggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)),
    });
  }, []);

  // No clearing on close: the menu only renders while a tab is open, so a
  // stale anchor is never visible, and this runs before paint — a reopened
  // menu is measured before the browser draws it. Clearing here instead set
  // state inside an effect, which cascades a render for no gain.
  useLayoutEffect(() => {
    if (!openTabHref) return;
    measure();
  }, [openTabHref, measure]);

  useEffect(() => {
    if (!openTabHref) return;

    // The menu no longer lives inside the row, so "outside" is now both.
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (navRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpenTabHref(null);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenTabHref(null);
      }
    }

    // A fixed menu does not travel with the page or the row, so any scroll —
    // including sideways in the row itself — has to re-place it.
    function handleReflow() {
      measure();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleReflow, true);
    window.addEventListener("resize", handleReflow);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleReflow, true);
      window.removeEventListener("resize", handleReflow);
    };
  }, [openTabHref, measure]);

  return (
    <div
      ref={navRef}
      className="flex items-center gap-1 border-b border-border-dim/50 pb-px mt-2 overflow-x-auto custom-scrollbar"
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
                onClick={(event) => {
                  openTriggerRef.current = event.currentTarget;
                  setOpenTabHref((current) => (current === tab.href ? null : tab.href));
                }}
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

              {isOpen && anchor && (
                <div
                  ref={menuRef}
                  role="menu"
                  style={{ top: anchor.top, left: anchor.left, width: MENU_WIDTH }}
                  className={cn(
                    "fixed overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl",
                    // A menu opened out of page chrome, so it must clear every
                    // sibling bar. The hand-picked number this used to carry
                    // read as "above everything", but it sits inside
                    // DetailLayout's own stacking context and never escaped it,
                    // so only the local order was ever real.
                    LAYER.PAGE_MENU,
                  )}
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
