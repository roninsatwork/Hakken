"use client";

import { useTranslations } from "next-intl";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { ExternalUrlCell } from "../../sites/_components/SiteCells";
import { formatNumber } from "../../sites/_components/siteFormat";
import { pathOf } from "./researchWords";
import type { LookupAnswers } from "./useLookup";
import { WhoLabel } from "./WhereYouAre";

/**
 * What the AI says' two cards under its table (board 4): the businesses the
 * assistants name most, and the searches Google's AI Overview ran — each with
 * the website's page that answers it, or a missing topic.
 */
export function AnswerCards({ answers }: { answers: LookupAnswers }) {
  const t = useTranslations("keywordResearch.ai");
  const answered = answers.figures?.answered ?? 0;
  const missing = answers.host ? answers.searches.filter((search) => search.page === null).length : 0;
  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <ChartCard title={t("namedMost")} hint={t("namedMostHint", { count: answered })}>
        <CompactList
          rows={answers.mostNamed}
          rowKey={(row) => row.host}
          density="tight"
          empty={t("noneNamed")}
          columns={[
            { key: "business", header: t("business"), className: "max-w-0 w-full", cell: (row) => <span title={row.host} className="block truncate text-[13px] text-foreground">{row.host}</span> },
            { key: "who", header: t("who"), cell: (row) => <WhoLabel who={row.who} /> },
            {
              key: "count",
              header: t("namedBy"),
              align: "right",
              cell: (row) => <span className="whitespace-nowrap font-mono text-[12px] tabular-nums text-foreground">{t("ofAnswered", { count: row.count, answered })}</span>,
            },
          ]}
        />
      </ChartCard>
      <ChartCard
        title={t("overviewSearched")}
        hint={answers.host ? (missing > 0 ? t("overviewHintMissing", { count: missing }) : t("overviewHintNone")) : t("overviewHintNoWebsite")}
      >
        <CompactList
          rows={answers.searches}
          rowKey={(row) => row.query}
          density="tight"
          empty={t("noSearches")}
          columns={[
            { key: "search", header: t("search"), className: "w-[45%]", cell: (row) => <span className="break-words text-[13px] text-foreground">{row.query}</span> },
            { key: "times", header: t("timesSeen"), align: "right", cell: (row) => <span className="font-mono text-[12px] tabular-nums text-foreground">{formatNumber(row.times)}</span> },
            {
              key: "page",
              header: t("yourPage"),
              className: "max-w-0 w-[40%]",
              cell: (row) => (row.page
                ? <ExternalUrlCell url={row.page} label={pathOf(row.page)} cut />
                : answers.host ? <StatusLabel tone="warning">{t("missingTopic")}</StatusLabel> : null),
            },
          ]}
        />
      </ChartCard>
    </div>
  );
}

/** The question asked of the four assistants, as a person would put it. */
export function QuestionCard({ question }: { question: string }) {
  const t = useTranslations("keywordResearch.ai");
  return (
    <ChartCard title={t("question")} hint={t("questionHint")}>
      <p className="text-[15px] text-foreground">{t("quoted", { question })}</p>
    </ChartCard>
  );
}
