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
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { useSiteRange } from "../../../_components/SiteDateRange";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { TableDownload } from "../../../_components/SiteDownloads";
import { useSiteListPage } from "../../../_components/useSitePagedTable";
import { useSiteSort } from "../../../_components/useSiteSort";

type Engine = Doc<"aiAnswerTexts">["engine"];
type Stance = "RECOMMENDED" | "NAMED" | "WARNED_AGAINST" | "NOT_NAMED";

const STANCE_TONES: Record<Stance, StatusTone> = {
  RECOMMENDED: "success",
  NAMED: "info",
  WARNED_AGAINST: "danger",
  NOT_NAMED: "neutral",
};

/**
 * Full answers sort by the day asked, newest first or oldest (docs/plans/
 * active/sites-table-sorting-plan.md). Not by their sources: the count lives
 * with each answer's whole text, too much to read for every answer at once.
 */
const SORTS = { day: "desc" } as const;

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
  const order = useSiteSort(SORTS, "day");
  const table = useSiteListPage(
    api.siteAnswers.listAnswers,
    chosen
      ? {
        siteId,
        prompt: chosen.prompt,
        from: range.from,
        to: range.to,
        ...(engine && engines.includes(engine) ? { engine } : {}),
        ...(term ? { search: term } : {}),
        sort: order.key,
        direction: order.direction,
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
          rows={catalogue === undefined ? undefined : table.pageRows}
          rowKey={(row) => row._id}
          onRowClick={(row) => router.push(recordHref({ kind: "answer", answerId: row._id }))}
          minWidthClassName="min-w-[760px]"
          search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
          filters={
            <>
              <Select chip={{ label: chosen?.prompt ?? t("questionLabel") }} aria-label={t("questionLabel")} className="max-w-[420px]" value={chosen?.prompt ?? ""} onChange={(value) => setQuestion(value)}>
                {questions.map((entry) => <option key={entry.prompt} value={entry.prompt}>{entry.prompt}</option>)}
              </Select>
              <Select chip={{ label: t("engineFilter"), choice: engine ? engineLabel(engine) : null }} value={engine} onChange={(value) => setEngine(value as Engine | "")}>
                <option value="">{t("allEngines")}</option>
                {engines.map((entry) => <option key={entry} value={entry}>{engineLabel(entry)}</option>)}
              </Select>
            </>
          }
          cardHeader={<SiteTableBar footer={table.footer} noun="answers" actions={<TableDownload siteId={siteId} kind="answers" sort={order.tableSort} />} />}
          empty={{ icon: <MessageSquareQuote className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
          footer={table.footer}
          sort={order.tableSort}
          columns={[
            { key: "day", header: t("columns.day"), className: "align-top", sortable: true, cell: (row) => <CheckedCell day={row.day} /> },
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
