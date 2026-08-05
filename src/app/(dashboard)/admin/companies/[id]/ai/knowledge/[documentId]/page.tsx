"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
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
import type { Id } from "@/convex/_generated/dataModel";
import { getErrorMessage } from "@/src/lib/errors";
import { formatDate } from "@/src/lib/dates";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";

type InspectKnowledgeDocumentPageProps = {
  params: Promise<{
    id: Id<"companies">;
    documentId: Id<"knowledgeDocuments">;
  }>;
};

function getStatusClasses(status: string) {
  if (status === "ready") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "failed") return "border-red-500/30 bg-red-500/10 text-red-300";
  if (status === "processing") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-border-dim bg-black/20 text-secondary";
}

function isEmbeddingUseCaseError(message: string | undefined) {
  return !!message && (
    message.includes("Configured embedding model does not support the embedding use case")
    || message.includes("Embedding generation currently requires a Google Vertex model")
  );
}

export default function InspectKnowledgeDocumentPage({ params }: InspectKnowledgeDocumentPageProps) {
  const { id: companyId, documentId } = use(params);
  const inspection = useQuery(api.knowledge.inspectDocument, { documentId });
  const retryDocumentIngestion = useMutation(api.knowledge.retryDocumentIngestion);
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState("");

  const handleRetry = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    setRetryError("");
    try {
      await retryDocumentIngestion({ documentId });
    } catch (error: unknown) {
      setRetryError(getErrorMessage(error, "Failed to retry ingestion."));
    } finally {
      setIsRetrying(false);
    }
  };

  const backHref = `/admin/companies/${companyId}/ai/knowledge`;
  const modelsHref = `/admin/companies/${companyId}/ai/models`;

  if (inspection === undefined) {
    return (
      <div className="min-h-[420px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  if (inspection === null) {
    return (
      <div className="flex flex-col gap-4 w-full pb-10">
        <Link href={backHref} className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to knowledge</span>
        </Link>
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
          This document could not be inspected.
        </div>
      </div>
    );
  }

  const document = inspection.document;
  const hasEmbeddingConfigError = isEmbeddingUseCaseError(document.lastIngestionError);

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <header className="flex flex-col gap-3">
        <Link href={backHref} className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to knowledge</span>
        </Link>
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusClasses(document.status)}`}>
                {document.status}
              </span>
              <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
                {document.format}
              </span>
              <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
                {inspection.chunkCount} sampled chunks
              </span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <FileText className="w-6 h-6 text-brand shrink-0" />
              <span className="truncate">{document.title}</span>
            </h1>
            {document.sourceUrl && (
              <a href={document.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-[13px] text-brand hover:underline break-all">
                <span>{document.sourceUrl}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </a>
            )}
          </div>
          <AdminWriteButton
            type="button"
            onClick={handleRetry}
            disabled={isRetrying}
            className="h-9 px-4 rounded-[8px] border border-amber-500/20 bg-amber-500/10 text-amber-200 text-[13px] font-semibold flex items-center justify-center gap-2 w-fit disabled:opacity-50"
          >
            {isRetrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            Retry ingestion
          </AdminWriteButton>
        </div>
      </header>

      {retryError && (
        <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-200">
          {retryError}
        </div>
      )}

      {document.lastIngestionError && (
        <section className="rounded-[8px] border border-red-500/25 bg-red-500/10 px-4 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-red-200">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="text-[14px] font-semibold">Ingestion failed</h2>
          </div>
          <pre className="text-[12px] text-red-100 whitespace-pre-wrap break-words leading-relaxed">
            {document.lastIngestionError}
          </pre>
          {hasEmbeddingConfigError && (
            <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-3 py-3 text-[13px] text-amber-100 leading-relaxed">
              This is an AI model configuration issue. Set the company embedding default to a Google Vertex model that supports the embedding use case, then retry ingestion.
              <Link href={modelsHref} className="ml-2 font-semibold text-amber-200 hover:underline">
                Open AI Models
              </Link>
            </div>
          )}
        </section>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Stored embedding</div>
          <div className="text-[13px] text-foreground font-semibold">{document.embeddingModelId || "No stored model"}</div>
          <div className="text-[11px] text-secondary font-mono break-all">{document.embeddingProviderModelId || "No provider model"}</div>
          <div className="text-[11px] text-muted">{document.embeddingDimensions ? `${document.embeddingDimensions} dimensions` : "No embedding dimensions stored"}</div>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Active embedding</div>
          <div className="text-[13px] text-foreground font-semibold">{inspection.activeEmbeddingModel?.modelId || "No active model"}</div>
          <div className="text-[11px] text-secondary font-mono break-all">{inspection.activeEmbeddingModel?.providerModelId || "No provider model"}</div>
          <div className="text-[11px] text-muted">{inspection.activeEmbeddingModel?.embeddingDimensions ? `${inspection.activeEmbeddingModel.embeddingDimensions} dimensions` : "No embedding dimensions resolved"}</div>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
          <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Timeline</div>
          <div className="flex flex-col gap-1 text-[11px] text-secondary font-mono">
            <span>created: {formatDate(document.createdAt)}</span>
            {document.lastQueuedAt && <span>queued: {formatDate(document.lastQueuedAt)}</span>}
            {document.lastIngestionStartedAt && <span>started: {formatDate(document.lastIngestionStartedAt)}</span>}
            {document.lastIngestedAt && <span>fresh: {formatDate(document.lastIngestedAt)}</span>}
          </div>
        </div>
      </section>

      <section className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex gap-3 text-amber-200">
        <Database className="w-4 h-4 mt-0.5 shrink-0" />
        <p className="text-[13px] leading-relaxed">{inspection.safetyNotice}</p>
      </section>

      {inspection.embeddingDrift && (
        <section className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-4 flex flex-col gap-3 text-amber-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            <h2 className="text-[14px] font-semibold">Embedding model drift detected</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[11px] font-mono text-amber-100/80">
            <div>Stored: {inspection.embeddingDrift.storedModelId || "unknown"} ({inspection.embeddingDrift.storedDimensions || "?"} dims)</div>
            <div>Active: {inspection.embeddingDrift.activeModelId} ({inspection.embeddingDrift.activeDimensions || "?"} dims)</div>
          </div>
        </section>
      )}

      <section className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-secondary">
          <History className="w-4 h-4" />
          <h2 className="text-[14px] font-semibold text-foreground">Ingestion history</h2>
        </div>
        {inspection.history.length === 0 ? (
          <div className="text-[13px] text-secondary">No recent document events were found.</div>
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
          <h2 className="text-[14px] font-semibold text-foreground">Stored chunks</h2>
          <span className="text-[11px] uppercase tracking-widest font-mono text-muted">{inspection.chunks.length} shown</span>
        </div>
        {inspection.chunks.length === 0 ? (
          <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
            No chunks are stored for this document yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {inspection.chunks.map((chunk) => (
              <div key={chunk.chunkId} className="rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 flex flex-col gap-2 min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                  <span>Chunk {chunk.index + 1}</span>
                  <span>{chunk.characterCount} chars</span>
                  <span>{chunk.embeddingDimensions} dimensions</span>
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
