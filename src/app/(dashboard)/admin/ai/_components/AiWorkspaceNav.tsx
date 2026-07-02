"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BrainCircuit,
  Database,
  MessageSquareCode,
  MessageSquareText,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

import { cn } from "@/src/ui/lib/utils";

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

  return (
    <nav
      aria-label="Artificial intelligence sections"
      className="flex items-center gap-1 overflow-x-auto border-b border-border-dim/50 pb-px custom-scrollbar"
    >
      {workspaceTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.matches(pathname);

        return (
          <Link
            key={tab.href}
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
        );
      })}
    </nav>
  );
}
