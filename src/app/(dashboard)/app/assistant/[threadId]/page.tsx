"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useEffect, useRef } from "react";
import ChatMessage from "@/src/ui/components/chat/ChatMessage";
import ChatInput from "@/src/ui/components/chat/ChatInput";
import SwarmStatusCard from "@/src/ui/components/chat/SwarmStatusCard";
import { AssistantStagePill } from "@/src/ui/components/chat/AssistantStagePill";
import { VoiceSessionOverlay } from "@/src/ui/components/chat/VoiceSessionOverlay";
import { Loader2, Sparkles, RefreshCw } from "lucide-react";
import { use, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function ActiveThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const resolvedParams = use(params);
  const threadId = resolvedParams.threadId as Id<"threads">;
  
  const messages = useQuery(api.chat.getMessages, { threadId });
  const threadDocs = useQuery(api.knowledge.getThreadDocuments, { threadId });
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Follow the conversation while the reader is at the bottom; stop the
  // moment they scroll up to re-read, and resume when they come back down.
  // A typed-out reply grows the page continuously, so following per database
  // write is not enough — the reader was left to drag the page themselves.
  const stickToBottom = useRef(true);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  const pendingDocs = threadDocs?.filter(d => d.status === "processing" || d.status === "pending");
  const isVectorizing = pendingDocs && pendingDocs.length > 0;

  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);

  // Voice mode: opened from the composer's Voice button, or on arrival with
  // ?voice=1 when the welcome screen started a spoken conversation. The
  // param is stripped once read so a reload does not reopen the session.
  const router = useRouter();
  const searchParams = useSearchParams();
  const [voiceOpen, setVoiceOpen] = useState(false);
  useEffect(() => {
    if (searchParams.get("voice") === "1") {
      setVoiceOpen(true);
      router.replace(`/app/assistant/${threadId}`);
    }
  }, [router, searchParams, threadId]);

  // Any growth of the transcript — a new message, a streamed lump, or each
  // frame of the typed reveal — keeps the bottom in view while the reader is
  // there. Watching size beats watching the query: the reveal grows the page
  // long after the last database write.
  useEffect(() => {
    const container = scrollRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) {
        container.scrollTop = container.scrollHeight;
      }
    });
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="absolute inset-0 flex flex-col bg-card/10 overflow-hidden">
      
      {/* Main Messaging Area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 min-h-0 overflow-y-auto w-full scrollbar-hide relative"
      >
        <div className="w-full flex justify-center px-6 sm:px-8 pt-8">
          <div ref={contentRef} className="w-full max-w-[660px] flex flex-col">
            {!messages ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-muted animate-spin" />
              </div>
            ) : messages.length === 0 ? (
               <div className="flex-1 flex items-center justify-center text-muted font-light tracking-[0.2em] uppercase text-[10px]">Awaiting Instructions...</div>
            ) : (
              <div className="flex flex-col flex-1">
                {messages.map((msg) => (
                  <ChatMessage key={msg._id} message={msg} />
                ))}
                
                {/* Swarm Live Execution Visualizer */}
                <SwarmStatusCard threadId={threadId} />
                
                {/* Your message, echoed in the same form it will settle
                    into, so nothing jumps when the real row arrives. */}
                {optimisticMessage && (
                  <div className="flex flex-col gap-1 mb-6 opacity-60">
                    <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted">You asked</span>
                    <p className="text-[15px] leading-snug tracking-[-0.01em] text-foreground whitespace-pre-wrap">
                      {optimisticMessage}
                    </p>
                    {uploadStatus && (
                      <span className="mt-1 text-[12px] text-brand">{uploadStatus}</span>
                    )}
                  </div>
                )}

                {/* The run's own opening turn: same seal, label and margin
                    the answer will use, so the reply grows out of it rather
                    than replacing a differently shaped object. */}
                {messages.length > 0 && messages[messages.length - 1].role === "user" && (
                  isVectorizing ? (
                    <div className="flex flex-col gap-2.5 border-l border-border-dim pl-4 sm:pl-5 mb-9">
                      <div className="flex items-center gap-2">
                        <span className="w-[15px] h-[15px] rounded-[4px] bg-brand flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-2.5 h-2.5 text-white" />
                        </span>
                        <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted">
                          Reading your files
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[14px] text-secondary" role="status">
                        <RefreshCw className="w-3.5 h-3.5 text-brand animate-spin flex-shrink-0" />
                        <span>
                          {pendingDocs.length === 1
                            ? "Reading 1 file before answering"
                            : `Reading ${pendingDocs.length} files before answering`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <AssistantStagePill threadId={threadId} />
                  )
                )}

                {/* Dynamic Spacer to clear fixed input box */}
                <div className="h-[180px] w-full flex-shrink-0 pointer-events-none" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Viewport Bottom Composer Input */}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-background via-background/95 to-transparent pt-24 pb-0 z-40 px-6 sm:px-8 pointer-events-none flex justify-center">
        <div className="pointer-events-auto w-full max-w-[660px]">
            <ChatInput
              threadId={threadId}
              onUploadStateChange={setUploadStatus}
              onOptimisticMessage={setOptimisticMessage}
              onOpenVoice={() => setVoiceOpen(true)}
            />
        </div>
      </div>

      {voiceOpen && (
        <VoiceSessionOverlay threadId={threadId} onClose={() => setVoiceOpen(false)} />
      )}
    </div>
  );
}
