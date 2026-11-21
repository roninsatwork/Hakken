"use client";

import { useMutation, useQuery } from "convex/react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { WikiCheckupStepKey } from "@/convex/wikiCheckupRules";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate, formatTime } from "@/src/lib/dates";
import { cn } from "@/src/ui/lib/utils";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { StepProgress } from "@/src/ui/components/screens/StepProgress";

/**
 * The parts of one wiki's check-up (wiki-sonae-catch-up-plan-2026-11-21.md,
 * S8; Sonae `b4b13509`, rebuilt in Hakken's look): its latest run, the button
 * that runs every fix on every page now, the bar while it runs, and what it
 * did as plain counts. The run updates by itself, and is still there after
 * leaving the page and coming back. `WikiCheckupScreen` puts them together;
 * each can sit on another screen too.
 */

/**
 * Every step of the check-up (`WIKI_CHECKUP_STEPS` in convex/wikiCheckupRules.ts), each named in
 * `aiCheckup.steps`. Typed by the backend's own step key, so a step added or renamed there fails the
 * type check here until it has words. Only the type is imported: the module itself stays on the server.
 */
const NAMED_STEPS: Record<WikiCheckupStepKey, true> = {
  INTAKE: true,
  RELINK: true,
  GAPS: true,
  REFILE: true,
  TAGS: true,
  CORRECT: true,
  TIDY: true,
};

function isNamedStep(key: string): key is WikiCheckupStepKey {
  return Object.hasOwn(NAMED_STEPS, key);
}

export function useWikiCheckup(companyId?: Id<"companies">) {
  const t = useTranslations("aiCheckup");
  const action = useAdminAction({ scope: "admin-wiki-checkup" });
  const companyRun = useQuery(api.wikiCheckup.getLatestCheckupForCompany, companyId ? { companyId } : "skip");
  const globalRun = useQuery(api.wikiCheckup.getLatestCheckupForGlobal, companyId ? "skip" : {});
  const run = companyId ? companyRun : globalRun;
  const startCompany = useMutation(api.wikiCheckup.startWikiCheckupForCompany);
  const startGlobal = useMutation(api.wikiCheckup.startWikiCheckupForGlobal);
  const start = () =>
    void action.run(() => (companyId ? startCompany({ companyId }) : startGlobal({})), {
      key: "wiki-checkup-start",
      fallbackMessage: t("startFailed"),
    });
  return {
    run,
    start,
    isRunning: run?.status === "RUNNING",
    isStarting: action.isBusy("wiki-checkup-start"),
  };
}

export type WikiCheckup = ReturnType<typeof useWikiCheckup>;
type CheckupRun = NonNullable<WikiCheckup["run"]>;

/**
 * "Check this wiki now": the page's one orange action. One press, no choices
 * and no pop-up. Gone for someone who can only read (`PagePrimaryAction`);
 * greyed while a check-up runs, so it's never started twice (the server also
 * starts nothing new while one runs).
 */
export function WikiCheckupButton({ checkup }: { checkup: WikiCheckup }) {
  const t = useTranslations("aiCheckup");
  const busy = checkup.isRunning || checkup.isStarting;
  return (
    <PagePrimaryAction
      variant="brand"
      onClick={checkup.start}
      disabled={busy || checkup.run === undefined}
      icon={<RefreshCw aria-hidden="true" className={cn("h-3.5 w-3.5", busy && "motion-safe:animate-spin")} />}
    >
      {busy ? t("running") : t("button")}
    </PagePrimaryAction>
  );
}

/** The latest check-up in a word or two: not yet, under way, done or stopped, with when. */
export function WikiCheckupStatus({ run }: { run: WikiCheckup["run"] }) {
  const t = useTranslations("aiCheckup.status");
  const appLocale = useLocale();
  // The app's own language, day first for English as every Hakken screen has it, never the browser's order.
  const locale = appLocale === "en" ? "en-GB" : appLocale;
  if (run === undefined) return null;
  if (run === null) return <StatusLabel size="md" tone="neutral">{t("never")}</StatusLabel>;
  if (run.status === "RUNNING") {
    return <StatusLabel size="md" tone="info" icon="working">{t("running")}</StatusLabel>;
  }
  // The day named and the time to the minute ("on 21 November at 03:12"), never a row of numbers with seconds.
  const at = run.finishedAt ?? run.startedAt;
  const when = {
    day: formatDate(at, { locale, options: { day: "numeric", month: "long" } }),
    time: formatTime(at, { locale, options: { hour: "2-digit", minute: "2-digit" } }),
  };
  return run.status === "FAILED" ? (
    <StatusLabel size="md" tone="danger">{t("failed", when)}</StatusLabel>
  ) : (
    <StatusLabel size="md" tone="success">{t("done", when)}</StatusLabel>
  );
}

/**
 * The bar while it runs: the step it's on in words, and which step of how many. No percent beside it, as the
 * bar lights whole steps and a percent could say something else.
 */
export function WikiCheckupProgress({ run }: { run: CheckupRun }) {
  const t = useTranslations("aiCheckup");
  return (
    <StepProgress
      done={run.step - 1}
      total={run.stepCount}
      label={isNamedStep(run.stepKey) ? t(`steps.${run.stepKey}`) : t("working")}
      detail={t("progress", { step: run.step, count: run.stepCount })}
    />
  );
}

/** What the check-up fixed, as plain counts: so far while it runs, then all it did. */
export function WikiCheckupFigures({ run }: { run: CheckupRun }) {
  const t = useTranslations("aiCheckup.figures");
  const format = useFormatter();
  const count = (value: number) => format.number(value);
  const found = run.found;
  return (
    <FigureRow columns={3}>
      <Figure label={t("links")} value={count(found.linksFixed)} />
      <Figure label={t("factsSettled")} value={count(found.factsSettled)} />
      <Figure label={t("factsCorrected")} value={count(found.claimsCorrected)} />
      <Figure label={t("pagesWritten")} value={count(found.pagesWritten)} />
      <Figure label={t("pagesMoved")} value={count(found.pagesRefiled)} />
      <Figure label={t("tags")} value={count(found.tagsChanged)} />
    </FigureRow>
  );
}
