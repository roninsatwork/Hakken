"use client";

import { useTranslations } from "next-intl";

import { useNow } from "@/src/hooks/useNow";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { useRunFormat } from "../runFormat";

type AttentionKind = "FAILED" | "NOT_FILED" | "TOO_LARGE" | "ROWS_LEFT_OFF";

type Attention = {
  pullId: string;
  operationId: string;
  about: string;
  kind: AttentionKind;
  detail?: string;
  rows?: number;
  at?: number;
};

type WaitingLong = {
  rows: Array<{
    pullId: string;
    operationId: string;
    about: string;
    since: number;
    lastFetch: { at: number; said: string } | null;
  }>;
  total: number;
};

type Row = { key: string; operationId: string; about: string; why: string; detail: string | null; at: number | null };

const HOUR_MS = 60 * 60 * 1000;

/**
 * A run's requests that need a look (collection reliability plan, V1 and
 * V2): out for over an hour and still unanswered, with the last word from the
 * latest try at its answer; failed; answered but not filed; too large to keep;
 * or cut to fit. Before, a request that could not be filed read as filed and
 * one out for hours as merely waiting, and why was only in the logs. Nothing
 * at all when every request went as it should.
 */
export function RunAttention({
  attention,
  attentionTotal,
  waitingLong,
}: {
  attention: readonly Attention[];
  attentionTotal: number;
  waitingLong: WaitingLong;
}) {
  const t = useTranslations("admin.collectionRuns.detail.attention");
  const tOperation = useTranslations("admin.seoCollection.operation");
  const { when } = useRunFormat();
  const now = useNow();

  const total = waitingLong.total + attentionTotal;
  if (total === 0) return null;

  const rows: Row[] = [
    ...waitingLong.rows.map((row) => ({
      key: `out-${row.pullId}`,
      operationId: row.operationId,
      about: row.about,
      why: t("kinds.OUT_LONG", { hours: Math.max(1, Math.floor((now - row.since) / HOUR_MS)) }),
      detail: row.lastFetch ? t("lastTry", { said: row.lastFetch.said }) : null,
      at: row.since,
    })),
    ...attention.map((row) => ({
      key: row.pullId,
      operationId: row.operationId,
      about: row.about,
      why: t(`kinds.${row.kind}`, { rows: row.rows ?? 0 }),
      detail: row.detail ?? null,
      at: row.at ?? null,
    })),
  ];

  return (
    <SettingsCard title={t("title")}>
      <p className="text-[12px] text-secondary">{t("subtitle", { count: total })}</p>
      <CompactList
        rows={rows}
        rowKey={(row) => row.key}
        empty={null}
        minWidthClassName="min-w-[720px]"
        columns={[
          {
            key: "what",
            header: t("columns.what"),
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] text-foreground">{tOperation(row.operationId)}</span>
                {row.about ? <span className="text-[11px] text-muted">{row.about}</span> : null}
              </span>
            ),
          },
          {
            key: "why",
            header: t("columns.why"),
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <span className="text-[12px] text-warning">{row.why}</span>
                {row.detail ? <span className="max-w-md text-[11px] leading-relaxed text-secondary">{row.detail}</span> : null}
              </span>
            ),
          },
          {
            key: "when",
            header: t("columns.when"),
            className: "text-[12px] text-secondary",
            cell: (row) => (row.at ? when(row.at) : null),
          },
        ]}
      />
      {rows.length < total ? <p className="text-[11px] text-muted">{t("more", { shown: rows.length, total })}</p> : null}
    </SettingsCard>
  );
}
