"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useEffect, useRef } from "react";
import ChatMessage from "@/src/ui/components/chat/ChatMessage";
import ChatInput from "@/src/ui/components/chat/ChatInput";
import { Loader2, Sparkles } from "lucide-react";
import { use } from "react";

export default function ActiveThreadPage({ params }: { params: Promise<{ threadId: string }> }) {
  const resolvedParams = use(params);
  const threadId = resolvedParams.threadId as Id<"threads">;
  
  const messages = useQuery(api.chat.getMessages, { threadId });
  const scrollRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
                
                {/* Live Model Thinking Indicator */}
                {messages.length > 0 && messages[messages.length - 1].role === "user" && (
                  <div className="flex gap-4 w-full justify-start mb-6">
                    <div className="w-8 h-8 rounded-[10px] bg-brand flex-shrink-0 flex items-center justify-center shadow-lg shadow-brand/20 mt-1 animate-pulse">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-sidebar/50 border border-border-dim backdrop-blur-3xl rounded-[20px] rounded-tl-[4px] px-5 py-4 w-fit flex items-center gap-2 shadow-md">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted/60 animate-[bounce_1s_infinite_0ms]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-muted/60 animate-[bounce_1s_infinite_200ms]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-muted/60 animate-[bounce_1s_infinite_400ms]"></span>
                    </div>
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
            <ChatInput threadId={threadId} />
        </div>
      </div>
    </div>
  );
}
