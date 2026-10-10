"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { RefreshCw, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { AnswerCards, QuestionCard } from "../../_components/AnswerParts";
import { ResearchAnswer } from "../../_components/ResearchAnswer";
import { LookupState } from "../../_components/LookupState";
import { useLookupAnswers, useLookupId, useLookupOverview, type LookupAnswers } from "../../_components/useLookup";
import { useProblemWords } from "../../_components/ResearchCells";
import { ResearchSees } from "../../_components/ResearchSees";
import { answersSees } from "@/convex/utils/sees/research";

type Engine = LookupAnswers["engines"][number];

/** The assistants A to Z, as it opens; the most pages cited first. */
const SORTS: SiteSortColumns<Engine, "engine" | "cited"> = {
  engine: { value: (row) => row.engine, first: "asc" },
  cited: { value: (row) => row.cited.length, first: "desc" },
};
const engineOf = (row: Engine) => row.engine;

/**
 * What the AI says (board 4 of the approved drawings, docs/plans/active/
 * keyword-research-plan.md): the question behind the search asked of four AI
 * assistants who each names and
 * whether the website is one — each row opening to its answer word for word
 * (Anthony, 2026-10-05) — the businesses named most, and the searches
 * Google's AI Overview ran to answer it. Opening the screen asks the first
 * time (`openAnswers`, about 20 cents); Ask again asks afresh.
 */
export default function LookupAnswersPage() {
  const t = useTranslations("keywordResearch.ai");
  const tk = useTranslations("keywordResearch");
  const problemWords = useProblemWords();
  const engineLabel = useEngineLabel();
  const lookupId = useLookupId();
  const lookup = useLookupOverview();
  const answers = useLookupAnswers();
  const setup = useQuery(api.keywordResearch.researchSetup, {});
  const openAnswers = useMutation(api.keywordResearchAnswers.openAnswers);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-answers" });

  // Opened: asked the first time, and again once older than the company's days. A read-only account asks nothing.
  const opened = useRef<string | null>(null);
  const ready = lookup?.state === "READY" && lookup.canLookUp;
  useEffect(() => {
    if (!ready || opened.current === lookupId) return;
    opened.current = lookupId;
    void run(() => openAnswers({ lookupId }), { fallbackMessage: t("askFailed") });
  }, [ready, lookupId, openAnswers, run, t]);

  const { rows: sorted, tableSort } = useSiteSortedList(answers?.engines, SORTS, { opening: "engine", name: engineOf });
  const paged = useSitePager(sorted);
  if (!lookup) return null;

  const host = answers?.host ?? lookup.forWebsite?.host ?? null;
  const figures = answers?.figures ?? null;
  const canAsk = answers?.canAsk === true && lookup.canLookUp;
  const askAgain = canAsk ? (
    <Button
      variant="quiet"
      disabled={isBusy() || answers?.state === "WAITING"}
      onClick={() => void run(() => openAnswers({ lookupId, again: true }), { fallbackMessage: t("askFailed") })}
      className="inline-flex items-center gap-1.5"
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      {t("askAgain")}
    </Button>
  ) : undefined;
  const namingYou = (answers?.engines ?? []).filter((engine) => engine.yourPlace !== null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={host ? t("description", { host }) : t("descriptionNoWebsite")}
      />
      <ResearchSees screen="ai" seen={answers ? answersSees(answers) : answers} />
      {answers?.sample ? <Notice>{tk("sample")}</Notice> : null}
      {lookup.state !== "READY" ? <LookupState lookup={lookup} /> : null}
      {answers?.state === "WAITING" ? (
        <Notice>{t("waiting")}</Notice>
      ) : answers?.state === "FAILED" ? (
        <Notice tone="warning" action={askAgain}>{problemWords(answers.problem, t("failed"))}</Notice>
      ) : answers?.askedAt && setup ? (
        <Notice action={askAgain}>
          {t("asked", { day: formatDate(answers.askedAt), cents: lookup.costs.answers, days: setup.limits.reuseDays })}
        </Notice>
      ) : answers && lookup.state === "READY" ? (
        <Notice>{lookup.canLookUp ? t("notAskedYet", { cents: lookup.costs.answers }) : t("notAskedReadOnly")}</Notice>
      ) : null}

      {answers?.question ? <QuestionCard question={answers.question} /> : null}

      {figures ? (
        <FigureRow>
          <Figure
            label={t("nameYou")}
            value={t("ofAnswered", { count: figures.nameYou, answered: figures.answered })}
            detail={
              <span className="text-secondary">
                {namingYou.length > 0
                  ? namingYou.map((engine) => t("place", { engine: engineLabel(engine.engine), place: engine.yourPlace ?? 0, count: engine.named.length })).join(" · ")
                  : host ? t("noneNameYou") : t("noWebsite")}
              </span>
            }
          />
          <Figure
            label={t("nameARival")}
            value={t("ofAnswered", { count: figures.nameARival, answered: figures.answered })}
            detail={<span className="text-secondary">{figures.rivalMost ? t("rivalMost", { host: figures.rivalMost }) : t("noRival")}</span>}
          />
          <Figure label={t("businessesNamed")} value={formatNumber(figures.businessesNamed)} detail={<span className="text-secondary">{t("acrossAnswers", { count: figures.answered })}</span>} />
          <Figure
            label={t("pagesCited")}
            value={formatNumber(figures.pagesCited)}
            detail={<span className="text-secondary">{figures.pagesCitedYours > 0 ? t("citedYours", { count: figures.pagesCitedYours }) : t("citedNoneYours")}</span>}
          />
        </FigureRow>
      ) : null}

      {answers && answers.engines.length > 0 ? (
        <>
          <DataTable
            rows={paged.pageRows}
            rowKey={engineOf}
            cardHeader={<TableBar footer={paged.footer} noun="assistants" />}
            empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: t("noAnswers") }}
            footer={{ ...paged.footer, note: t("citedNote") }}
            sort={tableSort}
            // Each answer word for word, opened under its assistant: the website's names and its competitors' picked out.
            rowDetail={{
              label: (row) => t("answerTitle", { engine: engineLabel(row.engine) }),
              content: (row) => (row.answered && row.answer.trim().length > 0
                ? <ResearchAnswer answer={row.answer} cited={row.cited} names={answers.yourNames} others={answers.rivalNames} />
                : null),
            }}
            columns={[
              { key: "engine", header: t("assistant"), sortable: true, cell: (row) => <span className="text-[13px] font-medium text-foreground">{engineLabel(row.engine)}</span> },
              {
                key: "you",
                header: t("you"),
                cell: (row) => (!row.answered
                  ? <StatusLabel tone="neutral">{t("noAnswer")}</StatusLabel>
                  : row.yourPlace !== null
                    ? <StatusLabel tone="success">{t("namesYou")}</StatusLabel>
                    : <StatusLabel tone="neutral">{t("doesNotNameYou")}</StatusLabel>),
              },
              {
                key: "named",
                header: t("namedInOrder"),
                className: "w-[40%]",
                cell: (row) => (row.named.length > 0
                  ? <span className="break-words text-[12.5px] leading-relaxed text-secondary">{row.named.map((entry) => entry.host).join(", ")}</span>
                  : <NoFigure />),
              },
              {
                key: "rivals",
                header: t("yourCompetitors"),
                cell: (row) => (row.rivalsNamed.length > 0 ? <span className="break-words text-[12.5px] text-foreground">{row.rivalsNamed.join(", ")}</span> : <NoFigure />),
              },
              { key: "cited", header: t("cited"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] tabular-nums text-foreground">{formatNumber(row.cited.length)}</span> },
            ]}
          />
          <AnswerCards answers={answers} />
        </>
      ) : null}
    </div>
  );
}
