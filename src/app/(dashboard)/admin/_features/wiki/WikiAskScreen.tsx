"use client";

import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { WikiAskBox } from "./WikiAskBox";

/**
 * Ask the wiki (wiki-sonae-catch-up-plan-2026-11-21.md, S6, from the upstream
 * framework's `be63693c`): the wiki's Ask box from its long page, as a page of
 * its own. With `companyId` it asks that company's wiki. A page inside a
 * section, so its header draws no rule.
 */
export function WikiAskScreen({ basePath, companyId }: { basePath: string; companyId?: Id<"companies"> }) {
  const t = useTranslations("aiPages");
  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-12">
      <PageHeader
        icon={<MessageCircle className="h-6 w-6 text-brand" />}
        title={t("askScreen.title")}
        description={t("ask.hint")}
      />
      <WikiAskBox companyId={companyId} basePath={basePath} />
    </div>
  );
}
