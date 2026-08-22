"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Loader2,
  MessageSquareText,
  ShieldAlert,
  Database,
  Copy,
  Check,
  BrainCircuit,
  ClipboardCheck,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import ChatMessage from "@/src/ui/components/chat/ChatMessage";
import { LoadMoreFooter } from "@/src/ui/components/screens/Table";
import { CompanyMemoryEvidence } from "@/src/app/(dashboard)/admin/_components/CompanyMemoryEvidence";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatEstimatedChatCostUsd, getChatTokenTotal } from "@/src/lib/chatTelemetry";
import { buildChatTranscript } from "@/src/lib/chatTranscript";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";
import { LAYER } from "@/src/ui/lib/layers";

/**
 * The chat-logs screen, shared between the platform view and the per-company
 * view (maintenance plan, phase 5).
 *
 * These lived as a copy-paste pair — the same split-pane layout, the same
 * five-line comment, duplicated verbatim in `admin/ai/chat-logs` and
 * `admin/companies/[id]/ai/chat-logs` — the last screen pair still holding
 * the old shape after the eleven `_features/` screens were extracted. What
 * genuinely differs is carried by `scope`: which query feeds the roster, the
 * widget-aware naming a company's threads need, the memory-candidate and
 * eval actions that only make sense inside one company, and the measured
 * viewport height the company layout uses.
 */
export type ChatLogsScope =
  | { kind: "global" }
  | { kind: "company"; companyId: Id<"companies"> };

type ThreadRow = {
  _id: string;
  title?: string | null;
  createdAt: number;
  widgetId?: string | null;
  sourceUrl?: string | null;
  user?: { name?: string | null; email?: string | null } | null;
};

export function ChatLogsScreen({ scope }: { scope: ChatLogsScope }) {
  const t = useTranslations("ai.chatLogs");
  const { platformName } = useSystemSettings();
  const containerRef = useRef<HTMLDivElement>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<Id<"threads"> | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [availableHeight, setAvailableHeight] = useState<number | null>(null);

  // A column of conversations is read by scrolling, not by turning pages, so
  // it loads a batch at a time the way Ask Sonae's own history does. The pager
  // that used to sit here had three sets of controls in a 320px column and wore
  // more space than the conversations it was counting.
  //
  // Hooks cannot be called conditionally, so both queries are declared and the
  // one outside the scope is skipped — the house pattern for a scoped screen.
  const globalThreads = usePaginatedQuery(
    api.chatAdmin.getPaginatedThreads,
    scope.kind === "global" ? { searchTerm } : "skip",
    { initialNumItems: TABLE_PAGE_SIZE },
  );
  const companyThreads = usePaginatedQuery(
    api.chatAdmin.getPaginatedCompanyThreads,
    scope.kind === "company" ? { companyId: scope.companyId, searchTerm } : "skip",
    { initialNumItems: TABLE_PAGE_SIZE },
  );
  const threads = scope.kind === "company" ? companyThreads : globalThreads;
  const results: ThreadRow[] = threads.results;
  const isFirstPageLoading = threads.status === "LoadingFirstPage";

  // Message Extractor securely bound to current selection
  const messages = useQuery(
    api.chatAdmin.getAdminThreadMessages,
    selectedThreadId ? { threadId: selectedThreadId } : "skip"
  );

  // The company layout sizes itself to the height actually left below the
  // company header instead of assuming a fixed chrome height.
  useEffect(() => {
    if (scope.kind !== "company") return;
    const updateAvailableHeight = () => {
      if (!containerRef.current) return;
      const { top } = containerRef.current.getBoundingClientRect();
      setAvailableHeight(Math.max(1, window.innerHeight - top - 24));
    };

    updateAvailableHeight();
    window.addEventListener("resize", updateAvailableHeight);
    return () => window.removeEventListener("resize", updateAvailableHeight);
  }, [scope.kind]);

  const labels = scope.kind === "company"
    ? {
      title: t("company.title"),
      subtitle: t("company.subtitle"),
      searchPlaceholder: t("company.searchPlaceholder"),
      clearSearch: t("company.clearSearch"),
      noTraces: t("company.noTraces"),
      traceIntercept: t("company.traceIntercept"),
      emptyTitle: t("company.emptyTitle"),
      emptyDesc: t("company.emptyDesc"),
      copy: t("company.actions.copy"),
      copied: t("company.actions.copied"),
      transcriptUser: t("company.visitorLabel"),
    }
    : {
      title: t("title"),
      subtitle: t("subtitle"),
      searchPlaceholder: t("searchPlaceholder"),
      clearSearch: t("searchPlaceholder"),
      noTraces: t("status.noTraces"),
      traceIntercept: t("viewer.traceIntercept"),
      emptyTitle: t("viewer.emptyTitle"),
      emptyDesc: t("viewer.emptyDesc"),
      copy: t("copyAction.copy"),
      copied: t("copyAction.copied"),
      transcriptUser: t("viewer.userLabel"),
    };

  const askerFor = (thread: ThreadRow) => {
    if (scope.kind === "company" && thread.widgetId) {
      return thread.sourceUrl
        ? t("company.widgetSource", { url: thread.sourceUrl })
        : t("company.widgetLabel");
    }
    return thread.user?.name || thread.user?.email || t("viewer.unknownActor");
  };

  const askedByLabelFor = (thread: ThreadRow | undefined) => {
    if (scope.kind === "company" && thread?.widgetId) return t("company.widgetVisitor");
    return thread?.user?.name || t("viewer.userLabel");
  };

  const handleCopyChat = async () => {
    if (!messages || messages.length === 0) return;
    const activeThread = results.find((thread) => thread._id === selectedThreadId);
    const { htmlContent, textContent } = buildChatTranscript({
      thread: activeThread,
      messages,
      userLabel: labels.transcriptUser,
      assistantLabel: platformName,
    });

    try {
      // Use the Clipboard API with HTML
      const clipboardItem = new ClipboardItem({
        "text/html": new Blob([htmlContent], { type: "text/html" }),
        "text/plain": new Blob([textContent], { type: "text/plain" }),
      });
      await navigator.clipboard.write([clipboardItem]);

      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      // Fallback
      navigator.clipboard.writeText(textContent);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const latestAssistantMessage = (messages ?? [])
    .filter((message) => message.role === "assistant")
    .at(-1);
  const companyBase = scope.kind === "company"
    ? `/admin/companies/${scope.companyId}/ai/chat-logs`
    : null;
  const actionQuery = selectedThreadId
    ? new URLSearchParams({
      ...(latestAssistantMessage ? { messageId: latestAssistantMessage._id } : {}),
      returnTo: companyBase ?? "",
    }).toString()
    : null;

  const HeaderIcon = scope.kind === "company" ? MessageSquareText : Database;

  return (
    <div
      ref={containerRef}
      data-testid={scope.kind === "company" ? "company-chat-logs-shell" : undefined}
      className={`flex w-full flex-col overflow-hidden antialiased ${
        scope.kind === "global" ? "h-[calc(100vh-140px)]" : ""
      }`}
      style={
        scope.kind === "company" && availableHeight
          ? { height: availableHeight, maxHeight: availableHeight }
          : undefined
      }
    >
      {/* Header Block */}
      {/* The AI workspace's header anatomy is title, rule, tab strip; the
          company variant sits inside the company's own tabs, where headers
          carry no rule. */}
      <header className={`flex items-start justify-between w-full mb-6 shrink-0 ${scope.kind === "global" ? "border-b border-border-dim pb-6" : ""}`}>
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <HeaderIcon className="w-6 h-6 text-brand" />
            {labels.title}
          </h1>
          <p className="text-[13px] text-secondary tracking-wide">
            {labels.subtitle}
          </p>
        </div>

        {/* Right Aligned Header Actions */}
        {selectedThreadId && messages && messages.length > 0 && (
          <div className="flex flex-wrap justify-end gap-2">
            {companyBase && actionQuery && (
              <>
                <Link
                  href={`${companyBase}/${selectedThreadId}/memory-candidate/new?${actionQuery}`}
                  className="flex items-center gap-2 px-4 py-2.5 bg-brand/10 hover:bg-brand/15 border border-brand/20 rounded-[12px] transition-colors text-brand shadow-sm shrink-0"
                >
                  <BrainCircuit className="w-4 h-4 shrink-0" />
                  <span className="text-[13px] font-semibold tracking-wide">{t("company.actions.memoryCandidate")}</span>
                </Link>
                <Link
                  href={`${companyBase}/${selectedThreadId}/evals/new?${actionQuery}`}
                  className="flex items-center gap-2 px-4 py-2.5 bg-foreground/5 hover:bg-foreground/10 border border-border-dim rounded-[12px] transition-colors text-secondary hover:text-foreground shadow-sm shrink-0"
                >
                  <ClipboardCheck className="w-4 h-4 shrink-0 text-brand" />
                  <span className="text-[13px] font-semibold tracking-wide">{t("company.actions.createEval")}</span>
                </Link>
              </>
            )}
            {/* Raw: one-off copy chip — its foreground/5 fill and 12px radius match no variant's colours. */}
            <button
              type="button"
              onClick={handleCopyChat}
              className="flex items-center gap-2 px-4 py-2.5 bg-foreground/5 hover:bg-foreground/10 border border-border-dim rounded-[12px] transition-colors text-secondary hover:text-foreground shadow-sm shrink-0"
            >
              {isCopied ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
              <span className="text-[13px] font-semibold tracking-wide">
                {isCopied ? labels.copied : labels.copy}
              </span>
            </button>
          </div>
        )}
      </header>

      {scope.kind === "global" && <AiWorkspaceNav />}

      {/* Split Pane Architecture */}
      <div className="flex flex-1 gap-6 min-h-0 relative">

        {/* Left Column: Log Roster */}
        <div className="w-[320px] lg:w-[400px] flex flex-col shrink-0 overflow-hidden">

          {/* Roster Search Bar */}
          <div className="pb-5 pr-1">
            <div className="flex">
              <TableSearchInput
                variant="underline"
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder={labels.searchPlaceholder}
                clearLabel={labels.clearSearch}
              />
            </div>
          </div>

          {/* Roster Thread List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 flex flex-col">
            {isFirstPageLoading && (
              <div className="flex flex-col items-center justify-center p-12 text-muted gap-4">
                <Loader2 className="w-6 h-6 animate-spin opacity-50" />
                <span className="text-[12px] uppercase tracking-widest font-mono">{t("status.loading")}</span>
              </div>
            )}

            {!isFirstPageLoading && results.length === 0 && (
              <div className="flex flex-col items-center justify-center p-10 text-muted gap-3 opacity-60">
                <ShieldAlert className="w-8 h-8" />
                <span className="text-[13px] font-medium tracking-wide">{labels.noTraces}</span>
              </div>
            )}

            {results.map((thread) => {
              const isSelected = selectedThreadId === thread._id;
              return (
                // A thin accent bar marks the open conversation instead of a
                // filled block — the same mark Ask Sonae uses, and it reads at
                // a glance down a column of similar titles.
                /* Raw: a whole list row is the hit target — a layout, not a button recipe. */
                <button
                  key={thread._id}
                  type="button"
                  onClick={() => setSelectedThreadId(thread._id as Id<"threads">)}
                  className={`group shrink-0 flex items-baseline gap-3 w-full text-left py-2 pl-3 pr-1 border-l-2 transition-colors ${
                    isSelected ? "border-brand" : "border-transparent hover:border-border-dim"
                  }`}
                >
                  <span className="flex flex-col min-w-0 flex-1">
                    <span className={`truncate text-[13px] ${
                      isSelected
                        ? "text-foreground font-medium"
                        : "text-secondary font-light group-hover:text-foreground/80"
                    }`}>
                      {thread.title}
                    </span>
                    <span className="truncate text-[11px] text-muted mt-0.5">{askerFor(thread)}</span>
                  </span>
                  <span className="text-[10px] tabular-nums uppercase text-muted shrink-0">
                    {new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(new Date(thread.createdAt))}
                  </span>
                </button>
              );
            })}
          </div>

          <LoadMoreFooter
            variant="quiet"
            visibleCount={results.length}
            canLoadMore={threads.status === "CanLoadMore"}
            isLoading={isFirstPageLoading || threads.status === "LoadingMore"}
            onLoadMore={() => threads.loadMore(TABLE_PAGE_SIZE)}
            labels={{ empty: labels.noTraces }}
          />
        </div>

        {/* Right Column: Interaction Sandbox Viewer */}
        <div className="flex-1 flex flex-col border-l border-border-dim relative overflow-hidden">
          {selectedThreadId ? (
            <div className="flex flex-col w-full h-full relative">
              {/* Thread Top Bar */}
              <div className={`w-full px-8 py-5 border-b border-border-dim flex flex-col shrink-0 relative ${LAYER.RAISED} ${
                scope.kind === "company" ? "bg-background/50" : ""
              }`}>
                <div className="flex items-start justify-between w-full">
                  <div className="flex flex-col">
                    <h2 className="text-[14px] font-semibold tracking-wide text-foreground capitalize">
                      {results.find((thread) => thread._id === selectedThreadId)
                        ? new Intl.DateTimeFormat('en-GB', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }).format(new Date(results.find((thread) => thread._id === selectedThreadId)!.createdAt))
                        : labels.traceIntercept}
                    </h2>
                    <span className="text-[12px] text-muted font-mono tracking-widest uppercase mt-1">{t("viewer.idLabel")}: {selectedThreadId}</span>
                  </div>

                  {/* Thread Financial Telemetry */}
                  {messages && messages.length > 0 && (
                    <div className="flex items-center gap-6">
                      <div className="flex flex-col items-end">
                          <span className="text-[9px] uppercase font-mono tracking-widest text-muted mb-0.5">{t("viewer.tokensHandled")}</span>
                          <span className="text-[14px] font-bold text-foreground">
                          {getChatTokenTotal(messages).toLocaleString()}
                        </span>
                      </div>
                      <div className="w-px h-6 bg-border-dim" />
                      <div className="flex flex-col items-start">
                        <span className="text-[9px] uppercase font-mono tracking-widest text-muted mb-0.5">{t("viewer.estCost")}</span>
                        <span className="text-[14px] font-bold text-brand tracking-wider">
                          ${formatEstimatedChatCostUsd(messages)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Decrypted Payload Thread */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col">
                {messages === undefined ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted gap-2 opacity-50">
                    <MessageSquareText className="w-8 h-8" />
                    <span className="text-[13px] tracking-widest font-mono uppercase">{t("status.logEmpty")}</span>
                  </div>
                ) : (
                  <div className="w-full max-w-[660px] mx-auto flex flex-col">
                    {messages.map((message) => {
                      const activeThread = results.find((thread) => thread._id === selectedThreadId);
                      return (
                        <ChatMessage
                          key={message._id}
                          message={message}
                          askedByLabel={askedByLabelFor(activeThread)}
                          isReadOnly
                          footer={
                            <CompanyMemoryEvidence evidenceJson={message.companyMemoryEvidenceJson} />
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Empty State
            <div className="w-full h-full flex flex-col items-center justify-center bg-radial-at-c from-foreground/5 to-transparent text-center p-8">
              <ShieldAlert className="w-16 h-16 text-muted/20 mb-6" />
              <h2 className="text-xl font-bold text-foreground tracking-tight">{labels.emptyTitle}</h2>
              <p className="text-[14px] text-secondary mt-2 max-w-sm leading-relaxed">
                {labels.emptyDesc}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
