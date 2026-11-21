"use client";

import { Suspense } from "react";
import { useTranslations } from "next-intl";
import { FilePlus2 } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { WikiImportBox } from "./WikiImportBox";
import { WikiReadingProgress } from "./WikiReadingProgress";

/**
 * Add to the wiki (wiki-sonae-catch-up-plan-2026-11-21.md, S6, from the
 * upstream framework's `be63693c`): the import box that sat near the top of the
 * wiki's long page, on a page of its own, with the reading progress under it
 * while the wiki reads. With `companyId` it adds to that company's wiki alone,
 * and its notice says so.
 *
 * A page inside a section (the AI frame, or a company's), so its `PageHeader`
 * draws no rule (docs/developer/screen-kit.md, "Headers").
 */
export function WikiAddScreen({ companyId }: { companyId?: Id<"companies"> }) {
  const t = useTranslations("aiPages");
  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-12">
      <PageHeader
        icon={<FilePlus2 className="h-6 w-6 text-brand" />}
        title={t("addScreen.title")}
        description={t("addScreen.description")}
      />
      <Notice>
        <p>{companyId ? t("scopeCompany") : t("globalHint")}</p>
      </Notice>
      {/* The tabs read `?kind=` from the address, which waits for the browser. */}
      <Suspense fallback={null}>
        <WikiImportBox companyId={companyId} />
      </Suspense>
      <WikiReadingProgress companyId={companyId} />
    </div>
  );
}
