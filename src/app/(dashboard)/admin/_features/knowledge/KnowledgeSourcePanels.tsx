"use client";

import type { KeyboardEvent, ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AlertCircle,
  AlertTriangle,
  AlignLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Globe,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";
import { InlineSearchInput } from "@/src/ui/components/screens/Table";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { formatDate } from "@/src/lib/dates";
import type { RenderInspectAction } from "./KnowledgeManagerSections";

type KnowledgeDocument = Doc<"knowledgeDocuments">;
type KnowledgeDocumentId = Id<"knowledgeDocuments">;
type DocumentEvidence = FunctionReturnType<typeof api.knowledgeEvidence.getDocumentEvidenceForCompany>[number];

export function KnowledgeTextPanel({
  title,
  content,
  isSaving,
  onTitleChange,
  onContentChange,
  onSave,
}: {
  title: string;
  content: string;
  isSaving: boolean;
  onTitleChange: (value: string) => void;
  onContentChange: (value: string) => void;
  onSave: () => void;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <div className="bg-sidebar/30 border border-border-dim rounded-[16px] p-6">
      <h3 className="text-sm font-bold mb-4">{t("text.heading")}</h3>
      <div className="flex flex-col gap-4">
        <Field
          label={t("text.titleLabel")}
          type="text"
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder={t("text.titlePlaceholder")}
          className="h-auto bg-background px-4 py-3 focus:border-brand"
        />
        <TextAreaField
          label={t("text.textLabel")}
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          placeholder={t("text.textPlaceholder")}
          rows={6}
          className="resize-y bg-background focus:border-brand"
        />
        <div className="flex justify-end">
          <WriteButton
            onClick={onSave}
            disabled={isSaving || !title.trim() || !content.trim()}
            className="h-10 px-6 rounded-[8px] bg-secondary text-background font-medium text-[13px] hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t("text.addText")}
          </WriteButton>
        </div>
      </div>
    </div>
  );
}

export function KnowledgeWebsitePanel({
  error,
  url,
  onUrlChange,
  onUrlKeyDown,
  isMapping,
  isQueueing,
  mappedUrls,
  onQueueMappedUrls,
  isLoadingDocuments,
  groups,
  expandedGroups,
  onToggleGroup,
  searchTerms,
  onSearchTermChange,
  refreshingRoots,
  onRefreshRoot,
  onDeleteRoot,
  repairingDocumentIds,
  onRetryDocument,
  onDeleteDocument,
  renderInspectAction,
}: {
  error: string;
  url: string;
  onUrlChange: (value: string) => void;
  onUrlKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  isMapping: boolean;
  isQueueing: boolean;
  mappedUrls: string[];
  onQueueMappedUrls: () => void;
  isLoadingDocuments: boolean;
  groups: Record<string, KnowledgeDocument[]>;
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (root: string) => void;
  searchTerms: Record<string, string>;
  onSearchTermChange: (root: string, value: string) => void;
  refreshingRoots: Record<string, boolean>;
  onRefreshRoot: (root: string) => void;
  onDeleteRoot: (root: string) => void;
  repairingDocumentIds: Record<string, boolean>;
  onRetryDocument: (documentId: KnowledgeDocumentId) => void;
  onDeleteDocument: (document: KnowledgeDocument) => void;
  renderInspectAction: RenderInspectAction;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-sidebar/30 border border-border-dim rounded-[16px] p-6">
        <h3 className="text-sm font-bold mb-4">{t("website.heading")}</h3>
        {error && (
          <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-[13px] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{error}</span>
          </div>
        )}
        {/* The heading above says "Website URL", so the name is kept for a
            screen reader and not repeated on screen. A hidden label sits
            outside the flow, so the field is exactly as tall as its box
            and the state icon still centres on it. */}
        <div className="relative">
          <Field
            label={t("website.urlLabel")}
            type="text"
            value={url}
            onChange={(event) => onUrlChange(event.target.value)}
            onKeyDown={onUrlKeyDown}
            placeholder={t("website.urlPlaceholder")}
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
              <span>{t("website.found", { count: mappedUrls.length })}</span>
              <Button
                variant="brand"
                onClick={onQueueMappedUrls}
                disabled={isQueueing}
                className="py-1.5 rounded-md flex items-center gap-2"
              >
                {isQueueing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {t("website.queueAll")}
              </Button>
            </div>
            <div className="max-h-[300px] overflow-y-auto border border-border-dim rounded-[8px] bg-background text-[12px]">
              {mappedUrls.map((mappedUrl) => (
                <div key={mappedUrl} className="py-2 px-3 border-b border-border-dim/50 last:border-0 truncate text-muted">
                  {mappedUrl}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-[11px] font-bold tracking-widest text-secondary uppercase">{t("website.trained")}</h3>
          <p className="text-[12px] text-muted">
            {t("website.trainedHint")}
          </p>
        </div>

        {isLoadingDocuments && (
          <div className="py-12 flex justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-brand" />
          </div>
        )}

        {!isLoadingDocuments && Object.keys(groups).length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
            <Globe className="w-9 h-9 text-brand mb-4 opacity-80" />
            <h3 className="text-sm font-medium text-foreground mb-1">{t("website.emptyTitle")}</h3>
            <p className="text-[13px] text-secondary max-w-sm">
              {t("website.emptyDescription")}
            </p>
          </div>
        )}

        {!isLoadingDocuments && Object.entries(groups).map(([root, docs]) => {
          const isExpanded = expandedGroups[root];
          const searchTerm = searchTerms[root] ?? "";
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
                      <span className="font-mono tracking-wide">{t("website.progress", { ready: readyDocs, total: totalDocs, pct: progressPct })}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Raw: square icon chip with a brand hover — the icon variant's round shape and grey hover match no pixel of it. */}
                  <button
                    onClick={() => onRefreshRoot(root)}
                    disabled={isRefreshing}
                    title={t("website.refreshTitle")}
                    className="p-1.5 rounded-lg text-secondary hover:text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  </button>
                  <WriteButton
                    onClick={() => onDeleteRoot(root)}
                    title={t("website.deleteDomainTitle")}
                    className="p-1.5 rounded-lg text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </WriteButton>
                  {/* Raw: borderless brand-tinted expander — accent's border and hover shade match no pixel of it. */}
                  <button onClick={() => onToggleGroup(root)} className="ml-2 flex items-center gap-1 bg-brand/10 text-brand px-3 py-1 rounded-md text-[13px] font-medium hover:bg-brand/20 transition-colors">
                    {t("website.pages", { count: totalDocs })} {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {isExpanded && (
                <div className="flex flex-col border-t border-border-dim bg-background">
                  <div className="px-4 py-3 border-b border-border-dim/50">
                    <InlineSearchInput
                      value={searchTerm}
                      onChange={(next) => onSearchTermChange(root, next)}
                      placeholder={t("website.searchPlaceholder")}
                    />
                  </div>
                  <div className="p-2 text-[12px] font-medium text-secondary">
                    {normalizedSearchTerm
                      ? t("website.matching", { count: visibleDocs.length })
                      : t("website.list")}
                  </div>
                  {visibleDocs.length === 0 && (
                    <div className="px-4 py-8 text-[13px] text-secondary border-t border-border-dim/20">
                      {t("website.noSearchMatches")}
                    </div>
                  )}
                  {visibleDocs.map((document) => (
                    <div key={document._id} className="flex items-center justify-between py-2.5 px-4 hover:bg-foreground/[0.02] border-t border-border-dim/20 group">
                      <a href={document.sourceUrl} target="_blank" rel="noreferrer" className="text-[13px] text-brand hover:underline truncate mr-4">
                        {document.sourceUrl}
                      </a>
                      <div className="flex items-center gap-3">
                        {document.status === "pending" && <StatusPill tone="warning" className="rounded-sm border-0 uppercase font-bold">{t("website.pending")}</StatusPill>}
                        {document.status === "processing" && <StatusPill tone="warning" icon={<Loader2 className="w-3 h-3 animate-spin" />} className="rounded-sm border-0 uppercase font-bold">{t("website.processing")}</StatusPill>}
                        {document.status === "failed" && <StatusPill tone="danger" icon={<AlertTriangle className="w-3 h-3" />} className="rounded-sm border-0 uppercase font-bold">{t("website.failed")}</StatusPill>}
                        {renderInspectAction(
                          document._id,
                          document,
                          "text-secondary hover:text-brand transition-colors opacity-50 group-hover:opacity-100",
                        )}
                        {document.status === "failed" && (
                          <WriteButton
                            onClick={() => onRetryDocument(document._id)}
                            disabled={repairingDocumentIds[document._id]}
                            className="text-secondary hover:text-warning transition-colors opacity-50 group-hover:opacity-100 disabled:opacity-50"
                            title={t("actions.retryIngestion")}
                          >
                            {repairingDocumentIds[document._id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                          </WriteButton>
                        )}
                        <WriteButton
                          onClick={() => onDeleteDocument(document)}
                          className="text-secondary hover:text-destructive transition-colors opacity-50 group-hover:opacity-100"
                          title={t("actions.deleteDocument")}
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
  );
}

export function KnowledgeFilesPanel({
  documents,
  isLoading,
  emptyDescription,
  evidenceByDocument,
  repairingDocumentIds,
  onUploadClick,
  onRetryDocument,
  onDeleteDocument,
  renderInspectAction,
}: {
  documents: KnowledgeDocument[];
  isLoading: boolean;
  emptyDescription: ReactNode;
  evidenceByDocument: Map<string, DocumentEvidence>;
  repairingDocumentIds: Record<string, boolean>;
  onUploadClick: () => void;
  onRetryDocument: (documentId: KnowledgeDocumentId) => void;
  onDeleteDocument: (document: KnowledgeDocument) => void;
  renderInspectAction: RenderInspectAction;
}) {
  const t = useTranslations("ai.knowledge.manager");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {/* Raw: the dark CTA drawn with the opacity hover and no glow — primary would change its hover and add a shadow. */}
        <button
          onClick={onUploadClick}
          className="h-9 px-4 rounded-[10px] bg-foreground text-background font-medium text-[13px] flex items-center gap-2 hover:opacity-90 transition-all"
        >
          <Upload className="w-3.5 h-3.5" />
          {t("file.upload")}
        </button>
      </div>

      {isLoading ? (
        <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
      ) : documents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
          <FileText className="w-10 h-10 text-brand mb-4 opacity-80" />
          <h3 className="text-sm font-medium text-foreground mb-1">{t("file.emptyTitle")}</h3>
          <p className="text-[13px] text-secondary max-w-sm">
            {emptyDescription}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 mt-2">
          {documents.map((document) => (
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
                        <span className="text-info">{t("file.ratedHelpful", { count: evidence.positiveEvidence })}</span>
                        <span className="text-muted">·</span>
                        <span className="text-warning">{t("file.ratedNotRight", { count: evidence.negativeEvidence })}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="flex items-center gap-4">
                {document.status === "processing" && (
                  <StatusPill tone="warning" size="md" icon={<Loader2 className="w-3.5 h-3.5 animate-spin" />} className="gap-2 px-3 py-1.5 font-bold tracking-widest uppercase font-mono">
                    {t("file.ingesting")}
                  </StatusPill>
                )}
                {document.status === "ready" && (
                  <StatusPill tone="success" size="md" icon={<CheckCircle2 className="w-3.5 h-3.5" />} className="gap-2 px-3 py-1.5 font-bold tracking-widest uppercase font-mono">
                    {t("file.ready")}
                  </StatusPill>
                )}
                {document.status === "failed" && (
                  <StatusPill tone="danger" size="md" icon={<AlertTriangle className="w-3.5 h-3.5" />} className="gap-2 px-3 py-1.5 font-bold tracking-widest uppercase font-mono">
                    {t("file.failed")}
                  </StatusPill>
                )}

                {renderInspectAction(
                  document._id,
                  document,
                  "p-2 rounded-lg border border-transparent text-secondary hover:text-brand hover:bg-brand/10 transition-colors opacity-0 group-hover:opacity-100",
                )}

                {document.status === "failed" && (
                  <WriteButton
                    onClick={() => onRetryDocument(document._id)}
                    disabled={repairingDocumentIds[document._id]}
                    className="p-2 rounded-lg border border-transparent text-secondary hover:text-warning hover:bg-warning/10 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                    title={t("actions.retryIngestion")}
                  >
                    {repairingDocumentIds[document._id] ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
                  </WriteButton>
                )}

                <WriteButton
                  onClick={() => onDeleteDocument(document)}
                  className="p-2 rounded-lg border border-transparent text-secondary hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
                  title={t("actions.deleteDocument")}
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
}
