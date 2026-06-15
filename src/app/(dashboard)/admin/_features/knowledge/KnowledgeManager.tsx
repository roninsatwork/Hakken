"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useState, useRef, useMemo } from "react";
import type { ChangeEvent, DragEvent, FormEvent, KeyboardEvent, ReactNode } from "react";
import { useMutation, useAction, usePaginatedQuery, useQuery } from "convex/react";
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
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDate } from "@/src/lib/dates";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import { groupWebsiteDocuments } from "./knowledgeManagerUtils";

type KnowledgeScope =
  | { type: "global" }
  | { type: "company"; companyId: Id<"companies"> }
  | { type: "agent"; agentId: Id<"agents"> };

type KnowledgeManagerProps = {
  scope: KnowledgeScope;
  header: ReactNode;
  emptyDocumentDescription: string;
  deleteDocumentDescription: (title: string | undefined) => ReactNode;
};

type KnowledgeTab = "Website" | "File" | "Text";

function buildScopeArgs(scope: KnowledgeScope) {
  if (scope.type === "agent") return { agentId: scope.agentId };
  return scope.type === "company" ? { companyId: scope.companyId } : {};
}

export function KnowledgeManager({
  scope,
  header,
  emptyDocumentDescription,
  deleteDocumentDescription,
}: KnowledgeManagerProps) {
  const scopeArgs = buildScopeArgs(scope);
  const {
    results: documents,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.knowledge.getPaginatedDocuments,
    scopeArgs,
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const qualitySummary = useQuery(api.knowledge.getQualitySummary, scopeArgs);
  const generateUploadUrl = useMutation(api.knowledge.generateUploadUrl);
  const saveDocument = useMutation(api.knowledge.saveDocument);
  const deleteDocument = useMutation(api.knowledge.deleteDocument);
  const saveManualText = useMutation(api.knowledge.saveManualText);
  const queueWebsiteUrls = useMutation(api.knowledge.queueWebsiteUrls);
  const deleteWebsiteBulk = useMutation(api.knowledge.deleteWebsiteBulk);
  const retryDocumentIngestion = useMutation(api.knowledge.retryDocumentIngestion);
  const mapWebsite = useAction(api.knowledgeActions.mapWebsite);

  const [activeTab, setActiveTab] = useState<KnowledgeTab>("Website");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [isSavingText, setIsSavingText] = useState(false);

  const [websiteUrl, setWebsiteUrl] = useState("");
  const [isMapping, setIsMapping] = useState(false);
  const [mappedUrls, setMappedUrls] = useState<string[]>([]);
  const [isQueueing, setIsQueueing] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [refreshingRoots, setRefreshingRoots] = useState<Record<string, boolean>>({});
  const [rootToDelete, setRootToDelete] = useState<string | null>(null);
  const [isDeletingBulk, setIsDeletingBulk] = useState(false);
  const [websiteError, setWebsiteError] = useState("");
  const [qualityActionError, setQualityActionError] = useState("");
  const [retrievalQuery, setRetrievalQuery] = useState("");
  const [submittedRetrievalQuery, setSubmittedRetrievalQuery] = useState("");
  const [repairingDocumentIds, setRepairingDocumentIds] = useState<Record<string, boolean>>({});
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
  const isLoadingDocuments = status === "LoadingFirstPage";
  const isLoadingMoreDocuments = status === "LoadingMore";
  const canLoadMoreDocuments = status === "CanLoadMore";

  const processFile = async (file: File) => {
    const validation = validateUploadFile(file, "knowledgeDocument");
    if (!validation.allowed) {
      setFileError(validation.reason || "Unsupported file type. Please upload a PDF, DOCX, TXT, or CSV file.");
      return;
    }

    setIsUploading(true);
    setFileError("");

    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json() as { storageId: Id<"_storage"> };

      await saveDocument({
        ...scopeArgs,
        storageId,
        title: file.name,
        format: file.type,
      });
      setIsModalOpen(false);
    } catch (err: unknown) {
      console.error(err);
      setFileError(getErrorMessage(err, "Failed to upload file."));
    } finally {
      setIsUploading(false);
    }
  };

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
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      await processFile(event.dataTransfer.files[0]);
    }
  };

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    event.preventDefault();
    if (event.target.files && event.target.files[0]) {
      await processFile(event.target.files[0]);
    }
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

  const websiteGroups = useMemo(() => groupWebsiteDocuments(documents), [documents]);
  const documentFiles = useMemo(() => documents.filter((document) => document.format !== "url"), [documents]);

  const toggleGroup = (root: string) => {
    setExpandedGroups((prev) => ({ ...prev, [root]: !prev[root] }));
  };

  return (
    <>
      <div className="flex flex-col gap-6 w-full">
        {header}

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: "Documents", value: qualitySummary ? qualitySummary.totals.documents.toLocaleString() : "...", tone: "text-foreground" },
            { label: "Ready", value: qualitySummary ? qualitySummary.totals.ready.toLocaleString() : "...", tone: "text-[#10b981]" },
            { label: "Ingesting", value: qualitySummary ? (qualitySummary.totals.pending + qualitySummary.totals.processing).toLocaleString() : "...", tone: "text-amber-400" },
            { label: "Failed", value: qualitySummary ? qualitySummary.totals.failed.toLocaleString() : "...", tone: "text-red-400" },
            { label: "Drift", value: qualitySummary ? qualitySummary.totals.embeddingDrift.toLocaleString() : "...", tone: "text-amber-300" },
            { label: "Chunks", value: qualitySummary ? qualitySummary.totals.sampledChunks.toLocaleString() : "...", tone: "text-secondary" },
          ].map((item) => (
            <div key={item.label} className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-3">
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted">{item.label}</div>
              <div className={`text-[20px] font-semibold mt-1 ${item.tone}`}>{item.value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-4 flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TestTube2 className="w-4 h-4 text-brand" />
              <h3 className="text-[13px] font-semibold text-foreground">Retrieval test</h3>
            </div>
            <form onSubmit={handleRunRetrievalTest} className="flex flex-col sm:flex-row gap-2 lg:min-w-[460px]">
              <input
                type="text"
                value={retrievalQuery}
                onChange={(event) => setRetrievalQuery(event.target.value)}
                placeholder="Search stored chunks"
                className="h-9 flex-1 bg-background border border-border-dim rounded-[8px] px-3 text-[13px] text-foreground focus:outline-none focus:border-brand transition-colors"
              />
              <button
                type="submit"
                disabled={!retrievalQuery.trim()}
                className="h-9 px-4 rounded-[8px] bg-foreground text-background font-medium text-[13px] flex items-center justify-center gap-2 hover:opacity-90 transition-all disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                Test
              </button>
            </form>
          </div>

          {qualityActionError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
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
                        <button
                          type="button"
                          onClick={() => {
                            const document = documents.find((entry) => entry._id === match.documentId);
                            if (document) setDocumentToInspect(document);
                          }}
                          className="p-2 rounded-lg border border-transparent text-secondary hover:text-brand hover:bg-brand/10 transition-colors shrink-0"
                          title="Inspect chunks"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
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
              <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex gap-3 text-amber-200">
                <Database className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-[13px] leading-relaxed">{retrievalTest.safetyNotice}</p>
              </div>
            </div>
          )}
        </div>

        {qualitySummary && qualitySummary.flaggedDocuments.length > 0 && (
          <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-amber-300">
              <AlertTriangle className="w-4 h-4" />
              <span className="text-[13px] font-semibold">Knowledge quality items need review</span>
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
                    </div>
                    {item.embeddingDrift && (
                      <div className="text-[11px] text-amber-200 mt-1 truncate">
                        {item.embeddingDrift.storedModelId || "unknown model"} {"->"} {item.embeddingDrift.activeModelId}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const document = documents.find((entry) => entry._id === item.documentId);
                      if (document) setDocumentToInspect(document);
                    }}
                    className="px-3 py-1.5 rounded-[8px] border border-amber-500/20 bg-amber-500/10 text-amber-300 text-[12px] font-semibold flex items-center gap-2 shrink-0"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Inspect
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRetryDocument(item.documentId)}
                    disabled={repairingDocumentIds[item.documentId]}
                    className="px-3 py-1.5 rounded-[8px] border border-amber-500/20 bg-black/20 text-amber-200 text-[12px] font-semibold flex items-center gap-2 shrink-0 disabled:opacity-50"
                  >
                    {repairingDocumentIds[item.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                    Repair
                  </button>
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
              <input
                type="text"
                value={textTitle}
                onChange={(event) => setTextTitle(event.target.value)}
                placeholder="Enter title"
                className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors"
              />
              <textarea
                value={textContent}
                onChange={(event) => setTextContent(event.target.value)}
                placeholder="+ Insert text here"
                rows={6}
                className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-3 text-[13px] text-foreground focus:outline-none focus:border-brand transition-colors resize-y"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleSaveText}
                  disabled={isSavingText || !textTitle.trim() || !textContent.trim()}
                  className="h-10 px-6 rounded-[8px] bg-secondary text-background font-medium text-[13px] hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingText ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Add text
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "Website" && (
          <div className="flex flex-col gap-6">
            <div className="bg-sidebar/30 border border-border-dim rounded-[16px] p-6">
              <h3 className="text-sm font-bold mb-4">Website URL</h3>
              {websiteError && (
                <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="font-medium">{websiteError}</span>
                </div>
              )}
              <div className="relative">
                <input
                  type="text"
                  value={websiteUrl}
                  onChange={(event) => setWebsiteUrl(event.target.value)}
                  onKeyDown={handleMapUrl}
                  placeholder="+Add website URL and press Enter"
                  disabled={isMapping || isQueueing}
                  className="w-full bg-background border border-border-dim rounded-[8px] px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-[#10b981] transition-colors pr-10"
                />
                {isMapping ? (
                  <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#10b981] animate-spin" />
                ) : (
                  <CheckCircle2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#10b981] scale-x-[-1]" />
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
              <h3 className="text-[11px] font-bold tracking-widest text-secondary uppercase">Trained</h3>

              {Object.entries(websiteGroups).map(([root, docs]) => {
                const isExpanded = expandedGroups[root];
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
                            <span className="font-mono tracking-wide">{readyDocs}/{totalDocs} Ready ({progressPct}%)</span>
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
                        <button
                          onClick={() => setRootToDelete(root)}
                          title="Delete Complete Domain"
                          className="p-1.5 rounded-lg text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleGroup(root)} className="ml-2 flex items-center gap-1 bg-brand/10 text-brand px-3 py-1 rounded-md text-[13px] font-medium hover:bg-brand/20 transition-colors">
                          {totalDocs} {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="flex flex-col border-t border-border-dim bg-background">
                        <div className="px-4 py-3 flex items-center gap-2 border-b border-border-dim/50">
                          <Search className="w-4 h-4 text-muted" />
                          <input type="text" placeholder="Search" className="bg-transparent border-none outline-none text-[13px] w-full" />
                        </div>
                        <div className="p-2 text-[12px] font-medium text-secondary">List of trained pages</div>
                        {docs.map((document) => (
                          <div key={document._id} className="flex items-center justify-between py-2.5 px-4 hover:bg-foreground/[0.02] border-t border-border-dim/20 group">
                            <a href={document.sourceUrl} target="_blank" rel="noreferrer" className="text-[13px] text-brand hover:underline truncate mr-4">
                              {document.sourceUrl}
                            </a>
                            <div className="flex items-center gap-3">
                              {document.status === "pending" && <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-sm">Pending</span>}
                              {document.status === "processing" && <span className="text-[10px] uppercase font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-sm flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Processing</span>}
                              {document.status === "failed" && <span className="text-[10px] uppercase font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-sm flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Failed</span>}
                              <button
                                onClick={() => setDocumentToInspect(document)}
                                className="text-secondary hover:text-brand transition-colors opacity-50 group-hover:opacity-100"
                                title="Inspect chunks"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              {document.status === "failed" && (
                                <button
                                  onClick={() => handleRetryDocument(document._id)}
                                  disabled={repairingDocumentIds[document._id]}
                                  className="text-secondary hover:text-amber-300 transition-colors opacity-50 group-hover:opacity-100 disabled:opacity-50"
                                  title="Retry ingestion"
                                >
                                  {repairingDocumentIds[document._id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                                </button>
                              )}
                              <button
                                onClick={() => setDocumentToDelete(document)}
                                className="text-secondary hover:text-red-500 transition-colors opacity-50 group-hover:opacity-100"
                                title="Delete Document"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
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
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      {document.status === "processing" && (
                        <div className="flex items-center gap-2 text-[11px] font-bold text-amber-500 tracking-widest uppercase font-mono px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Ingesting
                        </div>
                      )}
                      {document.status === "ready" && (
                        <div className="flex items-center gap-2 text-[11px] font-bold text-[#10b981] tracking-widest uppercase font-mono px-3 py-1.5 rounded-full bg-[#10b981]/10 border border-[#10b981]/30">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready
                        </div>
                      )}
                      {document.status === "failed" && (
                        <div className="flex items-center gap-2 text-[11px] font-bold text-red-500 tracking-widest uppercase font-mono px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30">
                          <AlertTriangle className="w-3.5 h-3.5" /> Failed
                        </div>
                      )}

                      <button
                        onClick={() => setDocumentToInspect(document)}
                        className="p-2 rounded-lg border border-transparent text-secondary hover:text-brand hover:bg-brand/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Inspect chunks"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {document.status === "failed" && (
                        <button
                          onClick={() => handleRetryDocument(document._id)}
                          disabled={repairingDocumentIds[document._id]}
                          className="p-2 rounded-lg border border-transparent text-secondary hover:text-amber-300 hover:bg-amber-500/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                          title="Retry ingestion"
                        >
                          {repairingDocumentIds[document._id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                        </button>
                      )}

                      <button
                        onClick={() => setDocumentToDelete(document)}
                        className="p-2 rounded-lg border border-transparent text-secondary hover:text-red-500 hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <AdminLoadMoreFooter
          visibleCount={documents.length}
          canLoadMore={canLoadMoreDocuments}
          isLoading={isLoadingMoreDocuments}
          onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
          labels={{
            empty: "No knowledge documents loaded",
            showing: (count) => `Showing ${count} knowledge documents`,
            loadMore: "Load more documents",
            loading: "Loading documents...",
          }}
        />
      </div>

      <SonaeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Upload Knowledge Document"
        size="md"
      >
        <div className="flex flex-col gap-6 w-full pt-4">
          {fileError && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
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
              accept=".pdf,.docx,.txt,.csv,.xls,.xlsx"
              onChange={handleChange}
              className="hidden"
            />
            {isUploading ? (
              <div className="flex flex-col flex-1 items-center justify-center pointer-events-none">
                <Loader2 className="w-12 h-12 text-brand animate-spin mb-4" />
                <p className="text-[14px] font-bold text-foreground">Securely Uploading Document...</p>
              </div>
            ) : (
              <div className="flex flex-col flex-1 items-center justify-center pointer-events-none">
                <UploadCloud className={`w-12 h-12 mb-4 transition-colors ${dragActive ? "text-brand scale-110" : "text-secondary"}`} />
                <p className="text-[14px] font-bold text-foreground mb-1">Drag & Drop Documentation</p>
                <p className="text-[13px] text-muted text-center max-w-[250px] leading-relaxed mb-6">
                  Supports .PDF, .DOCX, .TXT, and .CSV format.
                </p>
                <button
                  onClick={(event) => { event.preventDefault(); inputRef.current?.click(); }}
                  className="px-6 py-2.5 rounded-full bg-foreground text-background font-bold tracking-wide text-[13px] hover:opacity-90 transition-all pointer-events-auto shadow-[0_0_20px_rgba(255,255,255,0.05)]"
                >
                  Browse Desktop Files
                </button>
              </div>
            )}
          </div>
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
            <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-lg text-[13px] flex items-center gap-2">
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
            <button
              onClick={handleConfirmDocumentDelete}
              disabled={isDeletingDocument}
              className="px-4 py-2 rounded-md bg-red-500 text-white transition-colors text-[13px] font-medium flex items-center gap-2 hover:bg-red-600 disabled:opacity-50"
            >
              {isDeletingDocument && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete Document
            </button>
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
                  {documentInspection.document.embeddingModelId && <span>model: {documentInspection.document.embeddingModelId}</span>}
                  {documentInspection.document.embeddingDimensions && <span>{documentInspection.document.embeddingDimensions} dimensions</span>}
                </div>
                {documentInspection.document.status === "failed" && (
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => handleRetryDocument(documentInspection.document.documentId)}
                      disabled={repairingDocumentIds[documentInspection.document.documentId]}
                      className="h-8 px-3 rounded-[8px] border border-amber-500/20 bg-amber-500/10 text-amber-200 text-[12px] font-semibold flex items-center gap-2 disabled:opacity-50"
                    >
                      {repairingDocumentIds[documentInspection.document.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                      Retry ingestion
                    </button>
                  </div>
                )}
              </div>

              <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex gap-3 text-amber-200">
                <Database className="w-4 h-4 mt-0.5 shrink-0" />
                <p className="text-[13px] leading-relaxed">{documentInspection.safetyNotice}</p>
              </div>

              {documentInspection.embeddingDrift && (
                <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 flex flex-col gap-2 text-amber-100">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="text-[13px] font-semibold">Embedding model drift detected</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] font-mono text-amber-100/80">
                    <div>Stored: {documentInspection.embeddingDrift.storedModelId || "unknown"} ({documentInspection.embeddingDrift.storedDimensions || "?"} dims)</div>
                    <div>Active: {documentInspection.embeddingDrift.activeModelId} ({documentInspection.embeddingDrift.activeDimensions || "?"} dims)</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRetryDocument(documentInspection.document.documentId)}
                    disabled={repairingDocumentIds[documentInspection.document.documentId]}
                    className="h-8 px-3 rounded-[8px] border border-amber-500/20 bg-black/20 text-amber-100 text-[12px] font-semibold flex items-center gap-2 w-fit disabled:opacity-50"
                  >
                    {repairingDocumentIds[documentInspection.document.documentId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                    Re-embed with active model
                  </button>
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
            <button
              onClick={handleConfirmBulkDelete}
              disabled={isDeletingBulk}
              className="px-4 py-2 rounded-md bg-red-500 text-white transition-colors text-[13px] font-medium flex items-center gap-2 hover:bg-red-600"
            >
              {isDeletingBulk && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Delete Everything
            </button>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
