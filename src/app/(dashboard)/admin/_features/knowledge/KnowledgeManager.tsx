"use client";

import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useState, useRef, useMemo } from "react";
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import Link from "next/link";
import { useMutation, useAction, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Eye } from "lucide-react";
import {
  KnowledgeDocumentDeleteModal,
  KnowledgeDocumentInspectModal,
  KnowledgeUploadModal,
  KnowledgeWebsiteDeleteModal,
} from "./KnowledgeModals";
import {
  KnowledgeCoveragePanel,
  KnowledgeFlaggedPanel,
  KnowledgeRetrievalPanel,
  KnowledgeStatsGrid,
  KnowledgeTabSwitcher,
  type KnowledgeTab,
} from "./KnowledgeManagerSections";
import {
  KnowledgeFilesPanel,
  KnowledgeTextPanel,
  KnowledgeWebsitePanel,
} from "./KnowledgeSourcePanels";
import { PaginationFooter } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { groupWebsiteDocuments } from "./knowledgeManagerUtils";
import { MAX_BULK_UPLOAD_FILES, type CollectedFile, type UploadQueueEntry } from "./knowledgeUploadUtils";

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

async function loadKnowledgeFileHelpers() {
  const [uploadPolicy, uploadUtils] = await Promise.all([
    import("@/src/lib/constants/uploads"),
    import("./knowledgeUploadUtils"),
  ]);
  return { uploadPolicy, uploadUtils };
}

type KnowledgeFileHelpers = Awaited<ReturnType<typeof loadKnowledgeFileHelpers>>;

function buildScopeArgs(scope: KnowledgeScope) {
  if (scope.type === "agent") return { agentId: scope.agentId };
  return scope.type === "company" ? { companyId: scope.companyId } : {};
}

export function KnowledgeManager({
  scope,
  header,
  emptyDocumentDescription,
  deleteDocumentDescription,
  getInspectDocumentHref,
}: KnowledgeManagerProps) {
  const t = useTranslations("ai.knowledge.manager");
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

  const action = useAdminAction({ scope: "admin-knowledge" });
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

  const uploadOneFile = async (
    collected: CollectedFile,
    key: string,
    deferIngestion: boolean,
    helpers: KnowledgeFileHelpers,
  ) => {
    updateQueueEntry(key, { status: "uploading" });

    const contentType = helpers.uploadPolicy.resolveUploadContentType(collected.file);
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
      title: helpers.uploadUtils.buildUploadTitle(collected),
      format: contentType,
      ...(deferIngestion ? { deferIngestion: true } : {}),
    });
  };

  /**
   * One path for one file and for five hundred. A batch of more than one parks
   * each document as pending and starts the drain queue once at the end, rather
   * than firing an ingestion action per file.
   */
  const processFiles = async (
    collected: CollectedFile[],
    loadedHelpers?: KnowledgeFileHelpers,
  ) => {
    if (collected.length === 0) return;

    const helpers = loadedHelpers ?? await loadKnowledgeFileHelpers();
    const { uploadPolicy, uploadUtils } = helpers;

    const { uploadable, skipped } = uploadUtils.partitionReservedBundleFiles(collected);
    setSkippedBundleFileCount(skipped);

    if (uploadable.length === 0) {
      setUploadQueue([]);
      setFileError(t("errors.bundleOnly"));
      return;
    }

    const overCap = uploadable.length > MAX_BULK_UPLOAD_FILES;
    const capped = overCap ? uploadable.slice(0, MAX_BULK_UPLOAD_FILES) : uploadable;

    setFileError(overCap ? t("errors.overCap", { max: MAX_BULK_UPLOAD_FILES }) : "");

    const accepted: { collected: CollectedFile; key: string }[] = [];
    const initialQueue: UploadQueueEntry[] = [];
    uploadSourcesRef.current = new Map();

    capped.forEach((item, index) => {
      const key = `${index}-${item.path}`;
      const title = uploadUtils.buildUploadTitle(item);
      const validation = uploadPolicy.validateUploadFile(item.file, "knowledgeDocument");
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
      setFileError(initialQueue[0]?.error || t("errors.unsupported"));
      return;
    }

    setIsUploading(true);
    const deferIngestion = accepted.length > 1;

    const outcomes = await uploadUtils.mapWithConcurrency(
      accepted,
      uploadUtils.UPLOAD_CONCURRENCY,
      async ({ collected: item, key }) => {
        // Keyed on the queue row, and toast-suppressed because the row's own
        // failed status is the signal here: a page-level toast per file would
        // mean one corner notice for every file in a five-hundred-file batch.
        const outcome = await action.run(() => uploadOneFile(item, key, deferIngestion, helpers), {
          key,
          suppressErrorToast: true,
          fallbackMessage: t("errors.uploadFailed"),
        });

        if (!outcome.ok) {
          if (outcome.deduplicated) return false;
          updateQueueEntry(key, { status: "failed", error: outcome.message });
          return false;
        }

        updateQueueEntry(key, { status: "queued" });
        return true;
      },
    );

    const uploaded = outcomes.filter(Boolean).length;

    if (deferIngestion && uploaded > 0) {
      const outcome = await action.run(() => startKnowledgeFileQueue({}), {
        key: "start-queue",
        suppressErrorToast: true,
        fallbackMessage: t("errors.processingNotStarted"),
      });
      if (!outcome.ok && outcome.message) setFileError(outcome.message);
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
    ? t("progress.uploadingBatch", { current: Math.min(settledUploadCount + 1, uploadQueue.length), total: uploadQueue.length })
    : t("progress.uploadingSingle");

  const uploadSummary = isUploading
    ? t("progress.summaryUploading", { sent: sentUploadCount, total: uploadQueue.length })
    : failedUploadCount > 0
      ? t("progress.summaryFailed", { sent: sentUploadCount, total: uploadQueue.length, failed: failedUploadCount })
      : t("progress.summarySent", { count: uploadQueue.length });

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
    const helpers = await loadKnowledgeFileHelpers();
    const collected = await helpers.uploadUtils.collectDroppedFiles(event.dataTransfer);
    await processFiles(collected, helpers);
  };

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    const helpers = await loadKnowledgeFileHelpers();
    const collected = helpers.uploadUtils.collectPickedFiles(event.target.files);
    // Clear the input so re-picking the same folder fires a fresh change event.
    event.target.value = "";
    await processFiles(collected, helpers);
  };

  const handleSaveText = async () => {
    if (!textTitle.trim() || !textContent.trim()) return;
    setIsSavingText(true);
    await action.run(async () => {
      await saveManualText({
        ...scopeArgs,
        title: textTitle.trim(),
        textContent: textContent.trim(),
      });
      setTextTitle("");
      setTextContent("");
      setActiveTab("File");
    }, { key: "save-text", fallbackMessage: t("errors.saveTextFailed") });
    setIsSavingText(false);
  };

  const handleMapUrl = async (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !websiteUrl.trim()) return;

    event.preventDefault();
    setIsMapping(true);
    setMappedUrls([]);
    setWebsiteError("");
    const outcome = await action.run(async () => {
      let cleanedUrl = websiteUrl.trim();
      if (!cleanedUrl.startsWith("http")) cleanedUrl = `https://${cleanedUrl}`;
      return await mapWebsite({ url: cleanedUrl });
    }, { key: "map", suppressErrorToast: true, fallbackMessage: t("errors.mapFailed") });
    if (outcome.ok) setMappedUrls(outcome.data);
    else if (outcome.message) setWebsiteError(outcome.message);
    setIsMapping(false);
  };

  const handleQueueMappedUrls = async () => {
    if (mappedUrls.length === 0) return;
    setIsQueueing(true);
    setWebsiteError("");
    const outcome = await action.run(() => queueWebsiteUrls({ ...scopeArgs, urls: mappedUrls }), {
      key: "queue",
      suppressErrorToast: true,
      fallbackMessage: t("errors.queueFailed"),
    });
    if (outcome.ok) {
      setMappedUrls([]);
      setWebsiteUrl("");
    } else if (outcome.message) {
      setWebsiteError(outcome.message);
    }
    setIsQueueing(false);
  };

  const handleRefreshRoot = async (root: string) => {
    setRefreshingRoots((prev) => ({ ...prev, [root]: true }));
    setWebsiteError("");
    const outcome = await action.run(async () => {
      const links = await mapWebsite({ url: root });
      await queueWebsiteUrls({ ...scopeArgs, urls: links, forceRefresh: true });
    }, { key: `refresh:${root}`, suppressErrorToast: true, fallbackMessage: t("errors.unknown") });
    if (!outcome.ok && outcome.message) {
      setWebsiteError(t("errors.refreshFailed", { root, message: outcome.message }));
    }
    setRefreshingRoots((prev) => ({ ...prev, [root]: false }));
  };

  const handleConfirmBulkDelete = async () => {
    if (!rootToDelete) return;
    setIsDeletingBulk(true);
    const outcome = await action.run(() => deleteWebsiteBulk({ ...scopeArgs, rootDomain: rootToDelete }), {
      key: "bulk-delete",
      suppressErrorToast: true,
      fallbackMessage: t("errors.bulkDeleteFailed"),
    });
    if (outcome.ok) setRootToDelete(null);
    else if (outcome.message) setWebsiteError(outcome.message);
    setIsDeletingBulk(false);
  };

  const handleRunRetrievalTest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmittedRetrievalQuery(retrievalQuery.trim());
  };

  const handleRetryDocument = async (documentId: Id<"knowledgeDocuments">) => {
    setRepairingDocumentIds((prev) => ({ ...prev, [documentId]: true }));
    setQualityActionError("");
    const outcome = await action.run(() => retryDocumentIngestion({ documentId }), {
      key: `retry:${documentId}`,
      suppressErrorToast: true,
      fallbackMessage: t("errors.retryFailed"),
    });
    if (!outcome.ok && outcome.message) setQualityActionError(outcome.message);
    setRepairingDocumentIds((prev) => ({ ...prev, [documentId]: false }));
  };

  const handleRepairFlaggedDocuments = async () => {
    if (isBulkRepairing) return;
    setIsBulkRepairing(true);
    setQualityActionError("");
    const outcome = await action.run(() => repairFlaggedDocuments(scopeArgs), {
      key: "bulk-repair",
      suppressErrorToast: true,
      fallbackMessage: t("errors.repairFailed"),
    });
    if (!outcome.ok && outcome.message) setQualityActionError(outcome.message);
    setIsBulkRepairing(false);
  };

  const handleConfirmDocumentDelete = async () => {
    if (!documentToDelete || isDeletingDocument) return;
    setIsDeletingDocument(true);
    setDocumentDeleteError("");
    const outcome = await action.run(() => deleteDocument({ documentId: documentToDelete._id }), {
      key: "delete-document",
      suppressErrorToast: true,
      fallbackMessage: t("errors.deleteFailed"),
    });
    if (outcome.ok) setDocumentToDelete(null);
    else if (outcome.message) setDocumentDeleteError(outcome.message);
    setIsDeletingDocument(false);
  };

  const loadedWebsiteDocuments = useMemo(() => websiteDocuments ?? [], [websiteDocuments]);
  const isLoadingWebsiteDocuments = websiteDocuments === undefined;
  const websiteGroups = useMemo(() => groupWebsiteDocuments(loadedWebsiteDocuments), [loadedWebsiteDocuments]);
  const documentFiles = useMemo(() => documents.filter((document) => document.format !== "url"), [documents]);

  const toggleGroup = (root: string) => {
    setExpandedGroups((prev) => ({ ...prev, [root]: !prev[root] }));
  };

  const handleWebsiteGroupSearchChange = (root: string, value: string) => {
    setWebsiteGroupSearchTerms((prev) => ({ ...prev, [root]: value }));
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
        <Link href={href} className={className} title={t("actions.inspectChunks")}>
          {content}
        </Link>
      );
    }

    return (
      // Raw: the caller hands in the whole className — a passthrough, not a recipe of its own.
      <button
        type="button"
        onClick={() => {
          if (document) setDocumentToInspect(document);
        }}
        disabled={!document}
        className={className}
        title={t("actions.inspectChunks")}
      >
        {content}
      </button>
    );
  };

  return (
    <>
      <div className="flex flex-col gap-6 w-full">
        {header}

        <KnowledgeStatsGrid totals={qualitySummary?.totals} />

        {qualitySummary?.topicCoverage ? (
          <KnowledgeCoveragePanel coverage={qualitySummary.topicCoverage} />
        ) : null}

        <KnowledgeRetrievalPanel
          query={retrievalQuery}
          onQueryChange={setRetrievalQuery}
          onSubmit={handleRunRetrievalTest}
          submittedQuery={submittedRetrievalQuery}
          result={retrievalTest}
          actionError={qualityActionError}
          documents={documents}
          renderInspectAction={renderInspectAction}
        />

        {qualitySummary && qualitySummary.flaggedDocuments.length > 0 && (
          <KnowledgeFlaggedPanel
            flaggedDocuments={qualitySummary.flaggedDocuments}
            isBulkRepairing={isBulkRepairing}
            onRepairAll={handleRepairFlaggedDocuments}
            repairingDocumentIds={repairingDocumentIds}
            onRetryDocument={handleRetryDocument}
            documents={documents}
            renderInspectAction={renderInspectAction}
          />
        )}

        <KnowledgeTabSwitcher activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "Text" && (
          <KnowledgeTextPanel
            title={textTitle}
            content={textContent}
            isSaving={isSavingText}
            onTitleChange={setTextTitle}
            onContentChange={setTextContent}
            onSave={handleSaveText}
          />
        )}

        {activeTab === "Website" && (
          <KnowledgeWebsitePanel
            error={websiteError}
            url={websiteUrl}
            onUrlChange={setWebsiteUrl}
            onUrlKeyDown={handleMapUrl}
            isMapping={isMapping}
            isQueueing={isQueueing}
            mappedUrls={mappedUrls}
            onQueueMappedUrls={handleQueueMappedUrls}
            isLoadingDocuments={isLoadingWebsiteDocuments}
            groups={websiteGroups}
            expandedGroups={expandedGroups}
            onToggleGroup={toggleGroup}
            searchTerms={websiteGroupSearchTerms}
            onSearchTermChange={handleWebsiteGroupSearchChange}
            refreshingRoots={refreshingRoots}
            onRefreshRoot={handleRefreshRoot}
            onDeleteRoot={setRootToDelete}
            repairingDocumentIds={repairingDocumentIds}
            onRetryDocument={handleRetryDocument}
            onDeleteDocument={setDocumentToDelete}
            renderInspectAction={renderInspectAction}
          />
        )}

        {activeTab === "File" && (
          <KnowledgeFilesPanel
            documents={documentFiles}
            isLoading={isLoadingDocuments}
            emptyDescription={emptyDocumentDescription}
            evidenceByDocument={evidenceByDocument}
            repairingDocumentIds={repairingDocumentIds}
            onUploadClick={() => setIsModalOpen(true)}
            onRetryDocument={handleRetryDocument}
            onDeleteDocument={setDocumentToDelete}
            renderInspectAction={renderInspectAction}
          />
        )}

        <PaginationFooter
          page={paged.page}
          totalPages={paged.totalPages}
          totalCount={paged.loadedCount}
          pageSize={TABLE_PAGE_SIZE}
          isLoading={paged.isBusy}
          onPageChange={paged.goToPage}
          labels={{
            empty: t("footer.empty"),
            // The true total is counted separately and is worth keeping: the
            // footer's own count is only what has been fetched so far.
            showing: (start, end, loaded) => qualitySummary
              ? t("footer.showing", { start, end, total: qualitySummary.totals.documents.toLocaleString() })
              : t("footer.showing", { start, end, total: loaded }),
          }}
        />
      </div>

      <KnowledgeUploadModal
        isOpen={isModalOpen}
        isUploading={isUploading}
        uploadQueue={uploadQueue}
        fileError={fileError}
        skippedBundleFileCount={skippedBundleFileCount}
        dragActive={dragActive}
        inputRef={inputRef}
        folderInputRef={folderInputRef}
        uploadProgressLabel={uploadProgressLabel}
        uploadSummary={uploadSummary}
        failedUploadCount={failedUploadCount}
        onClose={() => {
          setIsModalOpen(false);
          if (!isUploading) {
            setUploadQueue([]);
            setFileError("");
            setSkippedBundleFileCount(0);
          }
        }}
        onDrag={handleDrag}
        onDrop={handleDrop}
        onChange={handleChange}
        onRetryFailed={handleRetryFailedUploads}
      />

      <KnowledgeDocumentDeleteModal
        document={documentToDelete}
        isDeleting={isDeletingDocument}
        error={documentDeleteError}
        describe={deleteDocumentDescription}
        onClose={() => {
          if (!isDeletingDocument) {
            setDocumentToDelete(null);
            setDocumentDeleteError("");
          }
        }}
        onCancel={() => setDocumentToDelete(null)}
        onConfirm={handleConfirmDocumentDelete}
      />

      <KnowledgeDocumentInspectModal
        document={documentToInspect}
        inspection={documentInspection}
        repairingIds={repairingDocumentIds}
        onClose={() => setDocumentToInspect(null)}
        onRetryDocument={handleRetryDocument}
      />

      <KnowledgeWebsiteDeleteModal
        root={rootToDelete}
        isDeleting={isDeletingBulk}
        onClose={() => !isDeletingBulk && setRootToDelete(null)}
        onCancel={() => setRootToDelete(null)}
        onConfirm={handleConfirmBulkDelete}
      />
    </>
  );
}
