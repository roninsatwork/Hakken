"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MessageSquareQuote } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { HakkenMarkdown } from "@/src/ui/components/chat/HakkenMarkdown";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { ExternalUrlCell, RecordLinkCell } from "../../../../_components/SiteCells";
import { formatDay } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../../_components/siteRecordLinks";
import { useSiteId } from "../../../../_components/useSite";

type Stance = "RECOMMENDED" | "NAMED" | "WARNED_AGAINST" | "NOT_NAMED";

const STANCE_TONES: Record<Stance, StatusTone> = {
  RECOMMENDED: "success",
  NAMED: "info",
  WARNED_AGAINST: "danger",
  NOT_NAMED: "neutral",
};

/**
 * One answer's own screen (AI answers › Full answers › an answer): what the
 * engine said, word for word, with this site's names picked out; the sources
 * it cited, this site's own opening their page's screen; and what the engine
 * searched the web for when answering the question, each search opening its
 * own screen.
 *
 * The text is another model's writing: shown to people, never read as
 * instructions (D9). Opened from Full answers, never as a modal (Anthony,
 * 2026-09-24: "These are all new screens with a back button").
 */
export default function SiteAnswerPage() {
  const t = useTranslations("sites.answerRecord");
  const ta = useTranslations("sites.aiAnswers");
  const tr = useTranslations("sites.record");
  const engineLabel = useEngineLabel();
  const siteId = useSiteId();
  const back = useRecordBack("answer");
  const recordHref = useSiteRecordHref(siteId);
  const asked = useRecordKey("answer");
  // An id is 32 lowercase letters and digits; anything else is not one.
  const answerId = /^[a-z0-9]{32}$/.test(asked) ? (asked as Id<"aiAnswerTexts">) : null;
  const record = useQuery(api.siteAnswers.answerRecord, answerId ? { siteId, answerId } : "skip");

  if (!answerId) {
    return <DetailHeader back={back} icon={<MessageSquareQuote className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }
  if (record === null) {
    return <DetailHeader back={back} icon={<MessageSquareQuote className="h-6 w-6 text-brand" />} title={t("notFoundTitle")} description={t("notFoundBody")} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<MessageSquareQuote className="h-6 w-6 text-brand" />}
        title={record?.prompt ?? tr("loading")}
        description={record ? t("description", { engine: engineLabel(record.engine), day: formatDay(record.day) }) : undefined}
        pills={record ? <StatusPill tone={STANCE_TONES[record.stance]}>{ta(`stances.${record.stance}`)}</StatusPill> : undefined}
      />

      {record === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          <SettingsCard title={t("answerTitle")}>
            <div className="max-w-[75ch] text-[13px] text-secondary">
              <HakkenMarkdown content={record.text} highlight={record.names} />
            </div>
          </SettingsCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SettingsCard title={t("sourcesTitle")}>
              <CompactList
                rows={record.sources}
                rowKey={(row) => row.url}
                empty={t("noSources")}
                columns={[
                  {
                    key: "url",
                    className: "text-[12px]",
                    cell: (row) => (
                      <span className="flex flex-wrap items-center gap-2">
                        {row.page !== null
                          ? <RecordLinkCell href={recordHref({ kind: "page", page: row.page })} className="break-all text-[12px] text-info">{row.url}</RecordLinkCell>
                          : <ExternalUrlCell url={row.url} />}
                        {row.page !== null ? <StatusPill tone="success">{t("onThisWebsite")}</StatusPill> : null}
                      </span>
                    ),
                  },
                ]}
              />
            </SettingsCard>

            <SettingsCard title={t("searchesTitle", { engine: engineLabel(record.engine) })}>
              <p className="text-[12px] text-muted">{t("searchesHint")}</p>
              <CompactList
                rows={record.searches}
                rowKey={(row) => row.query}
                empty={t("noSearches")}
                columns={[
                  {
                    key: "query",
                    className: "text-[13px]",
                    cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.query })}>{row.queryText}</RecordLinkCell>,
                  },
                  { key: "seen", align: "right", className: "text-[12px] text-secondary", cell: (row) => t("timesSeen", { count: row.timesSeen }) },
                ]}
              />
            </SettingsCard>
          </div>
        </>
      )}
    </div>
  );
}
