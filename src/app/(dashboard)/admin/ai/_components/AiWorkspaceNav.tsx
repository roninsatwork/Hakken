"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BrainCircuit,
  Check,
  ChevronDown,
  Cpu,
  Database,
  List,
  MessageSquareCode,
  MessageSquareText,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

import { cn } from "@/src/ui/lib/utils";

const governanceItems = [
  {
    label: "Rules",
    href: "/admin/ai/governance/rules",
    icon: ShieldCheck,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/governance/rules")
      || pathname.startsWith("/admin/ai/rules")
    ),
  },
  {
    label: "System Prompt",
    href: "/admin/ai/governance/system-prompt",
    icon: TerminalSquare,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/governance/system-prompt")
      || pathname.startsWith("/admin/ai/system-prompt")
    ),
  },
  {
    label: "Global Knowledge",
    href: "/admin/ai/knowledge",
    icon: Database,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/knowledge")
      || pathname.startsWith("/admin/ai/global-knowledge")
    ),
  },
];

function isModelDetailRoute(pathname: string) {
  if (!/^\/admin\/ai\/models\/[^/]+$/.test(pathname)) return false;

  const routeSegment = pathname.split("/").at(-1);
  return routeSegment !== "providers" && routeSegment !== "catalogue" && routeSegment !== "defaults";
}

const modelItems = [
  {
    label: "Providers",
    href: "/admin/ai/models/providers",
    icon: BrainCircuit,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/models/providers"),
  },
  {
    label: "Model Catalogue",
    href: "/admin/ai/models/catalogue",
    icon: List,
    matches: (pathname: string) => (
      pathname === "/admin/ai/models"
      || pathname.startsWith("/admin/ai/models/catalogue")
      || isModelDetailRoute(pathname)
    ),
  },
  {
    label: "Defaults",
    href: "/admin/ai/models/defaults",
    icon: Cpu,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/models/defaults"),
  },
];

const workspaceTabs = [
  {
    label: "Running Costs",
    href: "/admin/ai/usage/costs",
    icon: BarChart3,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/usage/costs")
      || pathname.startsWith("/admin/ai/costs")
    ),
  },
  {
    label: "Chat Logs",
    href: "/admin/ai/usage/chat-logs",
    icon: MessageSquareText,
    matches: (pathname: string) => (
      pathname.startsWith("/admin/ai/usage/chat-logs")
      || pathname.startsWith("/admin/ai/chat-logs")
    ),
  },
  {
    label: "Widget",
    href: "/admin/ai/widget",
    icon: MessageSquareCode,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/widget"),
  },
  {
    label: "Models",
    href: "/admin/ai/models",
    icon: BrainCircuit,
    matches: (pathname: string) => pathname.startsWith("/admin/ai/models"),
  },
];

export function AiWorkspaceNav() {
  const pathname = usePathname() || "/admin/ai";
  const [isGovernanceOpen, setIsGovernanceOpen] = useState(false);
  const [isModelsOpen, setIsModelsOpen] = useState(false);
  const governanceRef = useRef<HTMLDivElement>(null);
  const modelsRef = useRef<HTMLDivElement>(null);
  const activeGovernanceItem = governanceItems.find((item) => item.matches(pathname));
  const isGovernanceActive = Boolean(activeGovernanceItem);
  const isModelsActive = pathname.startsWith("/admin/ai/models");

  useEffect(() => {
    if (!isGovernanceOpen && !isModelsOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (governanceRef.current && !governanceRef.current.contains(event.target as Node)) {
        setIsGovernanceOpen(false);
      }
      if (modelsRef.current && !modelsRef.current.contains(event.target as Node)) {
        setIsModelsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsGovernanceOpen(false);
        setIsModelsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isGovernanceOpen, isModelsOpen]);

  return (
    <nav
      aria-label="Artificial intelligence sections"
      className="flex items-center gap-1 border-b border-border-dim/50 pb-px"
    >
      {workspaceTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.matches(pathname);

        return (
          <div key={tab.href} className={cn("shrink-0", tab.label === "Widget" && "flex items-center gap-1")}>
            {tab.label === "Widget" && (
              <div ref={governanceRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-expanded={isGovernanceOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsModelsOpen(false);
                    setIsGovernanceOpen((current) => !current);
                  }}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap",
                    isGovernanceActive
                      ? "border-brand bg-brand/5 text-brand"
                      : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Governance</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isGovernanceOpen && "rotate-180")} />
                </button>

                {isGovernanceOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-2 w-[240px] overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl"
                  >
                    {governanceItems.map((item) => {
                      const ItemIcon = item.icon;
                      const isItemActive = item.matches(pathname);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setIsGovernanceOpen(false)}
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
                          {isItemActive && <Check className="h-4 w-4 shrink-0" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {tab.label === "Models" ? (
              <div ref={modelsRef} className="relative shrink-0">
                <button
                  type="button"
                  aria-expanded={isModelsOpen}
                  aria-haspopup="menu"
                  onClick={() => {
                    setIsGovernanceOpen(false);
                    setIsModelsOpen((current) => !current);
                  }}
                  className={cn(
                    "flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap",
                    isModelsActive
                      ? "border-brand bg-brand/5 text-brand"
                      : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
                  )}
                >
                  <BrainCircuit className="h-4 w-4" />
                  <span>Models</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isModelsOpen && "rotate-180")} />
                </button>

                {isModelsOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full z-40 mt-2 w-[240px] overflow-hidden rounded-[10px] border border-border-dim bg-card shadow-2xl"
                  >
                    {modelItems.map((item) => {
                      const ItemIcon = item.icon;
                      const isItemActive = item.matches(pathname);

                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          role="menuitem"
                          onClick={() => setIsModelsOpen(false)}
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
                          {isItemActive && <Check className="h-4 w-4 shrink-0" />}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <Link
                href={tab.href}
                className={cn(
                  "flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </Link>
            )}
          </div>
        );
      })}
    </nav>
  );
}
