"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import type { WidgetConfigTab } from "./types";
import { WIDGET_CONFIG_TABS } from "./widgetConfigUtils";

type WidgetConfigTabsProps = {
  activeTab: WidgetConfigTab;
  onTabChange: (tab: WidgetConfigTab) => void;
};

function useWideWidgetTabLayout() {
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

export function WidgetConfigTabs({ activeTab, onTabChange }: WidgetConfigTabsProps) {
  const isWideLayout = useWideWidgetTabLayout();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  if (!isWideLayout) {
    return (
      <div ref={containerRef} className="relative z-30 w-full self-start">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-haspopup="menu"
          aria-label={`Widget section: ${activeTab}`}
          onClick={() => setIsOpen((current) => !current)}
          className="flex w-full max-w-full items-center justify-between gap-3 rounded-[10px] border border-border-dim bg-sidebar/50 px-4 py-3 text-left shadow-sm backdrop-blur-xl transition-colors hover:bg-sidebar/70 sm:w-[280px]"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-mono uppercase tracking-widest text-muted">Widget section</span>
            <span className="mt-0.5 block truncate text-[14px] font-semibold text-foreground">{activeTab}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (
          <div className="absolute left-0 top-full mt-2 w-full overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl sm:w-[280px]">
            {WIDGET_CONFIG_TABS.map((tab) => {
              const isActive = activeTab === tab;

              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => {
                    onTabChange(tab);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-[14px] font-medium transition-colors ${
                    isActive ? "bg-brand text-white" : "text-secondary hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  <span>{tab}</span>
                  {isActive && <Check className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sticky top-6 flex w-[220px] shrink-0 flex-col overflow-hidden rounded-[16px] border border-border-dim bg-sidebar/40 pt-2 pb-2 shadow-sm backdrop-blur-xl">
      {WIDGET_CONFIG_TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onTabChange(tab)}
          className={`text-left px-5 py-3.5 text-[14px] font-medium transition-colors ${
            activeTab === tab ? "bg-brand text-white" : "text-secondary hover:text-foreground hover:bg-foreground/5"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
