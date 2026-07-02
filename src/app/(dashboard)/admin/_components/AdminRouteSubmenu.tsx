"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

type AdminRouteSubmenuItem = {
  href: string;
  label: string;
};

type AdminRouteSubmenuProps = {
  compactLabel?: string;
  items: AdminRouteSubmenuItem[];
  label: string;
  mode?: "auto" | "compactAlways" | "compactOnly" | "wideOnly";
};

function getActiveSubmenuHref(pathname: string, items: AdminRouteSubmenuItem[]) {
  const matches = items.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

function useWideSubmenuLayout() {
  const [isWide, setIsWide] = useState(() => (
    typeof window !== "undefined"
    && "matchMedia" in window
    && window.matchMedia("(min-width: 1536px)").matches
  ));

  useEffect(() => {
    if (!("matchMedia" in window)) return;

    const mediaQuery = window.matchMedia("(min-width: 1536px)");
    const handleChange = () => setIsWide(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener("change", handleChange);

    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return isWide;
}

export function AdminRouteSubmenu({ compactLabel, items, label, mode = "auto" }: AdminRouteSubmenuProps) {
  const pathname = usePathname();
  const isWideLayout = useWideSubmenuLayout();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeHref = getActiveSubmenuHref(pathname, items);
  const activeItem = items.find((item) => item.href === activeHref) ?? items[0];
  const selectorLabel = compactLabel ?? label;
  const shouldRenderCompact = mode === "compactAlways" || mode === "compactOnly" || (mode === "auto" && !isWideLayout);
  const shouldRenderWide = mode === "wideOnly" || (mode === "auto" && isWideLayout);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  if (mode === "compactOnly" && isWideLayout) return null;
  if (mode === "wideOnly" && !isWideLayout) return null;

  if (shouldRenderCompact) {
    return (
      <div ref={containerRef} className="relative z-30 w-full self-start">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={`${selectorLabel}: ${activeItem?.label ?? "Select section"}`}
          onClick={() => setIsOpen((current) => !current)}
          className="flex w-full max-w-full items-center justify-between gap-3 rounded-[10px] border border-border-dim bg-sidebar/50 px-4 py-3 text-left shadow-sm backdrop-blur-xl transition-colors hover:bg-sidebar/70 sm:w-[280px]"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-mono uppercase tracking-widest text-muted">{selectorLabel}</span>
            <span className="mt-0.5 block truncate text-[14px] font-semibold text-foreground">
              {activeItem?.label ?? "Select section"}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (
          <nav
            aria-label={label}
            className="absolute left-0 top-full mt-2 w-full overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl sm:w-[280px]"
          >
            {items.map((item) => {
              const isActive = activeHref === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center justify-between gap-3 px-4 py-3 text-[14px] font-medium transition-colors ${
                    isActive ? "bg-brand text-white" : "text-secondary hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && <Check className="h-4 w-4 shrink-0" />}
                </Link>
              );
            })}
          </nav>
        )}
      </div>
    );
  }

  if (!shouldRenderWide) return null;

  return (
    <nav
      aria-label={label}
      className="sticky top-6 flex w-[220px] shrink-0 flex-col overflow-hidden rounded-[16px] border border-border-dim bg-sidebar/40 pt-2 pb-2 shadow-sm backdrop-blur-xl"
    >
      {items.map((item) => {
        const isActive = activeHref === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-left px-5 py-3.5 text-[14px] font-medium transition-colors ${
              isActive ? "bg-brand text-white" : "text-secondary hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
