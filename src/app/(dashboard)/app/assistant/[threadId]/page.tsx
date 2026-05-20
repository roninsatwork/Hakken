"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useEffect, useRef } from "react";
import ChatMessage from "@/src/ui/components/chat/ChatMessage";
import ChatInput from "@/src/ui/components/chat/ChatInput";
import SwarmStatusCard from "@/src/ui/components/chat/SwarmStatusCard";
import { Loader2, Sparkles, User, RefreshCw, Check } from "lucide-react";
import { use, useState } from "react";
import { useProgressiveLoading } from "@/src/hooks/useProgressiveLoading";

export default function ActiveThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const resolvedParams = use(params);
  const threadId = resolvedParams.threadId as Id<"threads">;
  
  const messages = useQuery(api.chat.getMessages, { threadId });
  const threadDocs = useQuery(api.knowledge.getThreadDocuments, { threadId });
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const pendingDocs = threadDocs?.filter(d => d.status === "processing" || d.status === "pending");
  const isVectorizing = pendingDocs && pendingDocs.length > 0;

  const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;
  const isThinking = lastMessage?.role === "user";
  const progressiveText = useProgressiveLoading(!!isThinking && !isVectorizing);

  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);

  // Auto-scroll seamlessly using native browser viewport
  useEffect(() => {
    setTimeout(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
      }
    }, 100);
  }, [messages]);

  return (
    <div className="absolute inset-0 flex flex-col bg-card/10 overflow-hidden">
      
      {/* Main Messaging Area */}
      <div 
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto w-full scrollbar-hide relative"
      >
        <div className="w-full flex justify-center px-4 sm:px-8 pt-6">
          <div className="w-full flex flex-col">
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
                
                {/* Optimistic Message & Loader */}
                {optimisticMessage && (
                  <div className="flex w-full justify-end mb-6">
                    <div className="flex flex-col items-end gap-2 max-w-[85%] sm:max-w-[70%]">
                      <div className="flex items-center gap-3 w-full justify-end">
                        <div className="bg-muted-foreground/10 text-foreground px-6 py-4 rounded-[24px] rounded-br-[6px] shadow-sm backdrop-blur-md opacity-70">
                          <p className="text-[15px] font-light leading-relaxed whitespace-pre-wrap">{optimisticMessage}</p>
                        </div>
                        <div className="w-10 h-10 rounded-[12px] bg-card border border-border-dim flex flex-shrink-0 items-center justify-center opacity-70">
                          <User className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </div>
                      
                      {uploadStatus && (
                        <div className="px-4 py-2 rounded-full bg-brand/10 border border-brand/20 flex items-center gap-2 mt-2 self-end">
                          <RefreshCw className="w-3.5 h-3.5 text-brand animate-spin" />
                          <span className="text-[12px] font-semibold tracking-wide text-brand uppercase">{uploadStatus}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Live Model Thinking Indicator */}
                {messages.length > 0 && messages[messages.length - 1].role === "user" && (
                  <div className="flex gap-4 w-full justify-start mb-6">
                    <div className="w-8 h-8 rounded-[10px] bg-brand flex-shrink-0 flex items-center justify-center shadow-lg shadow-brand/20 mt-1 animate-pulse">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    {isVectorizing ? (
                       <div className="flex flex-col gap-3 p-5 bg-card/60 backdrop-blur-2xl border border-border-dim rounded-[24px] rounded-tl-[8px] shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
                           <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center border border-green-500/20">
                                <Check className="w-3.5 h-3.5 text-green-500" />
                              </div>
                              <span className="text-[13px] font-medium text-muted">Payload safely uploaded to isolated Thread scope</span>
                           </div>
                           <div className="flex items-center gap-3">
                              <div className="w-6 h-6 rounded-full bg-brand/10 flex items-center justify-center border border-brand/20">
                                <RefreshCw className="w-3.5 h-3.5 text-brand animate-spin" />
                              </div>
                              <span className="text-[13px] font-semibold tracking-wide text-foreground animate-pulse">Vectorizing intelligence chunks ({pendingDocs.length} remaining)...</span>
                           </div>
                           <div className="flex items-center gap-3 opacity-40">
                              <div className="w-6 h-6 rounded-full bg-muted/10 flex items-center justify-center border border-border-dim">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted" />
                              </div>
                              <span className="text-[13px] font-medium text-muted">Establishing core Agent connection</span>
                           </div>
                       </div>
                    ) : (
                        <div className="bg-sidebar/50 border border-border-dim backdrop-blur-3xl rounded-[24px] rounded-tl-[6px] px-6 py-4 max-w-[85%] sm:max-w-[70%] flex items-center gap-3 shadow-md">
                          <Loader2 className="w-4 h-4 text-brand animate-spin flex-shrink-0" />
                          <span className="text-[14px] text-foreground/90 font-light tracking-wide">{progressiveText || "Thinking..."}</span>
                        </div>
                     )}
                  </div>
                )}
                
                {/* Dynamic Spacer to clear fixed input box */}
                <div className="h-[180px] w-full flex-shrink-0 pointer-events-none" />
                
                {/* Scroll Target placed explicitly at the real bottom */}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Viewport Bottom Composer Input */}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-background via-background/90 to-transparent pt-32 pb-0 z-40 px-4 sm:px-8 pointer-events-none flex justify-center">
        <div className="pointer-events-auto w-full">
            <ChatInput 
              threadId={threadId} 
              onUploadStateChange={setUploadStatus}
              onOptimisticMessage={setOptimisticMessage}
            />
        </div>
      </div>
    </div>
  );
}
