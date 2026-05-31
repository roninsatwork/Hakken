"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Search,
  Loader2,
  MessageSquareText,
  ShieldAlert,
  Bot,
  ChevronLeft,
  ChevronRight,
  Database,
  Copy,
  Check
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { SonaeMarkdown } from "../../../../../ui/components/chat/SonaeMarkdown";

export default function ChatLogsDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<Id<"threads"> | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const t = useTranslations("ai.chatLogs");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  // Pagination bounds
  const paginatedData = useQuery(api.chatAdmin.getOffsetPaginatedThreads, {
    searchTerm,
    page: currentPage,
    pageSize: itemsPerPage,
  });

  const results = paginatedData?.data || [];
  const status = paginatedData === undefined ? "LoadingFirstPage" : "Done";
  const totalCount = paginatedData?.totalCount || 0;
  const totalPages = paginatedData?.totalPages || 1;

  // Message Extractor securely bound to current selection
  const messages = useQuery(
    api.chatAdmin.getAdminThreadMessages,
    selectedThreadId ? { threadId: selectedThreadId } : "skip"
  );

  const handleCopyChat = async () => {
    if (!messages || messages.length === 0) return;
    const activeThread = results.find((t) => t._id === selectedThreadId);

    let htmlContent = `<div style="font-family: Arial, sans-serif; max-width: 800px; line-height: 1.5; color: #333;">`;
    let textContent = "";
    
    try {
      htmlContent += `<h2 style="margin-bottom: 4px;">Chat Log: ${activeThread?.title || "Unknown"}</h2>`;
      const dateStr = activeThread
        ? new Intl.DateTimeFormat("en-GB", { dateStyle: "full", timeStyle: "short" }).format(new Date(activeThread.createdAt))
        : new Date().toLocaleString();
      htmlContent += `<p style="color: #666; font-size: 13px; margin-top: 0;">${dateStr}</p>`;
      htmlContent += `<hr style="border: none; border-bottom: 1px solid #eaeaea; margin: 20px 0;" />`;

      textContent += `Chat Log: ${activeThread?.title || "Unknown"}\n`;
      textContent += `Date: ${dateStr}\n`;
      textContent += `-------------------------------------------------\n\n`;

      let msgHtml = "";

      messages.forEach((msg) => {
        const isUser = msg.role === "user";
        const senderName = isUser ? activeThread?.user?.name || t("viewer.userLabel") : "Sonae";
        const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(new Date(msg._creationTime));

        // Format basic Markdown to HTML
        let formattedHtml = msg.content
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.*?)\*/g, "<em>$1</em>")
          .replace(/`{3}([\s\S]*?)`{3}/g, '<pre style="background: #f4f5f7; padding: 12px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 12px;">$1</pre>')
          .replace(/`(.*?)`/g, '<code style="background: #f4f5f7; padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 12px;">$1</code>')
          .replace(/\n\n/g, "</p><p>")
          .replace(/\n/g, "<br/>");

        // Better Lists
        formattedHtml = formattedHtml.replace(/(<br\/>)?- (.*)/g, "<li>$2</li>");
        formattedHtml = formattedHtml.replace(/(<li>[\s\S]*<\/li>)/, '<ul style="margin-top: 4px; margin-bottom: 4px; padding-left: 20px;">$1</ul>');

        msgHtml += `<div style="margin-bottom: 24px;">`;
        msgHtml += `<div style="margin-bottom: 4px;">`;
        msgHtml += `<strong style="color: ${isUser ? "#000" : "#4f46e5"}">${senderName}</strong> <span style="color: #999; font-size: 11px; margin-left: 8px;">${time}</span>`;
        msgHtml += `</div>`;
        msgHtml += `<div style="font-size: 14px; background: ${isUser ? "#f9f9f9" : "#fff"}; border: 1px solid ${isUser ? "#eee" : "#e0e7ff"}; padding: 12px; border-radius: 8px;">`;
        msgHtml += `<p style="margin: 0;">${formattedHtml}</p>`;
        msgHtml += `</div></div>`;

        textContent += `[${time}] ${senderName}:\n${msg.content}\n\n`;
      });

      htmlContent += msgHtml;
      htmlContent += `</div>`;

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

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] w-full antialiased overflow-hidden">
      {/* Header Block */}
      <header className="flex items-start justify-between w-full mb-6 shrink-0">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Database className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary tracking-wide">
            {t("subtitle")}
          </p>
        </div>

        {/* Right Aligned Header Actions */}
        {selectedThreadId && messages && messages.length > 0 && (
          <button
            onClick={handleCopyChat}
            className="flex items-center gap-2 px-4 py-2.5 bg-foreground/5 hover:bg-foreground/10 border border-border-dim rounded-[12px] transition-colors text-secondary hover:text-foreground shadow-sm shrink-0"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-500 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
            <span className="text-[13px] font-semibold tracking-wide">
              {isCopied ? "Copied" : "Copy Chat Transcript"}
            </span>
          </button>
        )}
      </header>

      {/* Split Pane Architecture */}
      <div className="flex flex-1 gap-6 min-h-0 relative">

        {/* Left Column: Log Roster */}
        <div className="w-[320px] lg:w-[400px] flex flex-col shrink-0 border border-border-dim rounded-[20px] bg-card/40 backdrop-blur-3xl overflow-hidden shadow-sm">

          {/* Roster Search Bar */}
          <div className="p-4 border-b border-border-dim bg-background/50">
            <div className="flex items-center gap-3 px-4 py-3 bg-foreground/5 rounded-[12px] border border-border-dim focus-within:border-brand/40 transition-colors">
              <Search className="w-4 h-4 text-muted shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t("searchPlaceholder")}
                className="flex-1 bg-transparent border-none outline-none text-[13px] text-foreground placeholder:text-muted/60 tracking-wide"
              />
            </div>
          </div>

          {/* Roster Thread List */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 flex flex-col gap-2">
            {status === "LoadingFirstPage" && (
              <div className="flex flex-col items-center justify-center p-12 text-muted gap-4">
                <Loader2 className="w-6 h-6 animate-spin opacity-50" />
                <span className="text-[12px] uppercase tracking-widest font-mono">{t("status.loading")}</span>
              </div>
            )}

            {status !== "LoadingFirstPage" && results.length === 0 && (
              <div className="flex flex-col items-center justify-center p-10 text-muted gap-3 opacity-60">
                <ShieldAlert className="w-8 h-8" />
                <span className="text-[13px] font-medium tracking-wide">{t("status.noTraces")}</span>
              </div>
            )}

            <AnimatePresence>
              {results.map((thread) => (
                <motion.button
                  key={thread._id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  onClick={() => setSelectedThreadId(thread._id as Id<"threads">)}
                  className={`shrink-0 flex items-center gap-3 w-full text-left px-3 py-3 rounded-[12px] border transition-all relative overflow-hidden group ${selectedThreadId === thread._id
                    ? "bg-brand/10 border-brand/40 shadow-inner"
                    : "bg-transparent border-transparent hover:bg-foreground/5 hover:border-border-dim"
                    }`}
                >
                  {/* Active Indicator Glow */}
                  {selectedThreadId === thread._id && (
                    <div className="absolute top-0 right-0 w-32 h-32 bg-brand/20 blur-[40px] rounded-full pointer-events-none -translate-y-16 translate-x-12" />
                  )}

                  <Image
                    src={thread.user?.image || "https://api.dicebear.com/7.x/notionists/svg"}
                    alt="User"
                    width={32}
                    height={32}
                    unoptimized
                    className="w-8 h-8 rounded-full border border-border-dim object-cover shrink-0 relative z-10"
                  />

                  <div className="flex flex-col w-full min-w-0 relative z-10">
                    <div className="flex items-start justify-between w-full gap-2">
                      <h3 className={`text-[13px] font-semibold truncate flex-1 ${selectedThreadId === thread._id ? "text-brand" : "text-foreground"} group-hover:text-brand transition-colors`}>
                        {thread.title}
                      </h3>
                      <span className="text-[10px] text-muted font-mono tracking-widest shrink-0 uppercase mt-[2px]">
                        {new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric' }).format(new Date(thread.createdAt))}
                      </span>
                    </div>

                    <span className="text-[11px] text-secondary truncate tracking-wide mt-0.5">
                      {thread.user?.name || thread.user?.email || t("viewer.unknownActor")}
                    </span>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>

          {/* Pagination Footer constraints adapted for 320px sidebar */}
          <div className="flex items-center justify-between p-3 border-t border-border-dim bg-background/50 shrink-0">
             <div className="text-[11px] text-muted tracking-wide flex flex-col xl:flex-row xl:gap-1">
                 <span>Showing <strong className="text-foreground">{totalCount === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</strong></span>
                 <span>to <strong className="text-foreground">{Math.min(currentPage * itemsPerPage, totalCount)}</strong> of <strong className="text-foreground">{totalCount}</strong></span>
             </div>
             <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-[8px] bg-foreground/5 text-secondary hover:text-foreground hover:bg-foreground/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
             </div>
          </div>
        </div>

        {/* Right Column: Interaction Sandbox Viewer */}
        <div className="flex-1 flex flex-col bg-card/30 backdrop-blur-md rounded-[20px] border border-border-dim relative overflow-hidden shadow-inner">
          {selectedThreadId ? (
            <div className="flex flex-col w-full h-full relative">
              {/* Thread Top Bar */}
              <div className="w-full px-8 py-5 border-b border-border-dim bg-background/50 flex flex-col shrink-0 relative z-10">
                <div className="flex items-start justify-between w-full">
                  <div className="flex flex-col">
                    <h2 className="text-[14px] font-semibold tracking-wide text-foreground capitalize">
                      {results.find(t => t._id === selectedThreadId)
                        ? new Intl.DateTimeFormat('en-GB', {
                          weekday: 'long',
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        }).format(new Date(results.find(t => t._id === selectedThreadId)!.createdAt))
                        : t("viewer.traceIntercept")}
                    </h2>
                    <span className="text-[12px] text-muted font-mono tracking-widest uppercase mt-1">{t("viewer.idLabel")}: {selectedThreadId}</span>
                  </div>

                  {/* Thread Financial Telemetry */}
                  {messages && messages.length > 0 && (
                    <div className="flex items-center gap-6 px-4 py-2 bg-foreground/5 border border-border-dim rounded-[12px] shadow-sm">
                      <div className="flex flex-col items-end">
                          <span className="text-[9px] uppercase font-mono tracking-widest text-muted mb-0.5">{t("viewer.tokensHandled")}</span>
                          <span className="text-[14px] font-bold text-foreground">
                          {messages.reduce((acc, msg) => acc + ((msg.inputTokens || 0) + (msg.outputTokens || 0)), 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="w-px h-6 bg-border-dim" />
                      <div className="flex flex-col items-start">
                        <span className="text-[9px] uppercase font-mono tracking-widest text-muted mb-0.5">{t("viewer.estCost")}</span>
                        <span className="text-[14px] font-bold text-brand tracking-wider">
                          £{messages.reduce((acc, msg) => {
                            const i = msg.inputTokens || 0;
                            const o = msg.outputTokens || 0;
                            const m = msg.modelUsed || "gemini-1.5-flash";
                            let usd = 0;
                            if (m.includes("pro")) usd = (i / 1e6) * 3.50 + (o / 1e6) * 10.50;
                            else usd = (i / 1e6) * 0.075 + (o / 1e6) * 0.30;
                            return acc + (usd * 0.78);
                          }, 0).toFixed(5)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Decrypted Payload Thread */}
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 flex flex-col gap-8">
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
                  messages.map((message) => {
                    const isUser = message.role === "user";
                    const activeThread = results.find(t => t._id === selectedThreadId);
                    return (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        key={message._id}
                        className={`flex flex-col gap-2 ${isUser ? "max-w-[85%] self-end" : "w-full self-start"}`}
                      >
                        {/* Log Signature */}
                        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
                          {isUser ? (
                            <Image
                              src={activeThread?.user?.image || "https://api.dicebear.com/7.x/notionists/svg"}
                              alt="User"
                              width={24}
                              height={24}
                              unoptimized
                              className="w-6 h-6 rounded-full border border-border-dim object-cover shrink-0"
                            />
                          ) : (
                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-brand/10 border border-brand/20 text-[10px]">
                              <Bot className="w-3 h-3 text-brand" />
                            </span>
                          )}
                          <span className="text-[11px] font-bold uppercase tracking-widest text-muted flex items-center gap-2">
                            {isUser ? (activeThread?.user?.name || t("viewer.userLabel")) : "Sonae"}
                            <span className="text-[9px] text-muted/60 font-mono tracking-wider ordinal lowercase">
                              {new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(message._creationTime))}
                            </span>
                          </span>
                        </div>

                        {/* Payload Content Area */}
                        <div className={`p-4 rounded-[16px] border text-[13px] leading-[1.6] ${isUser
                          ? "bg-foreground/5 border-border-dim/50 rounded-tr-sm text-foreground/90 whitespace-pre-wrap shadow-sm"
                          : "bg-card/80 backdrop-blur-xl border-border-dim rounded-tl-sm text-secondary shadow-sm overflow-hidden"
                          }`}
                        >
                          {isUser ? message.content : <SonaeMarkdown content={message.content} />}
                        </div>
                      </motion.div>
                    )
                  })
                )}
              </div>
            </div>
          ) : (
            // Empty State
            <div className="w-full h-full flex flex-col items-center justify-center bg-radial-at-c from-foreground/5 to-transparent text-center p-8">
              <ShieldAlert className="w-16 h-16 text-muted/20 mb-6" />
              <h2 className="text-xl font-bold text-foreground tracking-tight">{t("viewer.emptyTitle")}</h2>
              <p className="text-[14px] text-secondary mt-2 max-w-sm leading-relaxed">
                {t("viewer.emptyDesc")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
