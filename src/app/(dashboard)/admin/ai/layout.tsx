"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AiFrame } from "./_components/AiFrame";
import { isAiRecordPath } from "./_components/aiMenu";

/**
 * Every Artificial Intelligence screen inside the AI frame: the section's
 * title, its rule and the menu down the left (wiki-sonae-catch-up-plan-
 * 2026-11-21.md, S0). The screens used to draw a row of tabs and drop-downs
 * across their tops. Pages about one record (a rule, an eval, a wiki page, a
 * model, a tool) stand on their own with their back link and no menu.
 */
export default function GlobalAiLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  return <AiFrame show={!isAiRecordPath(pathname)}>{children}</AiFrame>;
}
