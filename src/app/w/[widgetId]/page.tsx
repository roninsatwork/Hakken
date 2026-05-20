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
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Gateway State
  const [hasPassedGateway, setHasPassedGateway] = useState(false);
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");

  const messages = useQuery(
    api.chat.getMessages,
    threadId ? { threadId } : "skip"
  );

  const prevMessagesCount = useRef(0);

  // Audio Preload
  useEffect(() => {
    if (typeof window !== 'undefined') {
        audioRef.current = new Audio("/sounds/pop.mp3"); // Ensure this file exists, or it just silently fails
        audioRef.current.volume = 0.5;
    }
  }, []);

  // PostMessage for Embed Config
  useEffect(() => {
      if (widget) {
           let targetOrigin = "*";
           try {
               if (typeof document !== "undefined" && document.referrer) {
                   const referrerUrl = new URL(document.referrer);
                   const referrerOrigin = referrerUrl.origin;
                   
                   let isAllowed = false;
                   if (widget.allowedDomains && widget.allowedDomains.length > 0) {
                       for (const domain of widget.allowedDomains) {
                           if (referrerOrigin.includes(domain) || domain === "*") {
                               isAllowed = true;
                               break;
                           }
                       }
                   } else {
                       isAllowed = true;
                   }
                   
                   const platformHost = window.location.hostname;
                   if (referrerOrigin.includes(platformHost)) {
                       isAllowed = true;
                   }
                   
                   if (isAllowed) {
                       targetOrigin = referrerOrigin;
                   }
               }
           } catch (e) {
               console.error("Failed to parse referrer origin for postMessage", e);
           }

           window.parent.postMessage({ 
               type: 'SONAE_WIDGET_CONFIG', 
               showPopup: widget.showPopupPreview && widget.enableGreeting, 
               themeGreeting: widget.themeGreeting,
               primaryColor: widget.themePrimaryColor || "#000000"
           }, targetOrigin);
      }
  }, [widget]);

  // Sound Effect logic
  useEffect(() => {
      if (messages && messages.length > prevMessagesCount.current) {
          const latestMessage = messages[messages.length - 1];
          if (latestMessage.role !== "user" && widget?.enableSounds) {
              audioRef.current?.play().catch(e => console.log("Audio play blocked by browser", e));
          }
          prevMessagesCount.current = messages.length;
      }
  }, [messages, widget?.enableSounds]);

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
       const referrer = document.referrer;
       let isAllowed = false;

       if (widget.allowedDomains && widget.allowedDomains.length > 0) {
           for (const domain of widget.allowedDomains) {
               if (referrer.includes(domain) || domain === "*") isAllowed = true;
           }
       } else {
           isAllowed = true;
       }

       const platformHost = window.location.hostname;
       if (referrer.includes(platformHost)) {
           isAllowed = true;
       }

       if (!isAllowed && process.env.NODE_ENV !== "development") {
           setIsInitializing(false);
           return;
       }

       const existingThreadKey = `sonae_widget_${widgetId}_thread`;
       const storedThreadId = localStorage.getItem(existingThreadKey) as Id<"threads"> | null;
       
       if (storedThreadId) {
           setThreadId(storedThreadId);
           setHasPassedGateway(true);
           setIsInitializing(false);
       } else {
           // Decide if gateway is needed
           if (!widget.requireName && !widget.requireEmail) {
               setHasPassedGateway(true);
           }
           setIsInitializing(false);
       }
    }
  }, [widget, widgetId]);

  const handleSend = async (overrideContent?: string) => {
    const content = overrideContent || inputValue;
    if (!content.trim() || isSending || !widget) return;
    
    setIsSending(true);
    if (!overrideContent) setInputValue("");
    
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

        // Apply Gateway System Mask
        const isFirstMessage = !threadId;
        let finalContent = content;

        if (isFirstMessage && (visitorName || visitorEmail)) {
            finalContent = `[System Gateway: User ${visitorName || 'unknown'} <${visitorEmail || 'unknown'}>]\n\n${content}`;
        }

        // Send message
        await sendMessageQuery({
            threadId: activeThreadId,
            content: finalContent,
            dynamicAgentId: widget.agentId
        });

    } catch (e) {
        console.error("Message failed", e);
        if (!overrideContent) setInputValue(content);
    } finally {
        setIsSending(false);
    }
  };

  const handleReset = () => {
     localStorage.removeItem(`sonae_widget_${widgetId}_thread`);
     setThreadId(null);
     
     // Reset gateway state if rules dictate
     if (widget?.requireName || widget?.requireEmail) {
         setHasPassedGateway(false);
         setVisitorName("");
         setVisitorEmail("");
     }
  };

  // Loading State
  if (widget === undefined || isInitializing) return (
      <div className="w-full h-screen bg-transparent flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-brand" />
      </div>
  );

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
    <div className="w-full h-screen flex flex-col bg-card/80 backdrop-blur-3xl overflow-hidden font-sans border border-border-dim rounded-[24px] shadow-2xl relative">
        
       {/* Widget Header */}
       <header 
          className="flex items-center justify-between px-6 py-4 border-b border-border-dim/50 shrink-0"
          style={{ backgroundColor: `${primaryColor}10` }}
       >
           <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center shrink-0 border border-white/20 shadow-sm" style={{ backgroundColor: primaryColor }}>
                   {widget.themeLogoUrl ? (
                       <img src={widget.themeLogoUrl} alt="Logo" className="w-full h-full object-cover" />
                   ) : (
                       <Bot className="w-4 h-4 text-white" />
                   )}
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

       {/* Chat Area & Engine Canvas */}
       <div className="flex-1 overflow-y-auto custom-scrollbar p-6 flex flex-col gap-6 relative">
            
           {!hasPassedGateway ? (
               <div className="flex flex-col gap-4 my-auto p-4 max-w-[280px] w-full self-center">
                    <h3 className="font-semibold text-foreground text-[15px]">Before we begin...</h3>
                    <div className="flex flex-col gap-3">
                        {widget.requireName && <input type="text" value={visitorName} onChange={e => setVisitorName(e.target.value)} placeholder="Full Name" className="w-full bg-background border border-border-dim shadow-sm rounded-[10px] px-4 py-3 text-[14px] focus:outline-none focus:border-brand/50 transition-colors" />}
                        {widget.requireEmail && <input type="email" value={visitorEmail} onChange={e => setVisitorEmail(e.target.value)} placeholder="Email Address" className="w-full bg-background border border-border-dim shadow-sm rounded-[10px] px-4 py-3 text-[14px] focus:outline-none focus:border-brand/50 transition-colors" />}
                        <button 
                            disabled={
                                (widget.requireName && !visitorName.trim()) || 
                                (widget.requireEmail && !visitorEmail.trim() || (widget.requireEmail && !visitorEmail.includes('@')))
                            } 
                            onClick={() => setHasPassedGateway(true)} 
                            style={{ backgroundColor: primaryColor }} 
                            className="w-full py-3 rounded-[10px] text-white font-medium text-[14px] mt-2 shadow-md hover:opacity-90 disabled:opacity-50 transition-all"
                        >
                            Start Chat
                        </button>
                    </div>
                </div>
           ) : (
                <>
                   {/* Static Greeting Message */}
                   {widget.enableGreeting && widget.themeGreeting && (!messages || messages.length === 0) && (
                       <div className="flex flex-col gap-1 w-full self-start max-w-[90%]">
                           <div className="p-4 rounded-[16px] rounded-tl-sm text-[13px] leading-[1.6] bg-foreground/5 border border-border-dim/50 text-foreground/90 shadow-sm">
                               {widget.themeGreeting}
                           </div>
                       </div>
                   )}

                   {/* Real Output Messages */}
                   <AnimatePresence>
                       {messages && messages.map((message) => {
                           const isUser = message.role === "user";
                           
                           // Strip the hidden System Gateway prefix for UI rendering so they don't see it
                           const displayContent = isUser && message.content.startsWith("[System Gateway")
                                ? message.content.replace(/\[System Gateway:.*?\]\n\n/, "")
                                : message.content;

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
                                       {isUser ? displayContent : <SonaeMarkdown content={displayContent} />}
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

                   {/* Conversation Starters (Only show if no messages and no greeting rules conflict) */}
                   {(!messages || messages.length === 0) && !widget.enableGreeting && widget.conversationStarters && widget.conversationStarters.length > 0 && (
                        <div className="flex flex-col gap-2 mt-auto pb-2 self-end items-end w-full animate-in fade-in slide-in-from-bottom-5 duration-700">
                            {widget.conversationStarters.map((starter, i) => (
                                <button 
                                    key={i} 
                                    onClick={() => handleSend(starter)}
                                    className="px-4 py-2.5 rounded-full border border-border-dim bg-background shadow-sm text-[13px] text-foreground font-medium max-w-[90%] text-right hover:border-brand/50 hover:bg-foreground/5 transition-all outline-none"
                                    style={{ color: primaryColor }}
                                >
                                    {starter}
                                </button>
                            ))}
                        </div>
                   )}
                   <div ref={messagesEndRef} />
                </>
           )}
       </div>

       {/* Input Area */}
       <div className={`p-4 border-t border-border-dim/50 bg-background/50 shrink-0 transition-opacity ${!hasPassedGateway ? 'opacity-30 pointer-events-none' : ''}`}>
           <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-2 relative bg-foreground/5 border border-border-dim rounded-[24px] px-2 py-2 focus-within:border-brand/40 transition-colors shadow-inner"
           >
               <input
                   type="text"
                   value={inputValue}
                   onChange={(e) => setInputValue(e.target.value)}
                   disabled={isSending || !hasPassedGateway}
                   placeholder={widget.themePlaceholder || "Type your message..."}
                   className="flex-1 bg-transparent border-none outline-none text-[13px] text-foreground placeholder:text-muted/60 pl-4 py-1"
               />
               <button
                   type="submit"
                   disabled={!inputValue.trim() || isSending || !hasPassedGateway}
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
