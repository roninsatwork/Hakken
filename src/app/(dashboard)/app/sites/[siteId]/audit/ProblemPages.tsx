"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { ExternalUrlCell } from "../../_components/SiteCells";

/**
 * What one Site audit number is made of: the pages of the newest crawl with
 * that problem, and for broken links, where each broken link points
 * (`crawlProblemPages` in `convex/siteCrawlDetail.ts`). The crawl's detail is
 * fetched free after each crawl; until the first, this says so.
 */
export function ProblemPages({
  siteId,
  check,
  label,
  onClose,
}: {
  siteId: Id<"companyWebsites">;
  check: string | null;
  label: string;
  onClose: () => void;
}) {
  const t = useTranslations("sites.audit.problemPages");
  const pages = useQuery(api.siteCrawlDetail.crawlProblemPages, check ? { siteId, check } : "skip");

  return (
    <HakkenModal isOpen={check !== null} onClose={onClose} title={label} size="lg">
      {pages === undefined ? (
        <p className="text-[13px] text-secondary">{t("loading")}</p>
      ) : pages.length === 0 ? (
        <p className="text-[13px] text-secondary">{t("none")}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[13px] text-secondary">{t("count", { count: pages.length })}</p>
          <ul className="flex max-h-[60vh] flex-col divide-y divide-border-dim overflow-y-auto rounded-lg border border-border-dim">
            {pages.map((page) => (
              <li key={page.url} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <ExternalUrlCell url={page.url} label={page.page} />
                  {page.statusCode !== null ? (
                    <span className="font-mono text-[12px] text-secondary">{t("answer", { code: page.statusCode })}</span>
                  ) : null}
                </div>
                {page.brokenLinks.map((link) => (
                  <span key={link.to} className="break-all text-[12px] text-muted">
                    {t("brokenTo", { to: link.to, code: link.statusCode ?? "–" })}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
    </HakkenModal>
  );
}
