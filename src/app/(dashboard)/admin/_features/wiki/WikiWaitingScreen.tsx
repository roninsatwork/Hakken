"use client";

import { useTranslations } from "next-intl";
import { Inbox } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { WikiWaitingList } from "./WikiWaitingList";

/**
 * Waiting on you (wiki-sonae-catch-up-plan-2026-11-21.md, S6, from the upstream
 * framework's `be63693c`): the wiki's imports to review and its open
 * questions, together on a page of their own. With `companyId` they are that
 * company's. A page inside a section, so its header draws no rule.
 */
export function WikiWaitingScreen({ basePath, companyId }: { basePath: string; companyId?: Id<"companies"> }) {
  const t = useTranslations("aiPages.waitingScreen");
  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-12">
      <PageHeader icon={<Inbox className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      <WikiWaitingList companyId={companyId} basePath={basePath} />
    </div>
  );
}
