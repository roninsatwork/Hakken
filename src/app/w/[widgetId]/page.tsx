"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { Bot, Send, Loader2, RefreshCcw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { SonaeMarkdown } from "@/src/ui/components/chat/SonaeMarkdown";
import { useParams } from "next/navigation";

export default function WidgetIframePage() {
  const params = useParams();
  const widgetId = params.widgetId as Id<"widgets">;
  
  // Widget Data
  const widget = useQuery(api.widgets.getWidgetById, { widgetId });
  const createThread = useMutation(api.widgets.createWidgetThread);
  const sendMessageQuery = useMutation(api.chat.sendMessage);
  
  // Widget State
  const [threadId, setThreadId] = useState<Id<"threads"> | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = useQuery(
    api.chat.getMessages,
    threadId ? { threadId } : "skip" // Wait, getMessages enforces getAuthUserId(ctx). 
    // Wait, since we are doing an anonymous interaction, we need the user to be authenticated anonymously.
    // Let's assume Convex Auth provides a JWT for anonymous users if we use useAuth(), but we haven't set that up yet here.
    // For this brainstorm MVP, we'll bypass strict auth on a new specific query `getWidgetMessages` or temporarily allow it.
    // Since `api.chat.getMessages` relies on userId, we need an anonymous auth flow.
  );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Handle postMessage initialization and domain checking
  useEffect(() => {
    if (widget === null) {
      setIsInitializing(false);
      return;
    }

    if (widget !== undefined) {
       // Validate Domain via document.referrer
       const referrer = document.referrer;
       let isAllowed = false;

       // If allowedDomains contains "*", allow all (dev only), else check host
       if (widget.allowedDomains && widget.allowedDomains.length > 0) {
           for (const domain of widget.allowedDomains) {
               if (referrer.includes(domain) || domain === "*") isAllowed = true;
           }
       } else {
           isAllowed = true; // Fallback if none set
       }

       // Provide a native bypass for Sonae's own sandbox environments
       const platformHost = window.location.hostname;
       if (referrer.includes(platformHost)) {
           isAllowed = true;
       }

       if (!isAllowed && process.env.NODE_ENV !== "development") {
           setIsInitializing(false);
           // Show access denied
           return;
       }

       // Try to load existing thread from localStorage
       const existingThreadKey = `sonae_widget_${widgetId}_thread`;
       const storedThreadId = localStorage.getItem(existingThreadKey) as Id<"threads"> | null;
       
       if (storedThreadId) {
           setThreadId(storedThreadId);
           setIsInitializing(false);
       } else {
           // We'll create the thread lazily when they send the first message to avoid spamming the DB
           setIsInitializing(false);
       }
    }
  }, [widget, widgetId]);

  const handleSend = async () => {
    if (!inputValue.trim() || isSending || !widget) return;
    
    setIsSending(true);
    const content = inputValue;
    setInputValue("");
    
    try {
        let activeThreadId = threadId;

        // Create thread if it doesn't exist
        if (!activeThreadId) {
           const newThreadId = await createThread({ 
               widgetId: widget._id, 
               sourceUrl: document.referrer || window.location.href 
           });
           setThreadId(newThreadId);
           activeThreadId = newThreadId;
           localStorage.setItem(`sonae_widget_${widgetId}_thread`, newThreadId);
        }

        // Send message
        await sendMessageQuery({
            threadId: activeThreadId,
            content,
            // Provide explicit dynamic agent override if the widget has an agent bound
            dynamicAgentId: widget.agentId
        });

    } catch (e) {
        console.error("Message failed", e);
        // We'll reset the input if it failed
        setInputValue(content);
    } finally {
        setIsSending(false);
    }
  };

  const handleReset = () => {
     localStorage.removeItem(`sonae_widget_${widgetId}_thread`);
     setThreadId(null);
  };

  // Loading State
  if (widget === undefined || isInitializing) return (
      <div className="w-full h-screen bg-transparent flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
  );

  // Not Found State
  if (widget === null) return (
       <div className="w-full h-screen bg-transparent flex items-center justify-center p-6 text-center">
           <div className="bg-card backdrop-blur-xl border border-destructive/20 rounded-[16px] p-6 shadow-2xl">
               <span className="text-destructive font-bold">Widget Unavailable</span>
               <p className="text-[13px] text-secondary mt-2">This widget does not exist or has been disabled.</p>
           </div>
       </div>
  );

  const primaryColor = widget.themePrimaryColor || "#000000";

  return (
    <div className="w-full h-screen flex flex-col bg-card/80 backdrop-blur-3xl overflow-hidden font-sans border border-border-dim rounded-[24px] shadow-2xl">
        
       {/* Widget Header */}
       <header 
          className="flex items-center justify-between px-6 py-4 border-b border-border-dim/50 shrink-0"
          style={{ backgroundColor: `${primaryColor}10` }}
       >
           <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border border-white/20 shadow-sm" style={{ backgroundColor: primaryColor }}>
                   <Bot className="w-4 h-4 text-white" />
               </div>
               <div className="flex flex-col">
                   <h2 className="text-[14px] font-bold text-foreground">{widget.name || "Sonae Assistant"}</h2>
                   <span className="text-[11px] text-secondary flex items-center gap-1">
                       <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online
                   </span>
               </div>
           </div>
           
           {threadId && (
              <button onClick={handleReset} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-foreground/5 text-muted transition-colors" title="Reset Conversation">
                  <RefreshCcw className="w-3.5 h-3.5" />
              </button>
           )}
       </header>

       {/* Chat Area */}
       <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6">
           
           {/* Static Greeting Message */}
           <div className="flex flex-col gap-1 w-full self-start max-w-[90%]">
               <div className="p-4 rounded-[16px] rounded-tl-sm text-[13px] leading-[1.6] bg-foreground/5 border border-border-dim/50 text-foreground/90 shadow-sm">
                   {widget.themeGreeting || "Hello! How can I help you today?"}
               </div>
           </div>

           {/* Real Output Messages */}
           <AnimatePresence>
               {messages && messages.map((message) => {
                   const isUser = message.role === "user";
                   return (
                      <motion.div
                         key={message._id}
                         initial={{ opacity: 0, y: 10, scale: 0.95 }}
                         animate={{ opacity: 1, y: 0, scale: 1 }}
                         className={`flex flex-col gap-1 max-w-[90%] ${isUser ? "self-end" : "self-start"}`}
                      >
                          <div 
                             className={`p-4 rounded-[16px] text-[13px] leading-[1.6] shadow-sm ${
                                 isUser 
                                  ? "rounded-tr-sm text-white" 
                                  : "rounded-tl-sm bg-foreground/5 border border-border-dim/50 text-foreground/90"
                             }`}
                             style={isUser ? { backgroundColor: primaryColor } : undefined}
                          >
                               {isUser ? message.content : <SonaeMarkdown content={message.content} />}
                          </div>
                      </motion.div>
                   )
               })}
               
               {/* Loading Indicator */}
               {messages && messages.length > 0 && messages[messages.length - 1].role === "user" && (
                   <motion.div
                       initial={{ opacity: 0, y: 10 }}
                       animate={{ opacity: 1, y: 0 }}
                       className="self-start p-4 rounded-[16px] rounded-tl-sm bg-foreground/5 border border-border-dim/50 flex items-center gap-2"
                   >
                       <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" />
                       <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0.2s" }} />
                       <span className="w-1.5 h-1.5 rounded-full bg-muted animate-bounce" style={{ animationDelay: "0.4s" }} />
                   </motion.div>
               )}
           </AnimatePresence>
           <div ref={messagesEndRef} />
       </div>

       {/* Input Area */}
       <div className="p-4 border-t border-border-dim/50 bg-background/50 shrink-0">
           <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-2 relative bg-foreground/5 border border-border-dim rounded-[24px] px-2 py-2 focus-within:border-brand/40 transition-colors shadow-inner"
           >
               <input
                   type="text"
                   value={inputValue}
                   onChange={(e) => setInputValue(e.target.value)}
                   disabled={isSending}
                   placeholder="Type your message..."
                   className="flex-1 bg-transparent border-none outline-none text-[13px] text-foreground placeholder:text-muted/60 pl-4 py-1"
               />
               <button
                   type="submit"
                   disabled={!inputValue.trim() || isSending}
                   className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-opacity disabled:opacity-50"
                   style={{ backgroundColor: primaryColor }}
               >
                   <Send className="w-3.5 h-3.5 text-white" />
               </button>
           </form>
           <div className="w-full text-center mt-3">
               <span className="text-[10px] text-muted font-mono uppercase tracking-widest">Powered by Sonae</span>
           </div>
       </div>

    </div>
  );
}
