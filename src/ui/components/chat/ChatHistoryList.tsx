"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useMutation, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Plus, Loader2, Search, PencilLine, Check, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { Id } from "@/convex/_generated/dataModel";
import { formatThreadStamp, groupThreadsByDay } from "@/src/lib/threadGrouping";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";

/** One sidebar page. Small enough to load instantly, big enough to scroll. */
export const THREAD_PAGE_SIZE = 25;

export default function ChatHistoryList() {
  const t = useTranslations("ai.assistant.history");
  const { platformName } = useSystemSettings();
  const [searchQuery, setSearchQuery] = useState("");

  // Pages from the database, and the search asks the database too — the
  // previous version loaded the newest 100 and filtered those in the
  // browser, so older conversations were unfindable by scroll or search.
  const { results: threads, status: threadsStatus, loadMore } = usePaginatedQuery(
    api.chat.getThreads,
    { searchTerm: searchQuery.trim() || undefined },
    { initialNumItems: THREAD_PAGE_SIZE },
  );

  const renameThread = useMutation(api.chat.renameThread);
  const deleteThread = useMutation(api.chat.deleteThread);
  const renameAction = useAdminAction({ scope: "assistant-history-rename" });
  const deleteAction = useAdminAction({ scope: "assistant-history-delete" });
  const pathname = usePathname();
  const router = useRouter();
  const [editingId, setEditingId] = useState<Id<"threads"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [threadToDelete, setThreadToDelete] = useState<Id<"threads"> | null>(null);

  // Read once per render pass rather than per row, so every row in the pass
  // groups against the same instant, and ticked so a sidebar left open does
  // not go on filing yesterday's conversations under Today.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const grouped = groupThreadsByDay(threads, now);

  const handleRenameSubmit = async (threadId: Id<"threads">) => {
    if (!editTitle.trim()) return;
    await renameAction.run(
      async () => {
        await renameThread({ threadId, title: editTitle.trim() });
        setEditingId(null);
      },
      { fallbackMessage: t("renameFailed") },
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden w-full">
      
      {/* Header Array */}
      <div className="flex flex-col gap-4 mb-5 px-1 relative z-50">
        <div className="flex items-center justify-between relative z-[60]">
          <span className="text-[11px] font-medium text-secondary tracking-[0.2em] uppercase">History</span>
          <Link 
            href="/app/assistant"
            className="group relative w-7 h-7 flex items-center justify-center rounded-full bg-foreground text-background hover:scale-105 hover:shadow-brand/20 transition-all shadow-md active:scale-95"
          >
            <Plus className="w-4 h-4" />
            
            {/* Tooltip */}
            <div className="absolute top-full mt-2 right-0 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-[100] translate-y-2 group-hover:translate-y-0">
              <div className="bg-card dark:bg-[#1a1a1c] border border-border-dim text-[11px] font-medium text-foreground px-3 py-1.5 rounded-[8px] whitespace-nowrap shadow-xl">
                New Conversation
              </div>
            </div>
          </Link>
        </div>
        
        {/* Search asks the database over the whole history. Kept visible
            while a term is typed, or a no-match search would hide its own
            input. Underlined rather than boxed: one less rectangle in a rail
            that is already a plane. */}
        {(threads.length > 0 || searchQuery.trim().length > 0) && (
          <div className="relative group">
            <Search className="absolute left-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted transition-colors group-focus-within:text-brand" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-transparent border-0 border-b border-border-dim rounded-none pl-6 pr-1 pb-2 text-[13px] text-foreground focus:outline-none focus:border-brand/50 focus:ring-0 transition-colors placeholder:text-muted/60"
            />
          </div>
        )}
      </div>

      {/* Intelligence Pipeline Loop */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col gap-1.5 relative px-1 pb-4">
        {threadsStatus === "LoadingFirstPage" ? (
          <div className="flex items-center justify-center h-20 opacity-50">
            <Loader2 className="w-4 h-4 animate-spin text-secondary" />
          </div>
        ) : threads.length === 0 && searchQuery.trim() ? (
          <span className="text-[13px] text-muted font-light mt-4 block text-center leading-relaxed">
            No chats matched &quot;{searchQuery}&quot;
          </span>
        ) : threads.length === 0 ? (
          <span className="text-[13px] text-muted font-light mt-4 block text-center leading-relaxed px-4">
            No previous conversations. Start exploring {platformName}.
          </span>
        ) : (
          <AnimatePresence>
            {grouped.flatMap((group) => [
              <div
                key={`group-${group.bucket}`}
                className="flex items-center gap-2.5 pt-4 pb-1 first:pt-0"
              >
                <span className="text-[9px] font-medium tracking-[0.16em] uppercase text-muted">
                  {t(group.bucket)}
                </span>
                <span aria-hidden="true" className="flex-1 h-px bg-border-dim" />
              </div>,
              ...group.threads.map((thread, i) => {
              const isActive = pathname.includes(thread._id);
              const isEditingThisContext = editingId === thread._id;
              const displayTitle = thread.title || "New Conversation";
              const stamp = formatThreadStamp({
                updatedAt: thread.updatedAt ?? thread._creationTime,
                bucket: group.bucket,
              });

              return (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.5), duration: 0.3 }}
                  key={thread._id}
                  className="relative group"
                >
                  {isEditingThisContext ? (
                    // Editing Mutator Mode
                    <div className="flex items-center gap-2 py-1.5 pl-3 pr-1 border-l-2 border-brand bg-foreground/[0.03]">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRenameSubmit(thread._id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        className="flex-1 bg-transparent border-none text-[13px] text-foreground p-0 focus:ring-0 outline-none placeholder:text-muted focus:outline-none w-full"
                      />
                      {/* Raw on purpose: a 24px brand-filled square — no
                          Button variant wears the brand as a background. */}
                      <button
                        onClick={() => handleRenameSubmit(thread._id)}
                        disabled={renameAction.isBusy()}
                        className="w-6 h-6 rounded bg-brand flex items-center justify-center text-white active:scale-95 transition-all shadow-sm"
                      >
                        {renameAction.isBusy() ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-[14px] h-[14px]" />}
                      </button>
                    </div>
                  ) : (
                    // Standard Viewing Mode
                    <>
                      {/* A thin accent bar marks the live conversation
                          instead of a filled block — quieter, and it reads
                          at a glance down a column of similar titles. */}
                      <Link
                        href={`/app/assistant/${thread._id}`}
                        className={`flex items-baseline gap-3 w-full py-2 pl-3 pr-9 border-l-2 transition-colors text-left ${
                          isActive
                            ? "border-brand text-foreground"
                            : "border-transparent hover:border-border-dim"
                        }`}
                      >
                        <span className={`flex-1 min-w-0 truncate text-[13px] ${isActive ? "text-foreground font-medium" : "text-secondary font-light group-hover:text-foreground/80"}`}>
                          {displayTitle}
                        </span>
                        <span className="text-[10px] tabular-nums text-muted flex-shrink-0 group-hover:opacity-0 transition-opacity">
                          {stamp}
                        </span>
                      </Link>

                      {/* Floating Action Buttons — both raw on purpose:
                          hover-revealed glass chips with backdrop blur and
                          scale effects, nothing the kit freezes. */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-10">
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingId(thread._id);
                            setEditTitle(displayTitle);
                          }}
                          className="w-7 h-7 rounded-[8px] bg-background/95 backdrop-blur-xl flex items-center justify-center border border-border-dim hover:bg-foreground/5 text-muted hover:text-foreground shadow-sm hover:scale-105 active:scale-95 transition-all"
                          title="Rename conversation"
                        >
                          <PencilLine className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setThreadToDelete(thread._id);
                          }}
                          className="w-7 h-7 rounded-[8px] bg-background/95 backdrop-blur-xl flex items-center justify-center border border-border-dim hover:bg-red-500/10 text-muted hover:text-red-400 shadow-sm hover:scale-105 active:scale-95 transition-all"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              );
              }),
            ])}
          </AnimatePresence>
        )}

        {/* Older conversations, a page at a time */}
        {threadsStatus === "CanLoadMore" && (
          // Raw on purpose: an inline text link — no Button variant is a bare
          // text action.
          <button
            type="button"
            onClick={() => loadMore(THREAD_PAGE_SIZE)}
            className="mt-3 w-full py-2 text-[12px] text-muted hover:text-foreground transition-colors text-left pl-3"
          >
            {t("showOlder")}
          </button>
        )}
        {threadsStatus === "LoadingMore" && (
          <div className="flex items-center justify-center py-3 opacity-50">
            <Loader2 className="w-4 h-4 animate-spin text-secondary" />
          </div>
        )}
      </div>

      {/* Hakken Modal Overlay for Deletion - Escaped via Portal */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {threadToDelete && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-background/60 backdrop-blur-3xl p-4"
            >
              <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                className="relative overflow-hidden w-full max-w-[420px] bg-sidebar/40 border border-white/5 rounded-[32px] p-8 shadow-[0_20px_100px_rgba(0,0,0,0.8)] flex flex-col gap-6"
              >
                {/* Seamless Inner Ambient Glow */}
                <div className="absolute inset-0 w-full h-full bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.06),transparent_60%)] pointer-events-none"></div>
                
                <div className="flex flex-col gap-3 z-10 relative mt-2 text-center items-center">
                  <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-2">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-[22px] font-light tracking-[0.12em] text-foreground">Confirm Deletion</h3>
                  <p className="text-[14px] font-light text-muted leading-relaxed max-w-[300px]">
                    Are you entirely sure you want to permanently erase this conversation?
                  </p>
                </div>

                <div className="flex items-center justify-center gap-3 z-10 relative mt-4 w-full">
                  {/* Both raw on purpose: this dialog's own full-width
                      rounded-[16px] pair — the kit's `ghost`/`destructive`
                      recipes are different shapes and shades. */}
                  <button
                    onClick={() => setThreadToDelete(null)}
                    disabled={deleteAction.isBusy()}
                    className="flex-1 py-3.5 rounded-[16px] bg-white/5 hover:bg-white/10 text-[14px] font-medium text-foreground transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!threadToDelete) return;
                      const deletedId = threadToDelete;
                      await deleteAction.run(
                        async () => {
                          await deleteThread({ threadId: deletedId });
                          if (pathname.includes(deletedId)) {
                            router.push("/app/assistant");
                          }
                          setThreadToDelete(null);
                        },
                        { fallbackMessage: t("deleteFailed") },
                      );
                    }}
                    disabled={deleteAction.isBusy()}
                    className="flex-1 py-3.5 rounded-[16px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[14px] font-medium text-red-400 transition-all flex items-center justify-center gap-2"
                  >
                    {deleteAction.isBusy() ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Erase</span>}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
