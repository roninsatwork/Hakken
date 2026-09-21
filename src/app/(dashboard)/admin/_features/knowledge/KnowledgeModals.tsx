"use client";

import type { ChangeEvent, DragEvent, ReactNode, RefObject } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileText,
  History,
  Loader2,
  UploadCloud,
  Wrench,
} from "lucide-react";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import HakkenModal from "@/src/ui/components/feedback/HakkenModal";
import { Button } from "@/src/ui/components/screens/Button";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import {
  MAX_BULK_UPLOAD_FILES,
  UPLOAD_STATUS_KEYS,
  type UploadQueueEntry,
} from "./knowledgeUploadUtils";
import { formatDate } from "@/src/lib/dates";

type DocumentInspection = FunctionReturnType<typeof api.knowledge.inspectDocument>;

export function KnowledgeUploadModal({
  isOpen,
  isUploading,
  uploadQueue,
  fileError,
  skippedBundleFileCount,
  dragActive,
  inputRef,
  folderInputRef,
  uploadProgressLabel,
  uploadSummary,
  failedUploadCount,
  onClose,
  onDrag,
  onDrop,
  onChange,
  onRetryFailed,
}: {
  isOpen: boolean;
  isUploading: boolean;
  uploadQueue: UploadQueueEntry[];
  fileError: string;
  skippedBundleFileCount: number;
  dragActive: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  uploadProgressLabel: string;
  uploadSummary: string;
  failedUploadCount: number;
  onClose: () => void;
  onDrag: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRetryFailed: () => void;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <HakkenModal
      isOpen={isOpen}
      onClose={onClose}
      title={t("uploadModal.title")}
      size="md"
    >
      <div className="flex flex-col gap-6 w-full pt-4">
        {fileError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-[13px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{fileError}</span>
          </div>
        )}

        <div
          className={`relative border-2 border-dashed rounded-[16px] flex flex-col items-center justify-center p-12 transition-all ${dragActive ? "border-brand bg-brand/5 scale-[1.02]" : "border-white/10 bg-black/20 hover:border-white/20 hover:bg-black/40"} ${isUploading ? "opacity-50 pointer-events-none" : ""}`}
          onDragEnter={onDrag}
          onDragLeave={onDrag}
          onDragOver={onDrag}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.txt,.csv,.xls,.xlsx,.md,.markdown"
            onChange={onChange}
            className="hidden"
          />
          {/*
            `webkitdirectory` turns the picker into a folder picker. React has
            no typed prop for it, hence the spread.
          */}
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={onChange}
            className="hidden"
          />
          {isUploading ? (
            <div className="flex flex-col flex-1 items-center justify-center pointer-events-none">
              <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
              <p className="text-[14px] font-bold text-foreground">
                {uploadProgressLabel}
              </p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 items-center justify-center pointer-events-none">
              <UploadCloud className={`w-12 h-12 mb-4 transition-colors ${dragActive ? "text-brand scale-110" : "text-secondary"}`} />
              <p className="text-[14px] font-bold text-foreground mb-1">{t("uploadModal.dropTitle")}</p>
              <p className="text-[13px] text-muted text-center max-w-[280px] leading-relaxed mb-6">
                {t("uploadModal.dropHint", { max: MAX_BULK_UPLOAD_FILES })}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button
                  variant="pill"
                  onClick={(event) => { event.preventDefault(); inputRef.current?.click(); }}
                  className="px-6 py-2.5 pointer-events-auto shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                >
                  {t("uploadModal.browse")}
                </Button>
                {/* Raw: outline twin of the pill — bordered, unfilled; the kit has no outline pill variant. */}
                <button
                  onClick={(event) => { event.preventDefault(); folderInputRef.current?.click(); }}
                  className="px-6 py-2.5 rounded-full border border-white/15 text-foreground font-bold tracking-wide text-[13px] hover:bg-white/5 transition-all pointer-events-auto"
                >
                  {t("uploadModal.chooseFolder")}
                </button>
              </div>
            </div>
          )}
        </div>

        {uploadQueue.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-semibold text-foreground">
                {uploadSummary}
              </p>
              {!isUploading && failedUploadCount > 0 && (
                /* Raw: outline pill chip — bordered, unfilled; the kit has no outline pill variant. */
                <button
                  onClick={onRetryFailed}
                  className="px-3 py-1.5 rounded-full border border-white/15 text-[12px] font-semibold hover:bg-white/5 transition-colors"
                >
                  {t("uploadModal.retryFailed", { count: failedUploadCount })}
                </button>
              )}
            </div>

            <div className="max-h-[260px] overflow-y-auto rounded-[12px] border border-white/10 divide-y divide-white/5">
              {uploadQueue.map((entry) => (
                <div key={entry.key} className="flex items-start gap-3 px-3 py-2">
                  <div className="mt-0.5 flex-shrink-0">
                    {entry.status === "failed" ? (
                      <AlertTriangle className="w-4 h-4 text-destructive" />
                    ) : entry.status === "queued" ? (
                      <CheckCircle2 className="w-4 h-4 text-brand" />
                    ) : entry.status === "uploading" ? (
                      <Loader2 className="w-4 h-4 text-brand animate-spin" />
                    ) : (
                      <FileText className="w-4 h-4 text-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] text-foreground truncate" title={entry.title}>{entry.title}</p>
                    <p className={`text-[12px] ${entry.status === "failed" ? "text-destructive" : "text-secondary"}`}>
                      {entry.status === "failed"
                        ? t("uploadModal.failedEntry", { message: entry.error || t("uploadModal.failedEntryFallback") })
                        : t(UPLOAD_STATUS_KEYS[entry.status])}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {skippedBundleFileCount > 0 && (
              <p className="text-[12px] text-secondary">
                {t("uploadModal.skippedBundle", { count: skippedBundleFileCount })}
              </p>
            )}

            <p className="text-[12px] text-muted">
              {t("uploadModal.background")}
            </p>
          </div>
        )}
      </div>
    </HakkenModal>
  );
}


export function KnowledgeDocumentDeleteModal({
  document,
  isDeleting,
  error,
  describe,
  onClose,
  onCancel,
  onConfirm,
}: {
  document: Doc<"knowledgeDocuments"> | null;
  isDeleting: boolean;
  error: string;
  describe: (title: string | undefined) => ReactNode;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <HakkenModal
      isOpen={!!document}
      onClose={onClose}
      title={t("deleteModal.title")}
      size="sm"
    >
      <div className="flex flex-col gap-6 w-full pt-4">
        <p className="text-[14px] text-secondary">
          {describe(document?.title)}
        </p>
        {error && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-[13px] flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}
        <div className="flex justify-end gap-3">
          {/* Raw: cancel in the inherited foreground colour — ghost's grey text would visibly dim it. */}
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-md hover:bg-white/5 transition-colors text-[13px] font-medium disabled:opacity-50"
          >
            {t("deleteModal.cancel")}
          </button>
          <WriteButton
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-md bg-destructive text-white transition-colors text-[13px] font-medium flex items-center gap-2 hover:bg-destructive/90 disabled:opacity-50"
          >
            {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t("deleteModal.confirm")}
          </WriteButton>
        </div>
      </div>
    </HakkenModal>
  );
}


export function KnowledgeDocumentInspectModal({
  document,
  inspection,
  repairingIds,
  onClose,
  onRetryDocument,
}: {
  document: Doc<"knowledgeDocuments"> | null;
  inspection: DocumentInspection | undefined;
  repairingIds: Record<string, boolean>;
  onClose: () => void;
  onRetryDocument: (documentId: Id<"knowledgeDocuments">) => void;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <HakkenModal
      isOpen={!!document}
      onClose={onClose}
      title={t("inspectModal.title")}
      size="lg"
    >
      <div className="flex flex-col gap-5 w-full pt-4">
        {!document ? null : inspection === undefined ? (
          <div className="py-12 flex justify-center text-muted">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : inspection === null ? (
          <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
            {t("inspectModal.couldNotInspect")}
          </div>
        ) : (
          <>
            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-black/20 text-secondary">
                  {inspection.document.status}
                </span>
                <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
                  {inspection.document.format}
                </span>
                <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
                  {t("inspectModal.sampledChunks", { count: inspection.chunkCount })}
                </span>
              </div>
              <h3 className="text-[15px] font-semibold text-foreground">{inspection.document.title}</h3>
              {inspection.document.sourceUrl && (
                <a href={inspection.document.sourceUrl} target="_blank" rel="noreferrer" className="text-[12px] text-brand hover:underline break-all">
                  {inspection.document.sourceUrl}
                </a>
              )}
              <div className="flex flex-wrap gap-3 text-[11px] text-muted font-mono">
                <span>{formatDate(inspection.document.createdAt)}</span>
                {inspection.document.lastQueuedAt && <span>{t("inspectModal.queued", { date: formatDate(inspection.document.lastQueuedAt) })}</span>}
                {inspection.document.lastIngestionStartedAt && <span>{t("inspectModal.started", { date: formatDate(inspection.document.lastIngestionStartedAt) })}</span>}
                {inspection.document.lastIngestedAt && <span>{t("inspectModal.fresh", { date: formatDate(inspection.document.lastIngestedAt) })}</span>}
                {inspection.document.embeddingModelId && <span>{t("inspectModal.model", { model: inspection.document.embeddingModelId })}</span>}
                {inspection.document.embeddingDimensions && <span>{t("inspectModal.dimensions", { count: inspection.document.embeddingDimensions })}</span>}
              </div>
              {inspection.document.lastIngestionError && (
                <div className="rounded-[8px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                  {inspection.document.lastIngestionError}
                </div>
              )}
              {inspection.document.status === "failed" && (
                <div className="pt-2">
                  <WriteButton
                    type="button"
                    onClick={() => onRetryDocument(inspection.document.documentId)}
                    disabled={repairingIds[inspection.document.documentId]}
                    className="h-8 px-3 rounded-[8px] border border-warning/20 bg-warning/10 text-warning text-[12px] font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    {repairingIds[inspection.document.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                    {t("inspectModal.retryIngestion")}
                  </WriteButton>
                </div>
              )}
            </div>

            <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex gap-3 text-warning">
              <Database className="w-4 h-4 mt-0.5 shrink-0" />
              <p className="text-[13px] leading-relaxed">{inspection.safetyNotice}</p>
            </div>

            {inspection.embeddingDrift && (
              <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex flex-col gap-2 text-warning">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  <span className="text-[13px] font-semibold">{t("inspectModal.driftTitle")}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-warning/80">
                  <div>{t("inspectModal.stored", { model: inspection.embeddingDrift.storedModelId || t("inspectModal.unknown"), dims: inspection.embeddingDrift.storedDimensions || "?" })}</div>
                  <div>{t("inspectModal.active", { model: inspection.embeddingDrift.activeModelId, dims: inspection.embeddingDrift.activeDimensions || "?" })}</div>
                </div>
                <WriteButton
                  type="button"
                  onClick={() => onRetryDocument(inspection.document.documentId)}
                  disabled={repairingIds[inspection.document.documentId]}
                  className="h-8 px-3 rounded-[8px] border border-warning/20 bg-black/20 text-warning text-[12px] font-semibold flex items-center gap-2 w-fit disabled:opacity-50"
                >
                  {repairingIds[inspection.document.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                  {t("inspectModal.reembed")}
                </WriteButton>
              </div>
            )}

            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-secondary">
                <History className="w-4 h-4" />
                <span className="text-[13px] font-semibold text-foreground">{t("inspectModal.historyTitle")}</span>
              </div>
              {inspection.history.length === 0 ? (
                <div className="text-[13px] text-secondary">{t("inspectModal.noEvents")}</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {inspection.history.map((event) => (
                    <div key={`${event.actionType}-${event.timestamp}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 rounded-[8px] border border-border-dim bg-black/20 px-3 py-2">
                      <div className="text-[12px] font-semibold text-foreground">{event.actionType.toLowerCase().replaceAll("_", " ")}</div>
                      <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                        <span>{formatDate(event.timestamp)}</span>
                        {event.actorEmail && <span>{event.actorEmail}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {inspection.chunks.length === 0 ? (
              <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
                {t("inspectModal.noChunks")}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {inspection.chunks.map((chunk) => (
                  <div key={chunk.chunkId} className="rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                      <span>{t("inspectModal.chunk", { number: chunk.index + 1 })}</span>
                      <span>{t("inspectModal.chars", { count: chunk.characterCount })}</span>
                      <span>{t("inspectModal.dimensions", { count: chunk.embeddingDimensions })}</span>
                    </div>
                    <pre className="text-[12px] text-secondary whitespace-pre-wrap break-words leading-relaxed max-h-40 overflow-auto">
                      {chunk.preview}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </HakkenModal>
  );
}


export function KnowledgeWebsiteDeleteModal({
  root,
  isDeleting,
  onClose,
  onCancel,
  onConfirm,
}: {
  root: string | null;
  isDeleting: boolean;
  onClose: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("ai.knowledge.manager");
  const { platformName } = useSystemSettings();

  return (
    <HakkenModal
      isOpen={!!root}
      onClose={onClose}
      title={t("websiteDeleteModal.title")}
      size="sm"
    >
      <div className="flex flex-col gap-6 w-full pt-4">
        <p className="text-[14px] text-secondary">
          {t.rich("websiteDeleteModal.body", {
            root: root ?? "",
            highlight: (chunks) => <strong>{chunks}</strong>,
            platformName,
          })}
        </p>
        <div className="flex justify-end gap-3">
          {/* Raw: cancel in the inherited foreground colour — ghost's grey text would visibly dim it. */}
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-md hover:bg-white/5 transition-colors text-[13px] font-medium"
          >
            {t("websiteDeleteModal.cancel")}
          </button>
          <WriteButton
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-md bg-destructive text-white transition-colors text-[13px] font-medium flex items-center gap-2 hover:bg-destructive/90"
          >
            {isDeleting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t("websiteDeleteModal.confirm")}
          </WriteButton>
        </div>
      </div>
    </HakkenModal>
  );
}
