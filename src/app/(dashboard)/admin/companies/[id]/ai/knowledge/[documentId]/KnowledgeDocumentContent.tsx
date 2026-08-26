"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  AlertTriangle,
  ArrowLeft,
  Clock3,
  Database,
  ExternalLink,
  FileText,
  History,
  Loader2,
  Wrench,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { toneForStatus } from "@/src/ui/components/screens/statusTone";

type KnowledgeDocumentContentProps = {
  companyId: Id<"companies">;
  documentId: Id<"knowledgeDocuments">;
  inspection: Exclude<FunctionReturnType<typeof api.knowledge.inspectDocument>, undefined>;
};

function isEmbeddingUseCaseError(message: string | undefined) {
  return !!message && (
    message.includes("Configured embedding model does not support the embedding use case")
    || message.includes("Embedding generation currently requires a Google Vertex model")
  );
}

export function KnowledgeDocumentContent({
  companyId,
  documentId,
  inspection,
}: KnowledgeDocumentContentProps) {
  const t = useTranslations("admin.companyDetails.knowledgeDoc");
  const retryDocumentIngestion = useMutation(api.knowledge.retryDocumentIngestion);
  const action = useAdminAction({ scope: "admin-knowledge-document" });
  const [retryError, setRetryError] = useState("");
  const isRetrying = action.isBusy();

  const handleRetry = async () => {
    setRetryError("");
    const outcome = await action.run(() => retryDocumentIngestion({ documentId }), {
      suppressErrorToast: true,
      fallbackMessage: t("retryFailed"),
    });
    if (!outcome.ok) setRetryError(outcome.message);
  };

  const backHref = `/admin/companies/${companyId}/ai/knowledge`;
  const modelsHref = `/admin/companies/${companyId}/ai/models`;

  if (inspection === null) {
    return (
      <div className="flex flex-col gap-4 w-full pb-10">
        <Link href={backHref} className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t("back")}</span>
        </Link>
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
          {t("notFound")}
        </div>
      </div>
    );
  }

  const document = inspection.document;
  const hasEmbeddingConfigError = isEmbeddingUseCaseError(document.lastIngestionError);

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <DetailHeader
        back={{ label: t("back"), href: backHref }}
        icon={<FileText className="w-6 h-6 text-brand shrink-0" />}
        title={<span className="truncate">{document.title}</span>}
        pills={
          <>
            <StatusPill
              // PROCESSING is not yet in the shared status map; keep its amber semantics.
              tone={document.status === "processing" ? "warning" : toneForStatus(document.status)}
              className="rounded-md px-2 py-1 font-normal uppercase font-mono tracking-widest"
            >
              {document.status}
            </StatusPill>
            <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
              {document.format}
            </span>
            <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
              {t("sampledChunks", { count: inspection.chunkCount })}
            </span>
            {document.sourceUrl && (
              <a href={document.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[13px] text-brand hover:underline break-all">
                <span>{document.sourceUrl}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            )}
          </>
        }
        action={
          <WriteButton
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="h-9 px-4 rounded-[8px] border border-warning/20 bg-warning/10 text-warning text-[13px] font-semibold flex items-center justify-center gap-2 w-fit disabled:opacity-50"
          >
            {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            {t("retryIngestion")}
          </WriteButton>
        }
      />

      {retryError && (
        <div className="rounded-[8px] border border-destructive/20 bg-destructive/10 px-4 py-3 text-[13px] text-destructive">
          {retryError}
        </div>
      )}

      {document.lastIngestionError && (
        <section className="rounded-[8px] border border-destructive/25 bg-destructive/10 px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="text-[14px] font-semibold">{t("ingestionFailed")}</h2>
          </div>
          <pre className="text-[12px] text-destructive whitespace-pre-wrap break-words leading-relaxed">
            {document.lastIngestionError}
          </pre>
          {hasEmbeddingConfigError && (
            <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-3 py-3 text-[13px] text-warning leading-relaxed">
              {t("embeddingConfigIssue")}
              <Link href={modelsHref} className="ml-2 font-semibold text-warning hover:underline">
                {t("openAiModels")}
              </Link>
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted">{t("storedEmbedding")}</div>
          <div className="text-[13px] text-foreground font-semibold">{document.embeddingModelId || t("noStoredModel")}</div>
          <div className="text-[11px] text-secondary font-mono break-all">{document.embeddingProviderModelId || t("noProviderModel")}</div>
          <div className="text-[11px] text-muted">{document.embeddingDimensions ? t("dimensions", { count: document.embeddingDimensions }) : t("noDimensionsStored")}</div>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted">{t("activeEmbedding")}</div>
          <div className="text-[13px] text-foreground font-semibold">{inspection.activeEmbeddingModel?.modelId || t("noActiveModel")}</div>
          <div className="text-[11px] text-secondary font-mono break-all">{inspection.activeEmbeddingModel?.providerModelId || t("noProviderModel")}</div>
          <div className="text-[11px] text-muted">{inspection.activeEmbeddingModel?.embeddingDimensions ? t("dimensions", { count: inspection.activeEmbeddingModel.embeddingDimensions }) : t("noDimensionsResolved")}</div>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted">{t("timeline")}</div>
          <div className="flex flex-col gap-1 text-[11px] text-secondary font-mono">
            <span>{t("created", { date: formatDate(document.createdAt) })}</span>
            {document.lastQueuedAt && <span>{t("queued", { date: formatDate(document.lastQueuedAt) })}</span>}
            {document.lastIngestionStartedAt && <span>{t("started", { date: formatDate(document.lastIngestionStartedAt) })}</span>}
            {document.lastIngestedAt && <span>{t("fresh", { date: formatDate(document.lastIngestedAt) })}</span>}
          </div>
        </div>
      </section>

      <section className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex gap-3 text-warning">
        <Database className="w-4 h-4 mt-0.5 shrink-0" />
        <p className="text-[13px] leading-relaxed">{inspection.safetyNotice}</p>
      </section>

      {inspection.embeddingDrift && (
        <section className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-4 flex flex-col gap-3 text-warning">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="text-[14px] font-semibold">{t("driftDetected")}</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[11px] font-mono text-warning/80">
            <div>{t("driftStored", { model: inspection.embeddingDrift.storedModelId || t("unknown"), dims: inspection.embeddingDrift.storedDimensions || "?" })}</div>
            <div>{t("driftActive", { model: inspection.embeddingDrift.activeModelId, dims: inspection.embeddingDrift.activeDimensions || "?" })}</div>
          </div>
        </section>
      )}

      <section className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-secondary">
          <History className="w-4 h-4" />
          <h2 className="text-[14px] font-semibold text-foreground">{t("historyTitle")}</h2>
        </div>
        {inspection.history.length === 0 ? (
          <div className="text-[13px] text-secondary">{t("noEvents")}</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
            {inspection.history.map((event) => (
              <div key={`${event.actionType}-${event.timestamp}`} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] font-semibold text-foreground">{event.actionType.toLowerCase().replaceAll("_", " ")}</div>
                  <Clock3 className="w-3.5 h-3.5 text-muted shrink-0" />
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                  <span>{formatDate(event.timestamp)}</span>
                  {event.actorEmail && <span>{event.actorEmail}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-foreground">{t("chunksTitle")}</h2>
          <span className="text-[11px] uppercase tracking-widest font-mono text-muted">{t("chunksShown", { count: inspection.chunks.length })}</span>
        </div>
        {inspection.chunks.length === 0 ? (
          <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
            {t("noChunks")}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {inspection.chunks.map((chunk) => (
              <div key={chunk.chunkId} className="rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 flex flex-col gap-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                  <span>{t("chunkNumber", { number: chunk.index + 1 })}</span>
                  <span>{t("chars", { count: chunk.characterCount })}</span>
                  <span>{t("dimensions", { count: chunk.embeddingDimensions })}</span>
                </div>
                <pre className="text-[12px] text-secondary whitespace-pre-wrap break-words leading-relaxed max-h-52 overflow-auto">
                  {chunk.preview}
                </pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
