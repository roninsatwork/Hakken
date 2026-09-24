"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MessageSquareQuote } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { HakkenMarkdown } from "@/src/ui/components/chat/HakkenMarkdown";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { CheckedCell, RecordLinkCell } from "../../../_components/SiteCells";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSitePagedTable } from "../../../_components/useSitePagedTable";

type Engine = Doc<"aiAnswerTexts">["engine"];
type Stance = "RECOMMENDED" | "NAMED" | "WARNED_AGAINST" | "NOT_NAMED";

const STANCE_TONES: Record<Stance, StatusTone> = {
  RECOMMENDED: "success",
  NAMED: "info",
  WARNED_AGAINST: "danger",
  NOT_NAMED: "neutral",
};

/**
 * Full answers (D9): what each engine said, word for word, to one of the
 * questions the site is measured on, newest first within the dates chosen,
 * with the site's own names marked in the text and how the answer treated
 * it. Paged and searched on the server; the question, engine and search stay
 * in the address.
 */
export default function SiteAnswersPage() {
  const t = useTranslations("sites.aiAnswers");
  const engineLabel = useEngineLabel();
  const siteId = useSiteId();
  const range = useSiteRange();
  const catalogue = useQuery(api.siteAnswers.answerQuestions, { siteId });
  const [question, setQuestion] = useSiteParam<string>("question", "");
  const [engine, setEngine] = useSiteParam<Engine | "">("engine", "");
  const [search, setSearch, term] = useSiteSearch();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const questions = catalogue?.questions ?? [];
  const chosen = questions.find((entry) => entry.prompt === question) ?? questions[0] ?? null;
  const engines = chosen?.engines ?? [];
  const table = useSitePagedTable(
    api.siteAnswers.listAnswers,
    chosen
      ? {
        siteId,
        prompt: chosen.prompt,
        from: range.from,
        to: range.to,
        ...(engine && engines.includes(engine) ? { engine } : {}),
        ...(term ? { search: term } : {}),
      }
      : "skip",
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<MessageSquareQuote className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <p className="rounded-xl border border-border-dim bg-card/40 px-4 py-3 text-[13px] text-secondary">{t("keptFrom")}</p>

      {catalogue !== undefined && questions.length === 0 ? (
        <p className="rounded-2xl border border-border-dim bg-card/40 px-5 py-10 text-center text-[13px] text-secondary">{t("noQuestions")}</p>
      ) : (
        <DataTable
          rows={catalogue === undefined || table.isLoading ? undefined : table.rows}
          rowKey={(row) => row._id}
          onRowClick={(row) => router.push(recordHref({ kind: "answer", answerId: row._id }))}
          minWidthClassName="min-w-[760px]"
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
          filters={
            <>
              <Select aria-label={t("questionLabel")} value={chosen?.prompt ?? ""} onChange={(value) => setQuestion(value)}>
                {questions.map((entry) => <option key={entry.prompt} value={entry.prompt}>{entry.prompt}</option>)}
              </Select>
              <Select aria-label={t("engineFilter")} value={engine} onChange={(value) => setEngine(value as Engine | "")}>
                <option value="">{t("allEngines")}</option>
                {engines.map((entry) => <option key={entry} value={entry}>{engineLabel(entry)}</option>)}
              </Select>
              <TableDownload siteId={siteId} kind="answers" />
            </>
          }
          empty={{ icon: <MessageSquareQuote className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
          footer={{
            mode: "paged",
            page: table.page,
            totalPages: table.totalPages,
            totalCount: table.loadedCount,
            pageSize: table.pageSize,
            isLoading: table.isBusy,
            onPageChange: table.goToPage,
          }}
          columns={[
            { key: "day", header: t("columns.day"), className: "align-top", cell: (row) => <CheckedCell day={row.day} /> },
            { key: "engine", header: t("columns.engine"), className: "align-top", cell: (row) => <span className="whitespace-nowrap text-[13px] text-foreground">{engineLabel(row.engine)}</span> },
            {
              key: "stance",
              header: t("columns.stance"),
              className: "align-top",
              cell: (row) => <StatusPill tone={STANCE_TONES[row.stance]}>{t(`stances.${row.stance}`)}</StatusPill>,
            },
            {
              key: "answer",
              header: t("columns.answer"),
              // The start of the answer; the whole of it, its sources and the
              // engine's searches are on the answer's own screen.
              cell: (row) => (
                <div className="flex max-w-[64ch] flex-col gap-2 text-[13px] text-secondary">
                  <div className="max-h-36 overflow-hidden [mask-image:linear-gradient(to_bottom,black_55%,transparent)]">
                    <HakkenMarkdown content={row.text} highlight={catalogue?.names ?? []} />
                  </div>
                  <RecordLinkCell href={recordHref({ kind: "answer", answerId: row._id })} className="self-start text-[12px] text-info">
                    {t("readFull")} →
                  </RecordLinkCell>
                </div>
              ),
            },
            {
              key: "sources",
              header: t("columns.sources"),
              align: "right",
              className: "align-top",
              cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{t("sources", { count: row.sources.length })}</span>,
            },
          ]}
        />
      )}
    </div>
  );
}
