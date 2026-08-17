"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useState, useRef, useMemo } from "react";
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { useMutation, useAction, useQuery } from "convex/react";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  FileText,
  Upload,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
  Globe,
  AlignLeft,
  ChevronDown,
  ChevronUp,
  Search,
  RefreshCw,
  AlertCircle,
  Eye,
  Database,
  Wrench,
  TestTube2,
  History,
} from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { InlineSearchInput, PaginationFooter } from "@/src/ui/components/screens/Table";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";
import { resolveUploadContentType, validateUploadFile } from "@/src/lib/constants/uploads";
import { groupWebsiteDocuments } from "./knowledgeManagerUtils";
import {
  MAX_BULK_UPLOAD_FILES,
  UPLOAD_CONCURRENCY,
  buildUploadTitle,
  collectDroppedFiles,
  collectPickedFiles,
  mapWithConcurrency,
  partitionReservedBundleFiles,
  type CollectedFile,
} from "./knowledgeUploadUtils";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { StatusPill } from "@/src/ui/atoms/StatusPill";
import { STATUS_TONE_CLASSES } from "@/src/ui/atoms/statusTone";

type KnowledgeScope =
  | { type: "global" }
  | { type: "company"; companyId: Id<"companies"> }
  | { type: "agent"; agentId: Id<"agents"> };

type KnowledgeManagerProps = {
  scope: KnowledgeScope;
  header: ReactNode;
  emptyDocumentDescription: string;
  deleteDocumentDescription: (title: string | undefined) => ReactNode;
  getInspectDocumentHref?: (documentId: Id<"knowledgeDocuments">) => string;
};

type KnowledgeTab = "Website" | "File" | "Text";

type UploadQueueEntry = {
  key: string;
  title: string;
  status: "waiting" | "uploading" | "queued" | "failed";
  error?: string;
};

const UPLOAD_STATUS_LABELS: Record<UploadQueueEntry["status"], string> = {
  waiting: "Waiting",
  uploading: "Uploading",
  queued: "Sent for processing",
  failed: "Failed",
};

function buildScopeArgs(scope: KnowledgeScope) {
  if (scope.type === "agent") return { agentId: scope.agentId };
  return scope.type === "company" ? { companyId: scope.companyId } : {};
}

function formatCoveragePercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function KnowledgeManager({
  scope,
  header,
  emptyDocumentDescription,
  deleteDocumentDescription,
  getInspectDocumentHref,
}: KnowledgeManagerProps) {
  const scopeArgs = buildScopeArgs(scope);
  const paged = useServerPagedTable(api.knowledge.getPaginatedDocuments, scopeArgs, TABLE_PAGE_SIZE);
  const documents = paged.rows;
  const websiteDocuments = useQuery(api.knowledge.getWebsiteDocuments, scopeArgs);
  const qualitySummary = useQuery(api.knowledge.getQualitySummary, scopeArgs);
  // Which documents keep grounding well-rated answers (self-improvement
  // plan, Phase 4). Company scope only: evidence is a tenant's experience of
  // its own assistant, so global and agent screens have nothing to show.
  const documentEvidence = useQuery(
    api.knowledgeEvidence.getDocumentEvidenceForCompany,
    scope.type === "company" ? { companyId: scope.companyId } : "skip",
  );
  const evidenceByDocument = new Map(
    (documentEvidence ?? []).map((entry) => [entry.documentId as string, entry]),
  );
  const generateUploadUrl = useMutation(api.knowledge.generateUploadUrl);
  const saveDocument = useMutation(api.knowledge.saveDocument);
  const startKnowledgeFileQueue = useMutation(api.knowledge.startKnowledgeFileQueue);
  const deleteDocument = useMutation(api.knowledge.deleteDocument);
  const saveManualText = useMutation(api.knowledge.saveManualText);
  const queueWebsiteUrls = useMutation(api.knowledge.queueWebsiteUrls);
  const deleteWebsiteBulk = useMutation(api.knowledge.deleteWebsiteBulk);
  const retryDocumentIngestion = useMutation(api.knowledge.retryDocumentIngestion);
  const repairFlaggedDocuments = useMutation(api.knowledge.repairFlaggedDocuments);
  const mapWebsite = useAction(api.knowledgeActions.mapWebsite);

  const [activeTab, setActiveTab] = useState<KnowledgeTab>("Website");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueEntry[]>([]);
  const [skippedBundleFileCount, setSkippedBundleFileCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  /** Keeps the source file behind each queue row so a failed upload can be retried. */
  const uploadSourcesRef = useRef<Map<string, CollectedFile>>(new Map());

  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [isSavingText, setIsSavingText] = useState(false);

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isMapping, setIsMapping] = useState(false);
  const [mappedUrls, setMappedUrls] = useState<string[]>([]);
  const [isQueueing, setIsQueueing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [websiteGroupSearchTerms, setWebsiteGroupSearchTerms] = useState<Record<string, string>>({});
  const [refreshingRoots, setRefreshingRoots] = useState<Record<string, boolean>>({});
  const [rootToDelete, setRootToDelete] = useState<string | null>(null);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [websiteError, setWebsiteError] = useState("");
  const [qualityActionError, setQualityActionError] = useState("");
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [submittedRetrievalQuery, setSubmittedRetrievalQuery] = useState("");
  const [repairingDocumentIds, setRepairingDocumentIds] = useState<Record<string, boolean>>({});
  const [isBulkRepairing, setIsBulkRepairing] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<Doc<"knowledgeDocuments"> | null>(null);
  const [documentToInspect, setDocumentToInspect] = useState<Doc<"knowledgeDocuments"> | null>(null);
  const [isDeletingDocument, setIsDeletingDocument] = useState(false);
  const [documentDeleteError, setDocumentDeleteError] = useState("");
  const documentInspection = useQuery(
    api.knowledge.inspectDocument,
    documentToInspect ? { documentId: documentToInspect._id } : "skip"
  );
  const retrievalTest = useQuery(
    api.knowledge.testRetrieval,
    submittedRetrievalQuery.trim() ? { ...scopeArgs, query: submittedRetrievalQuery.trim() } : "skip"
  );
  const isLoadingDocuments = paged.isLoading;

  const updateQueueEntry = (key: string, patch: Partial<UploadQueueEntry>) => {
    setUploadQueue((entries) => entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));
  };

  const uploadOneFile = async (collected: CollectedFile, key: string, deferIngestion: boolean) => {
    updateQueueEntry(key, { status: "uploading" });

    const contentType = resolveUploadContentType(collected.file);
    const uploadUrl = await generateUploadUrl();
    const result = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: collected.file,
    });
    const { storageId } = await result.json() as { storageId: Id<"_storage"> };

    await saveDocument({
      ...scopeArgs,
      storageId,
      title: buildUploadTitle(collected),
      format: contentType,
      ...(deferIngestion ? { deferIngestion: true } : {}),
    });
  };

  /**
   * One path for one file and for five hundred. A batch of more than one parks
   * each document as pending and starts the drain queue once at the end, rather
   * than firing an ingestion action per file.
   */
  const processFiles = async (collected: CollectedFile[]) => {
    if (collected.length === 0) return;

    const { uploadable, skipped } = partitionReservedBundleFiles(collected);
    setSkippedBundleFileCount(skipped);

    if (uploadable.length === 0) {
      setUploadQueue([]);
      setFileError("Those are all bundle index and log files, which hold links rather than facts. Nothing to upload.");
      return;
    }

    const overCap = uploadable.length > MAX_BULK_UPLOAD_FILES;
    const capped = overCap ? uploadable.slice(0, MAX_BULK_UPLOAD_FILES) : uploadable;

    setFileError(
      overCap
        ? `That is more than ${MAX_BULK_UPLOAD_FILES} files. The first ${MAX_BULK_UPLOAD_FILES} are being uploaded — add the rest in a second batch.`
        : "",
    );

    const accepted: { collected: CollectedFile; key: string }[] = [];
    const initialQueue: UploadQueueEntry[] = [];
    uploadSourcesRef.current = new Map();

    capped.forEach((item, index) => {
      const key = `${index}-${item.path}`;
      const title = buildUploadTitle(item);
      const validation = validateUploadFile(item.file, "knowledgeDocument");
      uploadSourcesRef.current.set(key, item);

      if (validation.allowed) {
        accepted.push({ collected: item, key });
        initialQueue.push({ key, title, status: "waiting" });
      } else {
        initialQueue.push({ key, title, status: "failed", error: validation.reason });
      }
    });

    setUploadQueue(initialQueue);

    if (accepted.length === 0) {
      setFileError(initialQueue[0]?.error || "Unsupported file type. Please upload a PDF, DOCX, MD, TXT, or CSV file.");
      return;
    }

    setIsUploading(true);
    const deferIngestion = accepted.length > 1;

    const outcomes = await mapWithConcurrency(accepted, UPLOAD_CONCURRENCY, async ({ collected: item, key }) => {
      try {
        await uploadOneFile(item, key, deferIngestion);
        updateQueueEntry(key, { status: "queued" });
        return true;
      } catch (err: unknown) {
        console.error(err);
        updateQueueEntry(key, { status: "failed", error: getErrorMessage(err, "Failed to upload file.") });
        return false;
      }
    });

    const uploaded = outcomes.filter(Boolean).length;

    if (deferIngestion && uploaded > 0) {
      try {
        await startKnowledgeFileQueue({});
      } catch (err: unknown) {
        console.error(err);
        setFileError(getErrorMessage(err, "Files uploaded, but processing did not start. Use Retry on the list below."));
      }
    }

    setIsUploading(false);

    // A single clean upload needs no report; a batch does.
    if (!deferIngestion && uploaded === 1) {
      setUploadQueue([]);
      setIsModalOpen(false);
    }
  };


  const handleRetryFailedUploads = async () => {
    const retryable = uploadQueue
      .filter((entry) => entry.status === "failed")
      .map((entry) => uploadSourcesRef.current.get(entry.key))
      .filter((source): source is CollectedFile => Boolean(source));

    if (retryable.length === 0) return;
    await processFiles(retryable);
  };

  const failedUploadCount = uploadQueue.filter((entry) => entry.status === "failed").length;
  const sentUploadCount = uploadQueue.filter((entry) => entry.status === "queued").length;
  const settledUploadCount = failedUploadCount + sentUploadCount;

  const uploadProgressLabel = uploadQueue.length > 1
    ? `Uploading ${Math.min(settledUploadCount + 1, uploadQueue.length)} of ${uploadQueue.length}...`
    : "Securely Uploading Document...";

  const uploadSummary = isUploading
    ? `${sentUploadCount} of ${uploadQueue.length} uploaded`
    : failedUploadCount > 0
      ? `${sentUploadCount} of ${uploadQueue.length} uploaded, ${failedUploadCount} failed`
      : `${uploadQueue.length} ${uploadQueue.length === 1 ? "file" : "files"} sent for processing`;

  const handleDrag = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === "dragenter" || event.type === "dragover") {
      setDragActive(true);
    } else if (event.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const collected = await collectDroppedFiles(event.dataTransfer);
    await processFiles(collected);
  };

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    const collected = collectPickedFiles(event.target.files);
    // Clear the input so re-picking the same folder fires a fresh change event.
    event.target.value = "";
    await processFiles(collected);
  };

  const handleSaveText = async () => {
    if (!textTitle.trim() || !textContent.trim()) return;
    setIsSavingText(true);
    try {
      await saveManualText({
        ...scopeArgs,
        title: textTitle.trim(),
        textContent: textContent.trim(),
      });
      setTextTitle("");
      setTextContent("");
      setActiveTab("File");
    } catch (error) {
      console.error(error);
    } finally {
      setIsSavingText(false);
    }
  };

  const handleMapUrl = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !websiteUrl.trim()) return;

    event.preventDefault();
    setIsMapping(true);
    setMappedUrls([]);
    setWebsiteError("");
    try {
      let cleanedUrl = websiteUrl.trim();
      if (!cleanedUrl.startsWith("http")) cleanedUrl = `https://${cleanedUrl}`;
      const links = await mapWebsite({ url: cleanedUrl });
      setMappedUrls(links);
    } catch (err: unknown) {
      console.error("Map error", err);
      setWebsiteError(getErrorMessage(err, "Failed to map website. Check API keys and network."));
    } finally {
      setIsMapping(false);
    }
  };

  const handleQueueMappedUrls = async () => {
    if (mappedUrls.length === 0) return;
    setIsQueueing(true);
    setWebsiteError("");
    try {
      await queueWebsiteUrls({ ...scopeArgs, urls: mappedUrls });
      setMappedUrls([]);
      setWebsiteUrl("");
    } catch (err: unknown) {
      console.error(err);
      setWebsiteError("Failed to queue URLs.");
    } finally {
      setIsQueueing(false);
    }
  };

  const handleRefreshRoot = async (root: string) => {
    setRefreshingRoots((prev) => ({ ...prev, [root]: true }));
    setWebsiteError("");
    try {
      const links = await mapWebsite({ url: root });
      await queueWebsiteUrls({ ...scopeArgs, urls: links, forceRefresh: true });
    } catch (err: unknown) {
      console.error("Refresh error", err);
      setWebsiteError(`Failed to refresh ${root}: ${getErrorMessage(err, "Unknown error")}`);
    } finally {
      setRefreshingRoots((prev) => ({ ...prev, [root]: false }));
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (!rootToDelete) return;
    setIsDeletingBulk(true);
    try {
      await deleteWebsiteBulk({ ...scopeArgs, rootDomain: rootToDelete });
      setRootToDelete(null);
    } catch (err: unknown) {
      console.error(err);
      setWebsiteError("Failed to delete website root.");
    } finally {
      setIsDeletingBulk(false);
    }
  };

  const handleRunRetrievalTest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedRetrievalQuery(retrievalQuery.trim());
  };

  const handleRetryDocument = async (documentId: Id<"knowledgeDocuments">) => {
    setRepairingDocumentIds((prev) => ({ ...prev, [documentId]: true }));
    setQualityActionError("");
    try {
      await retryDocumentIngestion({ documentId });
    } catch (err: unknown) {
      console.error(err);
      setQualityActionError(getErrorMessage(err, "Failed to retry ingestion."));
    } finally {
      setRepairingDocumentIds((prev) => ({ ...prev, [documentId]: false }));
    }
  };

  const handleRepairFlaggedDocuments = async () => {
    if (isBulkRepairing) return;
    setIsBulkRepairing(true);
    setQualityActionError("");
    try {
      await repairFlaggedDocuments(scopeArgs);
    } catch (err: unknown) {
      console.error(err);
      setQualityActionError(getErrorMessage(err, "Failed to repair flagged documents."));
    } finally {
      setIsBulkRepairing(false);
    }
  };

  const handleConfirmDocumentDelete = async () => {
    if (!documentToDelete || isDeletingDocument) return;
    setIsDeletingDocument(true);
    setDocumentDeleteError("");
    try {
      await deleteDocument({ documentId: documentToDelete._id });
      setDocumentToDelete(null);
    } catch (err: unknown) {
      console.error(err);
      setDocumentDeleteError(getErrorMessage(err, "Failed to delete document."));
    } finally {
      setIsDeletingDocument(false);
    }
  };

  const loadedWebsiteDocuments = useMemo(() => websiteDocuments ?? [], [websiteDocuments]);
  const isLoadingWebsiteDocuments = websiteDocuments === undefined;
  const websiteGroups = useMemo(() => groupWebsiteDocuments(loadedWebsiteDocuments), [loadedWebsiteDocuments]);
  const documentFiles = useMemo(() => documents.filter((document) => document.format !== "url"), [documents]);

  const toggleGroup = (root: string) => {
    setExpandedGroups((prev) => ({ ...prev, [root]: !prev[root] }));
  };

  const renderInspectAction = (
    documentId: Id<"knowledgeDocuments">,
    document: Doc<"knowledgeDocuments"> | undefined,
    className: string,
    label?: string,
  ) => {
    const content = (
      <>
        <Eye className="w-4 h-4" />
        {label}
      </>
    );
    const href = getInspectDocumentHref?.(documentId);

    if (href) {
      return (
        <Link href={href} className={className} title="Inspect chunks">
          {content}
        </Link>
      );
    }

    return (
      <button
        type="button"
        onClick={() => {
          if (document) setDocumentToInspect(document);
        }}
        disabled={!document}
        className={className}
        title="Inspect chunks"
      >
        {content}
      </button>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-6 w-full">
        {header}

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: "Documents", value: qualitySummary ? qualitySummary.totals.documents.toLocaleString() : "...", tone: "text-foreground" },
            { label: "Ready", value: qualitySummary ? qualitySummary.totals.ready.toLocaleString() : "...", tone: "text-success" },
            { label: "Ingesting", value: qualitySummary ? (qualitySummary.totals.pending + qualitySummary.totals.processing).toLocaleString() : "...", tone: "text-warning" },
            { label: "Failed", value: qualitySummary ? qualitySummary.totals.failed.toLocaleString() : "...", tone: "text-destructive" },
            { label: "Drift", value: qualitySummary ? qualitySummary.totals.embeddingDrift.toLocaleString() : "...", tone: "text-warning" },
            { label: "Chunks", value: qualitySummary ? qualitySummary.totals.sampledChunks.toLocaleString() : "...", tone: "text-secondary" },
          ].map((item) => (
            <div key={item.label} className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted">{item.label}</div>
              <div className={`text-[20px] font-semibold mt-1 ${item.tone}`}>{item.value}</div>
            </div>
          ))}
        </div>

        {qualitySummary?.topicCoverage ? (
          <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-4 flex flex-col gap-3">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-foreground">
                  <Database className="w-4 h-4 text-brand" />
                  <h3 className="text-[13px] font-semibold">Agent topic coverage</h3>
                </div>
                <p className="text-[12px] text-secondary mt-1">
                  Compares the agent profile against sampled ready knowledge before release review.
                </p>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 text-right min-w-[120px]">
                <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Coverage</div>
                <div className="text-[20px] font-semibold text-foreground">{formatCoveragePercent(qualitySummary.topicCoverage.score)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {qualitySummary.topicCoverage.terms.map((term) => (
                <span
                  key={term.term}
                  className={`px-2 py-1 rounded-[6px] border text-[11px] ${
                    STATUS_TONE_CLASSES[term.covered ? "success" : "warning"]
                  }`}
                >
                  {term.term}
                </span>
              ))}
            </div>
            <div className="text-[12px] text-secondary">
              {qualitySummary.topicCoverage.coveredCount}/{qualitySummary.topicCoverage.totalCount} topics covered across {qualitySummary.topicCoverage.readyDocumentCount} ready document{qualitySummary.topicCoverage.readyDocumentCount === 1 ? "" : "s"}. {qualitySummary.topicCoverage.recommendation}
            </div>
          </div>
        ) : null}

        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TestTube2 className="w-4 h-4 text-brand" />
              <h3 className="text-[13px] font-semibold text-foreground">Retrieval test</h3>
            </div>
            <form onSubmit={handleRunRetrievalTest} className="flex flex-col sm:flex-row gap-2 lg:min-w-[460px]">
              {/* The heading beside it already says what this box is for, so the
                  name is kept for a screen reader and not repeated on screen. */}
              <Field
                label="Search the stored text"
                type="text"
                value={retrievalQuery}
                onChange={(event) => setRetrievalQuery(event.target.value)}
                placeholder="Search the stored text"
                labelHidden
                wrapperClassName="flex-1"
                className="h-9 bg-background px-3 text-[13px] focus:border-brand"
              />
              <WriteButton
                type="submit"
                disabled={!retrievalQuery.trim()}
                className="h-9 px-4 rounded-[8px] bg-foreground text-background font-medium text-[13px] flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                Test
              </WriteButton>
            </form>
          </div>

          {qualityActionError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-[13px] flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{qualityActionError}</span>
            </div>
          )}

          {submittedRetrievalQuery.trim() && retrievalTest === undefined && (
            <div className="py-4 flex items-center gap-2 text-[13px] text-secondary">
              <Loader2 className="w-4 h-4 animate-spin" />
              Checking stored chunks...
            </div>
          )}

          {retrievalTest && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3 text-[11px] uppercase tracking-widest font-mono text-muted">
                <span>{retrievalTest.inspectedDocuments} ready docs</span>
                <span>{retrievalTest.inspectedChunks} chunks checked</span>
                <span>{retrievalTest.matches.length} matches</span>
              </div>
              {retrievalTest.matches.length === 0 ? (
                <div className="rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 text-[13px] text-secondary">
                  No stored chunks matched this phrase.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {retrievalTest.matches.map((match) => (
                    <div key={match.chunkId} className="rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-foreground truncate">{match.title}</div>
                          <div className="text-[10px] uppercase tracking-widest font-mono text-muted mt-1">
                            score {match.score} * {match.embeddingDimensions} dimensions
                          </div>
                        </div>
                        {renderInspectAction(
                          match.documentId,
                          documents.find((entry) => entry._id === match.documentId),
                          "p-2 rounded-lg border border-transparent text-secondary hover:text-brand hover:bg-brand/10 transition-colors shrink-0 disabled:opacity-40",
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {match.matchedTerms.map((term) => (
                          <span key={term} className="px-2 py-0.5 rounded-md border border-brand/20 bg-brand/10 text-brand text-[10px] font-mono">
                            {term}
                          </span>
                        ))}
                      </div>
                      <pre className="text-[12px] text-secondary whitespace-pre-wrap break-words leading-relaxed max-h-28 overflow-auto">
                        {match.preview}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
              <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex gap-3 text-warning">
                <Database className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-[13px] leading-relaxed">{retrievalTest.safetyNotice}</p>
              </div>
            </div>
          )}
        </div>

        {qualitySummary && qualitySummary.flaggedDocuments.length > 0 && (
          <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 text-warning">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-[13px] font-semibold">Knowledge quality items need review</span>
              </div>
              <button
                type="button"
                onClick={handleRepairFlaggedDocuments}
                disabled={isBulkRepairing}
                className="h-8 px-3 rounded-[8px] border border-warning/20 bg-black/20 text-warning text-[12px] font-semibold flex items-center justify-center gap-2 w-fit disabled:opacity-50"
              >
                {isBulkRepairing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                Repair all flagged
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {qualitySummary.flaggedDocuments.map((item) => (
                <div key={item.documentId} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] text-foreground font-semibold truncate">{item.title}</div>
                    <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted mt-1">
                      <span>{item.flag.toLowerCase().replaceAll("_", " ")}</span>
                      <span>{item.status}</span>
                      <span>{item.chunkCount} chunks</span>
                      {item.lastIngestedAt && <span>fresh {formatDate(item.lastIngestedAt)}</span>}
                    </div>
                    {item.embeddingDrift && (
                      <div className="text-[11px] text-warning mt-1 truncate">
                        {item.embeddingDrift.storedModelId || "unknown model"} {"->"} {item.embeddingDrift.activeModelId}
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
                    "Inspect",
                  )}
                  <WriteButton
                    type="button"
                    onClick={() => handleRetryDocument(item.documentId)}
                    disabled={repairingDocumentIds[item.documentId]}
                    className="px-3 py-1.5 rounded-[8px] border border-warning/20 bg-black/20 text-warning text-[12px] font-semibold flex items-center gap-2 shrink-0 disabled:opacity-50"
                  >
                    {repairingDocumentIds[item.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                    Repair
                  </WriteButton>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center bg-background border border-border-dim rounded-[10px] w-fit p-1">
          {(["Website", "File", "Text"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-8 py-2 text-[13px] font-medium rounded-md transition-colors ${activeTab === tab ? "bg-brand text-white shadow-sm" : "text-secondary hover:text-foreground"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Text" && (
          <div className="bg-sidebar/30 border border-border-dim rounded-[16px] p-6">
            <h3 className="text-sm font-bold mb-4">Text</h3>
            <div className="flex flex-col gap-4">
              <Field
                label="Title"
                type="text"
                value={textTitle}
                onChange={(event) => setTextTitle(event.target.value)}
                placeholder="What this document is called"
                className="h-auto bg-background px-4 py-3 focus:border-brand"
              />
              <TextAreaField
                label="Text"
                value={textContent}
                onChange={(event) => setTextContent(event.target.value)}
                placeholder="Paste or type the text here"
                rows={6}
                className="resize-y bg-background focus:border-brand"
              />
              <div className="flex justify-end">
                <WriteButton
                  onClick={handleSaveText}
                  disabled={isSavingText || !textTitle.trim() || !textContent.trim()}
                  className="h-10 px-6 rounded-[8px] bg-secondary text-background font-medium text-[13px] hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingText ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Add text
                </WriteButton>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Website" && (
          <div className="flex flex-col gap-6">
            <div className="bg-sidebar/30 border border-border-dim rounded-[16px] p-6">
              <h3 className="text-sm font-bold mb-4">Website URL</h3>
              {websiteError && (
                <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-[13px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">{websiteError}</span>
                </div>
              )}
              {/* The heading above says "Website URL", so the name is kept for a
                  screen reader and not repeated on screen. A hidden label sits
                  outside the flow, so the field is exactly as tall as its box
                  and the state icon still centres on it. */}
              <div className="relative">
                <Field
                  label="Website URL"
                  type="text"
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                  onKeyDown={handleMapUrl}
                  placeholder="Paste a website address and press Enter"
                  disabled={isMapping || isQueueing}
                  labelHidden
                  className="h-auto bg-background px-4 py-3 pr-10 focus:border-success"
                />
                {isMapping ? (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-success animate-spin" />
                ) : (
                  <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-success scale-x-[-1]" />
                )}
              </div>

              {mappedUrls.length > 0 && (
                <div className="mt-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-[13px] text-secondary">
                    <span>Found {mappedUrls.length} pages to scrape</span>
                    <button
                      onClick={handleQueueMappedUrls}
                      disabled={isQueueing}
                      className="bg-brand text-white px-4 py-1.5 rounded-md font-medium hover:bg-brand/90 transition flex items-center gap-2"
                    >
                      {isQueueing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                      Queue All for Training
                    </button>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto border border-border-dim rounded-[8px] bg-background text-[12px]">
                    {mappedUrls.map((url) => (
                      <div key={url} className="py-2 px-3 border-b border-border-dim/50 last:border-0 truncate text-muted">
                        {url}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-[11px] font-bold tracking-widest text-secondary uppercase">Trained</h3>
                <p className="text-[12px] text-muted">
                  Website pages are grouped by domain. Search filters the pages stored for this website source.
                </p>
              </div>

              {isLoadingWebsiteDocuments && (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-brand" />
                </div>
              )}

              {!isLoadingWebsiteDocuments && Object.keys(websiteGroups).length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
                  <Globe className="w-9 h-9 text-brand mb-4 opacity-80" />
                  <h3 className="text-sm font-medium text-foreground mb-1">No Website Pages Trained</h3>
                  <p className="text-[13px] text-secondary max-w-sm">
                    Add a website URL above to map pages and queue them for knowledge training.
                  </p>
                </div>
              )}

              {!isLoadingWebsiteDocuments && Object.entries(websiteGroups).map(([root, docs]) => {
                const isExpanded = expandedGroups[root];
                const searchTerm = websiteGroupSearchTerms[root] ?? "";
                const normalizedSearchTerm = searchTerm.trim().toLowerCase();
                const visibleDocs = normalizedSearchTerm
                  ? docs.filter((document) =>
                      [document.sourceUrl, document.title]
                        .filter((value): value is string => Boolean(value))
                        .some((value) => value.toLowerCase().includes(normalizedSearchTerm))
                    )
                  : docs;
                const totalDocs = docs.length;
                const readyDocs = docs.filter((document) => document.status === "ready").length;
                const progressPct = totalDocs > 0 ? Math.round((readyDocs / totalDocs) * 100) : 0;
                const isRefreshing = refreshingRoots[root];

                return (
                  <div key={root} className="flex flex-col border border-border-dim rounded-[12px] bg-sidebar/30 overflow-hidden">
                    <div className="flex items-center justify-between p-4 bg-background/50">
                      <div className="flex items-center gap-4">
                        <Globe className="w-4 h-4 text-secondary" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[14px] font-medium text-foreground">{root}</span>
                          <div className="flex items-center gap-2 text-[11px] text-secondary">
                            <div className="w-24 h-1.5 bg-border-dim rounded-full overflow-hidden">
                              <div className="h-full bg-brand transition-all duration-500 ease-in-out" style={{ width: `${progressPct}%` }} />
                            </div>
                            <span className="font-mono tracking-wide">{readyDocs} ready / {totalDocs} stored ({progressPct}%)</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleRefreshRoot(root)}
                          disabled={isRefreshing}
                          title="Bulk Refresh (Re-scrape & find new)"
                          className="p-1.5 rounded-lg text-secondary hover:text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                        >
                          <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                        </button>
                        <WriteButton
                          onClick={() => setRootToDelete(root)}
                          title="Delete Complete Domain"
                          className="p-1.5 rounded-lg text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </WriteButton>
                        <button onClick={() => toggleGroup(root)} className="ml-2 flex items-center gap-1 bg-brand/10 text-brand px-3 py-1 rounded-md text-[13px] font-medium hover:bg-brand/20 transition-colors">
                          {totalDocs} pages {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="flex flex-col border-t border-border-dim bg-background">
                        <div className="px-4 py-3 border-b border-border-dim/50">
                          <InlineSearchInput
                            value={searchTerm}
                            onChange={(next) =>
                              setWebsiteGroupSearchTerms((prev) => ({
                                ...prev,
                                [root]: next,
                              }))
                            }
                            placeholder="Search stored pages"
                          />
                        </div>
                        <div className="p-2 text-[12px] font-medium text-secondary">
                          {normalizedSearchTerm
                            ? `${visibleDocs.length} matching stored page${visibleDocs.length === 1 ? "" : "s"}`
                            : "List of trained pages"}
                        </div>
                        {visibleDocs.length === 0 && (
                          <div className="px-4 py-8 text-[13px] text-secondary border-t border-border-dim/20">
                            No stored pages match this search.
                          </div>
                        )}
                        {visibleDocs.map((document) => (
                          <div key={document._id} className="flex items-center justify-between py-2.5 px-4 hover:bg-foreground/[0.02] border-t border-border-dim/20 group">
                            <a href={document.sourceUrl} target="_blank" rel="noreferrer" className="text-[13px] text-brand hover:underline truncate mr-4">
                              {document.sourceUrl}
                            </a>
                            <div className="flex items-center gap-3">
                              {document.status === "pending" && <StatusPill tone="warning" className="rounded-sm border-0 uppercase font-bold">Pending</StatusPill>}
                              {document.status === "processing" && <StatusPill tone="warning" icon={<Loader2 className="w-3 h-3 animate-spin" />} className="rounded-sm border-0 uppercase font-bold">Processing</StatusPill>}
                              {document.status === "failed" && <StatusPill tone="danger" icon={<AlertTriangle className="w-3 h-3" />} className="rounded-sm border-0 uppercase font-bold">Failed</StatusPill>}
                              {renderInspectAction(
                                document._id,
                                document,
                                "text-secondary hover:text-brand transition-colors opacity-50 group-hover:opacity-100",
                              )}
                              {document.status === "failed" && (
                                <WriteButton
                                  onClick={() => handleRetryDocument(document._id)}
                                  disabled={repairingDocumentIds[document._id]}
                                  className="text-secondary hover:text-warning transition-colors opacity-50 group-hover:opacity-100 disabled:opacity-50"
                                  title="Retry ingestion"
                                >
                                  {repairingDocumentIds[document._id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                                </WriteButton>
                              )}
                              <WriteButton
                                onClick={() => setDocumentToDelete(document)}
                                className="text-secondary hover:text-destructive transition-colors opacity-50 group-hover:opacity-100"
                                title="Delete Document"
                              >
                                <Trash2 className="w-4 h-4" />
                              </WriteButton>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "File" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-end">
              <button
                onClick={() => setIsModalOpen(true)}
                className="h-9 px-4 rounded-[10px] bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload Document
              </button>
            </div>

            {isLoadingDocuments ? (
              <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
            ) : documentFiles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
                <FileText className="w-10 h-10 text-brand mb-4 opacity-80" />
                <h3 className="text-sm font-medium text-foreground mb-1">No Documents Uploaded</h3>
                <p className="text-[13px] text-secondary max-w-sm">
                  {emptyDocumentDescription}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 mt-2">
                {documentFiles.map((document) => (
                  <div key={document._id} className="p-4 rounded-[12px] bg-sidebar/50 border border-border-dim flex items-center justify-between group">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-foreground/5 flex items-center justify-center text-secondary">
                        {document.format === "text/plain" ? <AlignLeft className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                      </div>
                      <div className="flex flex-col gap-1">
                        <h4 className="text-[14px] font-bold text-foreground">{document.title}</h4>
                        <div className="flex items-center gap-2 text-[12px] text-muted font-mono tracking-wide">
                          <span>{formatDate(document.createdAt)}</span>
                          <span>*</span>
                          <span className="uppercase">{document.format?.split("/").pop()?.replace("vnd.openxmlformats-officedocument.wordprocessingml.document", "docx")}</span>
                        </div>
                        {(() => {
                          const evidence = evidenceByDocument.get(document._id as string);
                          if (!evidence) return null;
                          return (
                            <div className="flex items-center gap-2 text-[11px]">
                              <span className="text-info">{evidence.positiveEvidence} rated helpful</span>
                              <span className="text-muted">·</span>
                              <span className="text-warning">{evidence.negativeEvidence} rated not right</span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {document.status === "processing" && (
                        <StatusPill tone="warning" size="md" icon={<Loader2 className="w-3.5 h-3.5 animate-spin" />} className="gap-2 px-3 py-1.5 font-bold tracking-widest uppercase font-mono">
                          Ingesting
                        </StatusPill>
                      )}
                      {document.status === "ready" && (
                        <StatusPill tone="success" size="md" icon={<CheckCircle2 className="w-3.5 h-3.5" />} className="gap-2 px-3 py-1.5 font-bold tracking-widest uppercase font-mono">
                          Ready
                        </StatusPill>
                      )}
                      {document.status === "failed" && (
                        <StatusPill tone="danger" size="md" icon={<AlertTriangle className="w-3.5 h-3.5" />} className="gap-2 px-3 py-1.5 font-bold tracking-widest uppercase font-mono">
                          Failed
                        </StatusPill>
                      )}

                      {renderInspectAction(
                        document._id,
                        document,
                        "p-2 rounded-lg border border-transparent text-secondary hover:text-brand hover:bg-brand/10 transition-colors opacity-0 group-hover:opacity-100",
                      )}

                      {document.status === "failed" && (
                        <WriteButton
                          onClick={() => handleRetryDocument(document._id)}
                          disabled={repairingDocumentIds[document._id]}
                          className="p-2 rounded-lg border border-transparent text-secondary hover:text-warning hover:bg-warning/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                          title="Retry ingestion"
                        >
                          {repairingDocumentIds[document._id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                        </WriteButton>
                      )}

                      <WriteButton
                        onClick={() => setDocumentToDelete(document)}
                        className="p-2 rounded-lg border border-transparent text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </WriteButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <PaginationFooter
          page={paged.page}
          totalPages={paged.totalPages}
          totalCount={paged.loadedCount}
          pageSize={TABLE_PAGE_SIZE}
          isLoading={paged.isLoadingMore}
          onPageChange={paged.goToPage}
          labels={{
            empty: "No knowledge documents loaded",
            // The true total is counted separately and is worth keeping: the
            // footer's own count is only what has been fetched so far.
            showing: (start, end, loaded) => qualitySummary
              ? `Showing ${start}-${end} of ${qualitySummary.totals.documents.toLocaleString()} documents`
              : `Showing ${start}-${end} of ${loaded} documents`,
          }}
        />
      </div>

      <SonaeModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (!isUploading) {
            setUploadQueue([]);
            setFileError("");
            setSkippedBundleFileCount(0);
          }
        }}
        title="Upload Knowledge Documents"
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
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.csv,.xls,.xlsx,.md,.markdown"
              onChange={handleChange}
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
              onChange={handleChange}
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
                <p className="text-[14px] font-bold text-foreground mb-1">Drag &amp; Drop Files or a Folder</p>
                <p className="text-[13px] text-muted text-center max-w-[280px] leading-relaxed mb-6">
                  Supports .PDF, .DOCX, .MD, .TXT, and .CSV. Drop a whole folder to load an OKF bundle — up to {MAX_BULK_UPLOAD_FILES} files at a time.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={(event) => { event.preventDefault(); inputRef.current?.click(); }}
                    className="px-6 py-2.5 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all pointer-events-auto shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                  >
                    Browse Files
                  </button>
                  <button
                    onClick={(event) => { event.preventDefault(); folderInputRef.current?.click(); }}
                    className="px-6 py-2.5 rounded-full border border-white/15 text-foreground font-bold tracking-wide text-[13px] hover:bg-white/5 transition-all pointer-events-auto"
                  >
                    Choose Folder
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
                  <button
                    onClick={handleRetryFailedUploads}
                    className="px-3 py-1.5 rounded-full border border-white/15 text-[12px] font-semibold hover:bg-white/5 transition-colors"
                  >
                    Retry {failedUploadCount} failed
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
                          ? `Failed — ${entry.error || "upload did not complete"}`
                          : UPLOAD_STATUS_LABELS[entry.status]}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {skippedBundleFileCount > 0 && (
                <p className="text-[12px] text-secondary">
                  {skippedBundleFileCount} bundle {skippedBundleFileCount === 1 ? "index or log file was" : "index and log files were"} skipped — they hold links and history rather than facts.
                </p>
              )}

              <p className="text-[12px] text-muted">
                Uploaded files are processed in the background. Close this window whenever you like — progress shows in the document list.
              </p>
            </div>
          )}
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={!!documentToDelete}
        onClose={() => {
          if (!isDeletingDocument) {
            setDocumentToDelete(null);
            setDocumentDeleteError("");
          }
        }}
        title="Delete Document"
        size="sm"
      >
        <div className="flex flex-col gap-6 w-full pt-4">
          <p className="text-[14px] text-secondary">
            {deleteDocumentDescription(documentToDelete?.title)}
          </p>
          {documentDeleteError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-[13px] flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">{documentDeleteError}</span>
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setDocumentToDelete(null)}
              disabled={isDeletingDocument}
              className="px-4 py-2 rounded-md hover:bg-white/5 transition-colors text-[13px] font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <WriteButton
              onClick={handleConfirmDocumentDelete}
              disabled={isDeletingDocument}
              className="px-4 py-2 rounded-md bg-destructive text-white transition-colors text-[13px] font-medium flex items-center gap-2 hover:bg-destructive/90 disabled:opacity-50"
            >
              {isDeletingDocument && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete Document
            </WriteButton>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={!!documentToInspect}
        onClose={() => setDocumentToInspect(null)}
        title="Inspect Knowledge Document"
        size="lg"
      >
        <div className="flex flex-col gap-5 w-full pt-4">
          {!documentToInspect ? null : documentInspection === undefined ? (
            <div className="py-12 flex justify-center text-muted">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : documentInspection === null ? (
            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
              This document could not be inspected.
            </div>
          ) : (
            <>
              <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-black/20 text-secondary">
                    {documentInspection.document.status}
                  </span>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
                    {documentInspection.document.format}
                  </span>
                  <span className="text-[10px] uppercase font-mono tracking-widest text-muted">
                    {documentInspection.chunkCount} sampled chunks
                  </span>
                </div>
                <h3 className="text-[15px] font-semibold text-foreground">{documentInspection.document.title}</h3>
                {documentInspection.document.sourceUrl && (
                  <a href={documentInspection.document.sourceUrl} target="_blank" rel="noreferrer" className="text-[12px] text-brand hover:underline break-all">
                    {documentInspection.document.sourceUrl}
                  </a>
                )}
                <div className="flex flex-wrap gap-3 text-[11px] text-muted font-mono">
                  <span>{formatDate(documentInspection.document.createdAt)}</span>
                  {documentInspection.document.lastQueuedAt && <span>queued: {formatDate(documentInspection.document.lastQueuedAt)}</span>}
                  {documentInspection.document.lastIngestionStartedAt && <span>started: {formatDate(documentInspection.document.lastIngestionStartedAt)}</span>}
                  {documentInspection.document.lastIngestedAt && <span>fresh: {formatDate(documentInspection.document.lastIngestedAt)}</span>}
                  {documentInspection.document.embeddingModelId && <span>model: {documentInspection.document.embeddingModelId}</span>}
                  {documentInspection.document.embeddingDimensions && <span>{documentInspection.document.embeddingDimensions} dimensions</span>}
                </div>
                {documentInspection.document.lastIngestionError && (
                  <div className="rounded-[8px] border border-destructive/20 bg-destructive/10 px-3 py-2 text-[12px] text-destructive">
                    {documentInspection.document.lastIngestionError}
                  </div>
                )}
                {documentInspection.document.status === "failed" && (
                  <div className="pt-2">
                    <WriteButton
                      type="button"
                      onClick={() => handleRetryDocument(documentInspection.document.documentId)}
                      disabled={repairingDocumentIds[documentInspection.document.documentId]}
                      className="h-8 px-3 rounded-[8px] border border-warning/20 bg-warning/10 text-warning text-[12px] font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      {repairingDocumentIds[documentInspection.document.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                      Retry ingestion
                    </WriteButton>
                  </div>
                )}
              </div>

              <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex gap-3 text-warning">
                <Database className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-[13px] leading-relaxed">{documentInspection.safetyNotice}</p>
              </div>

              {documentInspection.embeddingDrift && (
                <div className="rounded-[8px] border border-warning/20 bg-warning/10 px-4 py-3 flex flex-col gap-2 text-warning">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-[13px] font-semibold">Embedding model drift detected</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-warning/80">
                    <div>Stored: {documentInspection.embeddingDrift.storedModelId || "unknown"} ({documentInspection.embeddingDrift.storedDimensions || "?"} dims)</div>
                    <div>Active: {documentInspection.embeddingDrift.activeModelId} ({documentInspection.embeddingDrift.activeDimensions || "?"} dims)</div>
                  </div>
                  <WriteButton
                    type="button"
                    onClick={() => handleRetryDocument(documentInspection.document.documentId)}
                    disabled={repairingDocumentIds[documentInspection.document.documentId]}
                    className="h-8 px-3 rounded-[8px] border border-warning/20 bg-black/20 text-warning text-[12px] font-semibold flex items-center gap-2 w-fit disabled:opacity-50"
                  >
                    {repairingDocumentIds[documentInspection.document.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                    Re-embed with active model
                  </WriteButton>
                </div>
              )}

              <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-secondary">
                  <History className="w-4 h-4" />
                  <span className="text-[13px] font-semibold text-foreground">Ingestion history</span>
                </div>
                {documentInspection.history.length === 0 ? (
                  <div className="text-[13px] text-secondary">No recent document events were found.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {documentInspection.history.map((event) => (
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

              {documentInspection.chunks.length === 0 ? (
                <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-5 text-[13px] text-secondary">
                  No chunks are stored for this document yet.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {documentInspection.chunks.map((chunk) => (
                    <div key={chunk.chunkId} className="rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 flex flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                        <span>Chunk {chunk.index + 1}</span>
                        <span>{chunk.characterCount} chars</span>
                        <span>{chunk.embeddingDimensions} dimensions</span>
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
      </SonaeModal>

      <SonaeModal
        isOpen={!!rootToDelete}
        onClose={() => !isDeletingBulk && setRootToDelete(null)}
        title="Delete Website Data"
        size="sm"
      >
        <div className="flex flex-col gap-6 w-full pt-4">
          <p className="text-[14px] text-secondary">
            Are you sure you want to completely remove <strong>{rootToDelete}</strong> and all of its trained sub-pages from Sonae&apos;s memory?
            This will delete the vectors instantly.
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setRootToDelete(null)}
              disabled={isDeletingBulk}
              className="px-4 py-2 rounded-md hover:bg-white/5 transition-colors text-[13px] font-medium"
            >
              Cancel
            </button>
            <WriteButton
              onClick={handleConfirmBulkDelete}
              disabled={isDeletingBulk}
              className="px-4 py-2 rounded-md bg-destructive text-white transition-colors text-[13px] font-medium flex items-center gap-2 hover:bg-destructive/90"
            >
              {isDeletingBulk && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete Everything
            </WriteButton>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
