"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MessageSquare, Plus, Loader2, Search, PencilLine, Check, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Id } from "@/convex/_generated/dataModel";

export default function ChatHistoryList() {
  const threads = useQuery(api.chat.getThreads);
  const renameThread = useMutation(api.chat.renameThread);
  const deleteThread = useMutation(api.chat.deleteThread);
  const pathname = usePathname();
  const router = useRouter();

  // Local UI State
  const [searchQuery, setSearchQuery] = useState("");
  const [editingId, setEditingId] = useState<Id<"threads"> | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [threadToDelete, setThreadToDelete] = useState<Id<"threads"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Derive filtered threads dynamically based on user search
  const filteredThreads = threads?.filter(thread => {
    const title = thread.title || "New Conversation";
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const handleRenameSubmit = async (threadId: Id<"threads">) => {
    if (!editTitle.trim() || isRenaming) return;
    setIsRenaming(true);
    try {
      await renameThread({ threadId, title: editTitle.trim() });
      setEditingId(null);
    } catch (error) {
      console.error("Warning: Failed to rename thread", error);
    } finally {
      setIsRenaming(false);
    }
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
        
        {/* Universal Search Filter Constraint */}
        {threads && threads.length > 0 && (
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted transition-colors group-focus-within:text-brand" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full bg-background/50 border border-border-dim rounded-[14px] pl-9 pr-4 py-2 text-[13px] text-foreground focus:outline-none focus:border-brand/40 focus:ring-0 transition-all placeholder:text-muted/60"
            />
          </div>
        )}
      </div>

      {/* Intelligence Pipeline Loop */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide flex flex-col gap-1.5 relative px-1 pb-4">
        {threads === undefined ? (
          <div className="flex items-center justify-center h-20 opacity-50">
            <Loader2 className="w-4 h-4 animate-spin text-secondary" />
          </div>
        ) : threads.length === 0 ? (
          <span className="text-[13px] text-muted font-light mt-4 block text-center leading-relaxed px-4">
            No previous conversations. Start exploring Sonae.
          </span>
        ) : filteredThreads?.length === 0 ? (
          <span className="text-[13px] text-muted font-light mt-4 block text-center leading-relaxed">
            No chats matched "{searchQuery}"
          </span>
        ) : (
          <AnimatePresence>
            {filteredThreads?.map((thread, i) => {
              const isActive = pathname.includes(thread._id);
              const isEditingThisContext = editingId === thread._id;
              const displayTitle = thread.title || "New Conversation";

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
                    <div className="flex items-center gap-2 p-2 px-3 rounded-[12px] bg-foreground/5 border border-brand/30 shadow-sm shadow-brand/10">
                      <MessageSquare className="w-4 h-4 text-brand/80 flex-shrink-0" />
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
                      <button 
                        onClick={() => handleRenameSubmit(thread._id)} 
                        disabled={isRenaming} 
                        className="w-6 h-6 rounded bg-brand flex items-center justify-center text-white active:scale-95 transition-all shadow-sm"
                      >
                        {isRenaming ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-[14px] h-[14px]" />}
                      </button>
                    </div>
                  ) : (
                    // Standard Viewing Mode
                    <>
                      <Link
                        href={`/app/assistant/${thread._id}`}
                        className={`flex items-center gap-3 w-full p-3 pr-10 rounded-[12px] border transition-all text-left ${
                          isActive 
                            ? "bg-foreground/5 border-border-dim shadow-sm" 
                            : "bg-transparent border-transparent hover:bg-foreground/[0.03]"
                        }`}
                      >
                        <MessageSquare className={`w-4 h-4 flex-shrink-0 transition-colors ${isActive ? "text-foreground" : "text-muted group-hover:text-secondary"}`} />
                        <span className={`text-[13px] truncate ${isActive ? "text-foreground font-medium" : "text-secondary font-light group-hover:text-foreground/80"}`}>
                          {displayTitle}
                        </span>
                      </Link>

                      {/* Floating Action Buttons */}
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
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Sonae Modal Overlay for Deletion - Escaped via Portal */}
      {mounted && typeof document !== "undefined" && createPortal(
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
                  <button 
                    onClick={() => setThreadToDelete(null)}
                    disabled={isDeleting}
                    className="flex-1 py-3.5 rounded-[16px] bg-white/5 hover:bg-white/10 text-[14px] font-medium text-foreground transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={async () => {
                      if (!threadToDelete) return;
                      setIsDeleting(true);
                      const deletedId = threadToDelete;
                      try {
                        await deleteThread({ threadId: deletedId });
                        if (pathname.includes(deletedId)) {
                          router.push("/app/assistant");
                        }
                        setThreadToDelete(null);
                      } catch (error) {
                        console.error("Failed to delete thread", error);
                      } finally {
                        setIsDeleting(false);
                      }
                    }}
                    disabled={isDeleting}
                    className="flex-1 py-3.5 rounded-[16px] bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-[14px] font-medium text-red-400 transition-all flex items-center justify-center gap-2"
                  >
                    {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>Erase</span>}
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
