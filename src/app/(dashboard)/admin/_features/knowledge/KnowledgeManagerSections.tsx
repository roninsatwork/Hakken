"use client";

import type { FormEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AlertCircle,
  AlertTriangle,
  Database,
  Loader2,
  Search,
  TestTube2,
  Wrench,
} from "lucide-react";
import { Field } from "@/src/ui/components/screens/Field";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { formatDate } from "@/src/lib/dates";

type KnowledgeDocument = Doc<"knowledgeDocuments">;
type KnowledgeDocumentId = Id<"knowledgeDocuments">;
type QualitySummary = FunctionReturnType<typeof api.knowledge.getQualitySummary>;
export type RetrievalTestResult = FunctionReturnType<typeof api.knowledgeActions.testRetrieval>;

export type KnowledgeTab = "Website" | "File" | "Text";

export type RenderInspectAction = (
  documentId: KnowledgeDocumentId,
  document: KnowledgeDocument | undefined,
  className: string,
  label?: string,
) => ReactNode;

function formatCoveragePercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function KnowledgeStatsGrid({ totals }: { totals: QualitySummary["totals"] | undefined }) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
      {[
        { label: t("stats.documents"), value: totals ? totals.documents.toLocaleString() : "...", tone: "text-foreground" },
        { label: t("stats.ready"), value: totals ? totals.ready.toLocaleString() : "...", tone: "text-success" },
        { label: t("stats.ingesting"), value: totals ? (totals.pending + totals.processing).toLocaleString() : "...", tone: "text-warning" },
        { label: t("stats.failed"), value: totals ? totals.failed.toLocaleString() : "...", tone: "text-destructive" },
        { label: t("stats.drift"), value: totals ? totals.embeddingDrift.toLocaleString() : "...", tone: "text-warning" },
        { label: t("stats.chunks"), value: totals ? totals.sampledChunks.toLocaleString() : "...", tone: "text-secondary" },
      ].map((item) => (
        <div key={item.label} className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted">{item.label}</div>
          <div className={`text-[20px] font-semibold mt-1 ${item.tone}`}>{item.value}</div>
        </div>
      ))}
    </div>
  );
}

export function KnowledgeCoveragePanel({
  coverage,
}: {
  coverage: NonNullable<QualitySummary["topicCoverage"]>;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-4 flex flex-col gap-3">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-foreground">
            <Database className="w-4 h-4 text-brand" />
            <h3 className="text-[13px] font-semibold">{t("coverage.title")}</h3>
          </div>
          <p className="text-[12px] text-secondary mt-1">
            {t("coverage.description")}
          </p>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 text-right min-w-[120px]">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted">{t("coverage.label")}</div>
          <div className="text-[20px] font-semibold text-foreground">{formatCoveragePercent(coverage.score)}</div>
        </div>
      </div>
      {/* Each topic ticked when a ready document covers it, flagged when none does. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {coverage.terms.map((term) => (
          <StatusLabel key={term.term} tone={term.covered ? "success" : "warning"}>
            {term.term}
          </StatusLabel>
        ))}
      </div>
      <div className="text-[12px] text-secondary">
        {t("coverage.summary", {
          covered: coverage.coveredCount,
          total: coverage.totalCount,
          count: coverage.readyDocumentCount,
          recommendation: coverage.recommendation,
        })}
      </div>
    </div>
  );
}

export function KnowledgeRetrievalPanel({
  query,
  onQueryChange,
  onSubmit,
  submittedQuery,
  result,
  actionError,
  documents,
  renderInspectAction,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  submittedQuery: string;
  result: RetrievalTestResult | undefined;
  actionError: string;
  documents: KnowledgeDocument[];
  renderInspectAction: RenderInspectAction;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-4 flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TestTube2 className="w-4 h-4 text-brand" />
          <h3 className="text-[13px] font-semibold text-foreground">{t("retrieval.title")}</h3>
        </div>
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-2 lg:min-w-[460px]">
          {/* The heading beside it already says what this box is for, so the
              name is kept for a screen reader and not repeated on screen. */}
          <Field
            label={t("retrieval.searchLabel")}
            type="text"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={t("retrieval.searchLabel")}
            labelHidden
            wrapperClassName="flex-1"
            className="h-9 bg-background px-3 text-[13px] focus:border-brand"
          />
          <WriteButton
            type="submit"
            disabled={!query.trim()}
            className="h-9 px-4 rounded-[8px] bg-foreground text-background font-medium text-[13px] flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
          >
            <Search className="w-3.5 h-3.5" />
            {t("retrieval.test")}
          </WriteButton>
        </form>
      </div>

      {actionError && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-[13px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="font-medium">{actionError}</span>
        </div>
      )}

      {submittedQuery.trim() && result === undefined && (
        <div className="py-4 flex items-center gap-2 text-[13px] text-secondary">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("retrieval.checking")}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-widest font-mono text-muted">
            <span>{t("retrieval.found", { count: result.found })}</span>
            <span>{t("retrieval.read", { count: result.matches.length })}</span>
            {result.leftOut.length > 0 && <span>{t("retrieval.leftOut", { count: result.leftOut.length })}</span>}
          </div>
          {result.matches.length === 0 && result.leftOut.length === 0 ? (
            <div className="rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 text-[13px] text-secondary">
              {t("retrieval.noMatches")}
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* What is read, in reading order, then what the relevance
                  cut-off left out — dimmed, so the difference shows. */}
              {[
                ...result.matches.map((passage, index) => ({
                  passage,
                  leftOut: false,
                  label: t("retrieval.readPosition", { position: index + 1, count: result.matches.length }),
                })),
                ...result.leftOut.map((passage) => ({ passage, leftOut: true, label: t("retrieval.leftOutLabel") })),
              ].map(({ passage, leftOut, label }) => (
                <div
                  key={passage.chunkId}
                  className={`rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 flex flex-col gap-2${leftOut ? " opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-foreground truncate">{passage.title}</div>
                      <div className="text-[10px] uppercase tracking-widest font-mono text-muted mt-1">{label}</div>
                    </div>
                    {renderInspectAction(
                      passage.documentId,
                      documents.find((entry) => entry._id === passage.documentId),
                      "p-2 rounded-lg border border-transparent text-secondary hover:text-brand hover:bg-brand/10 transition-colors shrink-0 disabled:opacity-40",
                    )}
                  </div>
                  <pre className="text-[12px] text-secondary whitespace-pre-wrap break-words leading-relaxed max-h-28 overflow-auto">
                    {passage.preview}
                  </pre>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex gap-3 text-warning">
            <Database className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="text-[13px] leading-relaxed">{result.safetyNotice}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function KnowledgeFlaggedPanel({
  flaggedDocuments,
  isBulkRepairing,
  onRepairAll,
  repairingDocumentIds,
  onRetryDocument,
  documents,
  renderInspectAction,
}: {
  flaggedDocuments: QualitySummary["flaggedDocuments"];
  isBulkRepairing: boolean;
  onRepairAll: () => void;
  repairingDocumentIds: Record<string, boolean>;
  onRetryDocument: (documentId: KnowledgeDocumentId) => void;
  documents: KnowledgeDocument[];
  renderInspectAction: RenderInspectAction;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex flex-col gap-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 text-warning">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-[13px] font-semibold">{t("flagged.title")}</span>
        </div>
        {/* Raw: warning-toned repair chip — the kit has no warning variant. */}
        <button
          type="button"
          onClick={onRepairAll}
          disabled={isBulkRepairing}
          className="h-8 px-3 rounded-[8px] border border-warning/20 bg-black/20 text-warning text-[12px] font-semibold flex items-center justify-center gap-2 w-fit disabled:opacity-50"
        >
          {isBulkRepairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
          {t("flagged.repairAll")}
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        {flaggedDocuments.map((item) => (
          <div key={item.documentId} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] text-foreground font-semibold truncate">{item.title}</div>
              <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted mt-1">
                <span>{item.flag.toLowerCase().replaceAll("_", " ")}</span>
                <span>{item.status}</span>
                <span>{t("flagged.chunks", { count: item.chunkCount })}</span>
                {item.lastIngestedAt && <span>{t("flagged.fresh", { date: formatDate(item.lastIngestedAt) })}</span>}
              </div>
              {item.embeddingDrift && (
                <div className="text-[11px] text-warning mt-1 truncate">
                  {item.embeddingDrift.storedModelId || t("flagged.unknownModel")} {"->"} {item.embeddingDrift.activeModelId}
                </div>
              )}
              {item.lastIngestionError && (
                <div className="text-[11px] text-destructive mt-1 truncate">
                  {item.lastIngestionError}
                </div>
              )}
            </div>
            {renderInspectAction(
              item.documentId,
              documents.find((entry) => entry._id === item.documentId),
              "px-3 py-1.5 rounded-[8px] border border-warning/20 bg-warning/10 text-warning text-[12px] font-semibold flex items-center gap-2 shrink-0 disabled:opacity-40",
              t("flagged.inspect"),
            )}
            <WriteButton
              type="button"
              onClick={() => onRetryDocument(item.documentId)}
              disabled={repairingDocumentIds[item.documentId]}
              className="px-3 py-1.5 rounded-[8px] border border-warning/20 bg-black/20 text-warning text-[12px] font-semibold flex items-center gap-2 shrink-0 disabled:opacity-50"
            >
              {repairingDocumentIds[item.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
              {t("flagged.repair")}
            </WriteButton>
          </div>
        ))}
      </div>
    </div>
  );
}

export function KnowledgeTabSwitcher({
  activeTab,
  onTabChange,
}: {
  activeTab: KnowledgeTab;
  onTabChange: (tab: KnowledgeTab) => void;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <div className="flex items-center bg-background border border-border-dim rounded-[10px] w-fit p-1">
      {(
        [
          { tab: "Website", label: t("tabs.website") },
          { tab: "File", label: t("tabs.file") },
          { tab: "Text", label: t("tabs.text") },
        ] as const
      ).map(({ tab, label }) => (
        /* Raw: segmented tab — the active option swaps its colours; no kit variant is stateful. */
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`px-8 py-2 text-[13px] font-medium rounded-md transition-colors ${activeTab === tab ? "bg-brand text-on-brand shadow-sm" : "text-secondary hover:text-foreground"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
