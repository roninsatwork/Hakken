"use client";

import { useTranslations } from "next-intl";
import { Stethoscope } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { DetailHeader, PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import {
  WikiCheckupButton,
  WikiCheckupFigures,
  WikiCheckupProgress,
  WikiCheckupStatus,
  useWikiCheckup,
} from "./WikiCheckupPanel";

/**
 * Check-up: one wiki's nightly check-up on a page of its own
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S8; Sonae `b4b13509` and
 * `267b0e51`, rebuilt in Hakken's look). What the last check-up did, as its
 * summary and plain counts; "Check this wiki now", the page's one orange action,
 * which runs every fix on every page; and the bar while it runs, with the
 * counts so far under it. With `companyId` it's that company's wiki, without
 * it the platform's.
 *
 * It wears the header for where it's mounted (docs/developer/screen-kit.md,
 * "Headers"): a plain `PageHeader` as a page inside a section, `divider` as a
 * top-level page, and `back` for a record opened from a list, such as Health's
 * Wiki check-ups, where `title` names the wiki.
 *
 * The summary is written by code (`summariseFound`, convex/wikiCheckupRules.ts)
 * in English and shown as it is.
 */
export function WikiCheckupScreen({
  companyId,
  divider = false,
  back,
  title,
}: {
  companyId?: Id<"companies">;
  divider?: boolean;
  back?: { label: string; href: string };
  title?: string;
}) {
  const t = useTranslations("aiCheckup");
  const checkup = useWikiCheckup(companyId);
  const { run } = checkup;
  const header = {
    title: title ?? t("title"),
    description: t("description"),
    pills: <WikiCheckupStatus run={run} />,
    action: <WikiCheckupButton checkup={checkup} />,
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 pb-12">
      {back ? (
        <DetailHeader back={back} {...header} />
      ) : (
        <PageHeader icon={<Stethoscope className="h-6 w-6 text-brand" />} divider={divider} {...header} />
      )}

      {run && checkup.isRunning ? <WikiCheckupProgress run={run} /> : null}

      {run && run.status === "FAILED" ? (
        <Notice tone="warning">{t("failed", { error: run.error ?? "" })}</Notice>
      ) : null}

      {run ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-foreground">
            {checkup.isRunning ? t("soFar") : t("lastDid")}
          </h2>
          {!checkup.isRunning && run.summary ? (
            <p className="text-[13px] leading-relaxed text-secondary">{run.summary}</p>
          ) : null}
          <WikiCheckupFigures run={run} />
        </section>
      ) : null}
    </div>
  );
}
