"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useConvex } from "convex/react";
import { useTranslations } from "next-intl";
import { Download, Target } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button, buttonClasses } from "@/src/ui/components/screens/Button";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";

const FOLDERS: Record<string, string> = {
  CUSTOMER: "customers",
  PRODUCT: "products",
  POLICY: "policies",
  ISSUE: "issues",
  SOURCE: "sources",
  GOAL: "goals",
};

/**
 * New goal and Download vault: the quiet buttons beside the wiki's title
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S6, from the upstream framework's
 * `be63693c`). All grey, because none of them is the page's one action. New
 * goal opens a page of its own rather than a pop-up. A company's wiki adds
 * Clear wiki at the end (`children`). The map has its own menu line now, so it
 * has no button here.
 */
export function WikiPagesActions({
  companyId,
  basePath,
  children,
}: {
  companyId?: Id<"companies">;
  basePath: string;
  children?: ReactNode;
}) {
  const t = useTranslations("aiPages");
  const canWrite = useCanWriteHere();
  const action = useAdminAction({ scope: "admin-wiki-pages" });
  const convex = useConvex();
  const isExporting = action.isBusy("export");

  // "Your brain is yours": the vault is assembled right here in the browser.
  // Filenames are the subject keys, so every [[reference]] resolves the
  // moment Obsidian opens the folder.
  const downloadVault = () =>
    action.run(
      async () => {
        const fflatePromise = import("fflate");
        const pages = companyId
          ? await convex.query(api.wikiPages.getExportForCompany, { companyId })
          : await convex.query(api.wikiPages.getExportForGlobal, {});
        const { strToU8, zipSync } = await fflatePromise;
        const files: Record<string, Uint8Array> = {};
        for (const page of pages) {
          const safeName = page.subjectKey.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(0, 120);
          const frontmatter = [
            "---",
            `title: ${JSON.stringify(page.title)}`,
            `kind: ${page.kind}`,
            `updated: ${new Date(page.updatedAt).toISOString().slice(0, 10)}`,
            ...(page.sources.length
              ? ["sources:", ...page.sources.map((label: string) => `  - ${JSON.stringify(label)}`)]
              : []),
            ...(page.pinnedCorrections.length
              ? ["pinned:", ...page.pinnedCorrections.map((pin: string) => `  - ${JSON.stringify(pin)}`)]
              : []),
            "---",
            "",
          ].join("\n");
          files[`${FOLDERS[page.kind] ?? "pages"}/${safeName}.md`] = strToU8(frontmatter + page.content + "\n");
        }
        const zipped = zipSync(files);
        const blob = new Blob([zipped.buffer as ArrayBuffer], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = companyId ? "company-wiki-vault.zip" : "platform-wiki-vault.zip";
        anchor.click();
        URL.revokeObjectURL(url);
      },
      { key: "export", fallbackMessage: t("export.failed") },
    );

  return (
    // Wraps under the title in a narrow window rather than squashing it.
    <div className="flex flex-wrap items-center gap-2">
      {canWrite ? (
        <Link href={`${basePath}/new-goal`} className={buttonClasses("outline", "inline-flex items-center gap-2 whitespace-nowrap")}>
          <Target className="h-3.5 w-3.5" aria-hidden="true" />
          {t("goal.button")}
        </Link>
      ) : null}
      <Button
        variant="outline"
        onClick={() => void downloadVault()}
        disabled={isExporting}
        className="inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        {isExporting ? t("export.exporting") : t("export.button")}
      </Button>
      {children}
    </div>
  );
}
