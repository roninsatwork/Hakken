"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id, type Doc } from "@/convex/_generated/dataModel";
import { Bot, Send, Loader2, RefreshCcw, ImagePlus, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { STREAM_STALLED_MESSAGE } from "@/convex/streamingService";
import { useStreamPresentation } from "@/src/hooks/useStreamPresentation";
import { useSmoothStreamText } from "@/src/hooks/useSmoothStreamText";
import { widgetMessageDisplayText } from "@/src/lib/widgetSystemMessages";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import Image from "next/image";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import { PhotoActionChip } from "@/src/ui/components/chat/PhotoActionChip";

const HakkenMarkdown = dynamic(() =>
  import("@/src/ui/components/chat/HakkenMarkdown").then((module) => module.HakkenMarkdown)
);


/**
 * Assistant text plus its streaming state.
 *
 * A separate component because the presentation depends on a ticking clock, and
 * hooks cannot be called from inside the message map.
 */
function WidgetAssistantContent({
    content,
    message,
    accentColor,
}: {
    content: string;
    message: Doc<"messages">;
    accentColor: string;
}) {
    const presentation = useStreamPresentation(message);

    // Types out the throttled database lumps at a readable pace; the caret
    // follows the reveal so a reply still being typed still reads as live.
    const reveal = useSmoothStreamText({
        content,
        isStreaming: presentation === "streaming",
    });

    return (
        <>
            <HakkenMarkdown content={reveal.text} />
            {(presentation === "streaming" || reveal.isRevealing) && (
                <span
                    role="status"
                    aria-label="Still writing"
                    className="inline-block w-[2px] h-[1.1em] -mb-[0.15em] ml-[2px] animate-pulse"
                    style={{ backgroundColor: accentColor }}
                />
            )}
            {presentation === "stalled" && (
                <p className="mt-2 text-[12px] text-amber-500/90">{STREAM_STALLED_MESSAGE}</p>
            )}
        </>
    );
}

/**
 * The widget conversation, client side. The server page mints `embedPass` —
 * the signed proof that this session began with our server serving the page —
 * and thread creation presents it. A null pass means the deployment has no
 * signing secret configured; creation will be refused server-side.
 */
export function WidgetIframeClient({ embedPass }: { embedPass: string | null }) {
  const params = useParams();
  const widgetId = params.widgetId as Id<"widgets">;

  // Widget Data
  const widget = useQuery(api.widgets.getWidgetById, { widgetId });
  const createThread = useMutation(api.widgets.createWidgetThread);
  const sendMessageQuery = useMutation(api.chat.sendMessage);
  const generateWidgetUploadUrl = useMutation(api.widgets.generateWidgetUploadUrl);
  const finalizeWidgetUpload = useMutation(api.widgets.finalizeWidgetUpload);
  
  // Widget State
  const [threadId, setThreadId] = useState<Id<"threads"> | null>(null);
  const [widgetAccessToken, setWidgetAccessToken] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);
  // A photo staged for the next send: uploaded (and server-validated) the
  // moment it is picked, so pressing Send only has to reference it.
  const [pendingPhoto, setPendingPhoto] = useState<{ previewUrl: string; storageId: Id<"_storage"> } | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Gateway State
  const [hasPassedGateway, setHasPassedGateway] = useState(false);
  const [visitorName, setVisitorName] = useState("");
  const [visitorEmail, setVisitorEmail] = useState("");

  const messages = useQuery(
    api.chat.getMessages,
    threadId && widgetAccessToken ? { threadId, widgetAccessToken } : "skip"
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
           let targetOrigin: string | null = null;
           try {
               if (typeof document !== "undefined" && document.referrer) {
                   const referrerUrl = new URL(document.referrer);
                   const referrerOrigin = referrerUrl.origin;
                   const referrerHost = referrerUrl.hostname.toLowerCase();
                   
                   let isAllowed = false;
                   if (widget.allowedDomains && widget.allowedDomains.length > 0) {
                       isAllowed = widget.allowedDomains.some(domain => {
                           const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
                           return normalizedDomain === "*" || referrerHost === normalizedDomain || referrerHost.endsWith("." + normalizedDomain);
                       });
                   } else {
                       isAllowed = true;
                   }
                   
                   const platformHost = window.location.hostname;
                   if (referrerHost === platformHost.toLowerCase() || referrerHost.endsWith("." + platformHost.toLowerCase())) {
                       isAllowed = true;
                   }
                   
                   if (isAllowed) {
                       targetOrigin = referrerOrigin;
                   }
               } else {
                   // If document.referrer is empty, check if we configured allowing all domains
                   if (!widget.allowedDomains || widget.allowedDomains.length === 0 || widget.allowedDomains.includes("*")) {
                       targetOrigin = "*";
                   }
               }
           } catch (error) {
               console.error("Failed to parse referrer origin for postMessage", error);
           }

           if (targetOrigin) {
               window.parent.postMessage({ 
                   type: 'SONAE_WIDGET_CONFIG', 
                   showPopup: widget.showPopupPreview && widget.enableGreeting, 
                   themeGreeting: widget.themeGreeting,
                   primaryColor: widget.themePrimaryColor || "#000000"
               }, targetOrigin);
           }
      }
  }, [widget]);

  // Sound Effect logic
  useEffect(() => {
      if (messages && messages.length > prevMessagesCount.current) {
          const latestMessage = messages[messages.length - 1];
          // A streamed reply appears as soon as its first token lands. Chiming
          // then would announce an answer that has barely started, so wait for
          // it to finish before playing.
          if (latestMessage.isStreaming) return;
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
           try {
               const referrerUrl = new URL(referrer);
               const referrerHost = referrerUrl.hostname.toLowerCase();
               isAllowed = widget.allowedDomains.some(domain => {
                   const normalizedDomain = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
                   return normalizedDomain === "*" || referrerHost === normalizedDomain || referrerHost.endsWith("." + normalizedDomain);
               });
           } catch {
               isAllowed = false;
           }
       } else {
           isAllowed = true;
       }

       const platformHost = window.location.hostname;
       try {
           const referrerUrl = new URL(referrer);
           const referrerHost = referrerUrl.hostname.toLowerCase();
           if (referrerHost === platformHost.toLowerCase() || referrerHost.endsWith("." + platformHost.toLowerCase())) {
               isAllowed = true;
           }
       } catch {
           if (referrer.includes(platformHost)) {
               isAllowed = true;
           }
       }

       if (!isAllowed && process.env.NODE_ENV !== "development") {
           setIsInitializing(false);
           return;
       }

       const existingThreadKey = `sonae_widget_${widgetId}_thread`;
       const existingTokenKey = `sonae_widget_${widgetId}_token`;
       const storedThreadId = localStorage.getItem(existingThreadKey) as Id<"threads"> | null;
       const storedAccessToken = localStorage.getItem(existingTokenKey);
       
       if (storedThreadId && storedAccessToken) {
           setThreadId(storedThreadId);
           setWidgetAccessToken(storedAccessToken);
           setHasPassedGateway(true);
           setIsInitializing(false);
       } else {
           if (storedThreadId || storedAccessToken) {
               localStorage.removeItem(existingThreadKey);
               localStorage.removeItem(existingTokenKey);
           }
           // Decide if gateway is needed
           if (!widget.requireName && !widget.requireEmail) {
               setHasPassedGateway(true);
           }
           setIsInitializing(false);
       }
    }
  }, [widget, widgetId]);

  // The thread is created lazily on the first action that needs one — a photo
  // upload can arrive before any message, so both paths share this door.
  const ensureThread = async (): Promise<{ threadId: Id<"threads">; accessToken: string }> => {
    if (threadId && widgetAccessToken) return { threadId, accessToken: widgetAccessToken };
    if (!widget) throw new Error("Widget not loaded");
    const createdThread = await createThread({
        widgetId: widget._id,
        sourceUrl: document.referrer || window.location.href,
        embedPass: embedPass ?? "",
    });
    // Refusals come back as values, not exceptions, so the server's audit
    // trail of the refusal survives; the visitor just sees the send fail.
    if ("refused" in createdThread) {
        throw new Error(
            createdThread.refused === "busy"
                ? "The assistant is busy just now. Please try again shortly."
                : "This chat cannot be started here."
        );
    }
    setThreadId(createdThread.threadId);
    setWidgetAccessToken(createdThread.accessToken);
    localStorage.setItem(`sonae_widget_${widgetId}_thread`, createdThread.threadId);
    localStorage.setItem(`sonae_widget_${widgetId}_token`, createdThread.accessToken);
    return { threadId: createdThread.threadId, accessToken: createdThread.accessToken };
  };

  const handlePhotoSelected = async (file: File) => {
    if (!widget || isUploadingPhoto) return;
    setPhotoError(null);

    // Client-side check for the visitor's sake; the server re-validates for truth.
    const verdict = validateUploadFile(file, "widgetAttachmentImage");
    if (!verdict.allowed) {
        setPhotoError(verdict.reason);
        return;
    }

    setIsUploadingPhoto(true);
    try {
        const session = await ensureThread();
        const postUrl = await generateWidgetUploadUrl({
            sizeBytes: file.size,
            contentType: file.type,
            widgetId: widget._id,
            threadId: session.threadId,
            widgetAccessToken: session.accessToken,
        });
        const result = await fetch(postUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
        });
        if (!result.ok) throw new Error("Upload failed");
        const { storageId } = await result.json();
        await finalizeWidgetUpload({
            widgetId: widget._id,
            threadId: session.threadId,
            storageId,
            widgetAccessToken: session.accessToken,
        });
        if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
        setPendingPhoto({ previewUrl: URL.createObjectURL(file), storageId });
    } catch (e) {
        console.error("Photo upload failed", e);
        const reason = e instanceof Error && e.message.includes("quota")
            ? "This conversation has reached its photo limit."
            : "The photo could not be uploaded. Please try again.";
        setPhotoError(reason);
    } finally {
        setIsUploadingPhoto(false);
        if (photoInputRef.current) photoInputRef.current.value = "";
    }
  };

  const clearPendingPhoto = () => {
      if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
      setPendingPhoto(null);
  };

  const handleSend = async (overrideContent?: string) => {
    const content = overrideContent || inputValue;
    // A photo with no words is still a message — the photo is the question.
    if ((!content.trim() && !pendingPhoto) || isSending || !widget) return;

    setIsSending(true);
    if (!overrideContent) setInputValue("");
    const photoForThisSend = pendingPhoto;

    try {
        // Apply Gateway System Mask
        const isFirstMessage = !threadId;
        const session = await ensureThread();
        let finalContent = content;

        if (isFirstMessage && (visitorName || visitorEmail)) {
            finalContent = `[System Gateway: User ${visitorName || 'unknown'} <${visitorEmail || 'unknown'}>]\n\n${content}`;
        }

        // Send message
        await sendMessageQuery({
            threadId: session.threadId,
            content: finalContent,
            dynamicAgentId: widget.agentId,
            widgetAccessToken: session.accessToken,
            fileIds: photoForThisSend ? [photoForThisSend.storageId] : undefined,
        });
        if (photoForThisSend) clearPendingPhoto();

    } catch (e) {
        console.error("Message failed", e);
        if (!overrideContent) setInputValue(content);
    } finally {
        setIsSending(false);
    }
  };

  const handleReset = () => {
     localStorage.removeItem(`sonae_widget_${widgetId}_thread`);
     localStorage.removeItem(`sonae_widget_${widgetId}_token`);
     setThreadId(null);
     setWidgetAccessToken(null);
     clearPendingPhoto();
     setPhotoError(null);
     
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
                       <Image
                         src={widget.themeLogoUrl}
                         alt="Logo"
                         width={32}
                         height={32}
                         unoptimized
                         className="w-full h-full object-cover"
                       />
                   ) : (
                       <Bot className="w-4 h-4 text-white" />
                   )}
               </div>
               <div className="flex flex-col">
                   <h2 className="text-[14px] font-bold text-foreground">{widget.name || "Hakken Assistant"}</h2>
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
                           const rawContent = isUser && message.content.startsWith("[System Gateway")
                                ? message.content.replace(/\[System Gateway:.*?\]\n\n/, "")
                                : message.content;

                           // Platform-authored messages (systemKey) render in the
                           // visitor's own browser language; stored English is the fallback.
                           const displayContent = widgetMessageDisplayText(
                                { content: rawContent, systemKey: message.systemKey },
                                typeof navigator !== "undefined" ? navigator.language : undefined
                           );

                           // The list query attaches viewable URLs only to rows
                           // that carry image attachments, so the row type is a
                           // union; narrow it here for rendering.
                           const imageAttachments =
                                "imageAttachments" in message ? message.imageAttachments : undefined;

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
                                       {isUser ? displayContent : (
                                          <WidgetAssistantContent content={displayContent} message={message} accentColor={primaryColor} />
                                       )}
                                       {/* A photo's proposed follow-up, phrased for a visitor:
                                           the team gets the task, not them. */}
                                       {!isUser && message.photoActionProposal && widgetAccessToken && (
                                          <PhotoActionChip
                                              message={message}
                                              widgetAccessToken={widgetAccessToken}
                                              accentColor={primaryColor}
                                              labels={{
                                                  heading: "Suggested follow-up",
                                                  why: "Why",
                                                  confirm: "Ask the team to follow up",
                                                  filing: "Sending…",
                                                  filed: "The team has been asked to follow up.",
                                                  failed: "That didn't go through. Please try again.",
                                              }}
                                          />
                                       )}
                                       {imageAttachments && imageAttachments.length > 0 && (
                                          <div className="mt-2 flex flex-wrap gap-2">
                                              {imageAttachments.map((image, index) => (
                                                  // Tap opens the full photo; the bubble keeps a bounded
                                                  // thumbnail so one large photo cannot swallow the widget.
                                                  <a key={index} href={image.url} target="_blank" rel="noreferrer">
                                                      {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URLs are signed and external; next/image adds nothing here */}
                                                      <img
                                                          src={image.url}
                                                          alt="Attached photo"
                                                          loading="lazy"
                                                          decoding="async"
                                                          className="max-h-40 max-w-[12rem] rounded-[10px] border border-white/20 object-cover"
                                                      />
                                                  </a>
                                              ))}
                                          </div>
                                       )}
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
           {pendingPhoto && (
               <div className="mb-2 flex items-center gap-2">
                   <div className="relative inline-block">
                       {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                       <img
                           src={pendingPhoto.previewUrl}
                           alt="Photo ready to send"
                           className="h-14 w-14 rounded-[10px] border border-border-dim object-cover"
                       />
                       <button
                           type="button"
                           onClick={clearPendingPhoto}
                           aria-label="Remove photo"
                           className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-foreground text-background flex items-center justify-center shadow"
                       >
                           <X className="w-3 h-3" />
                       </button>
                   </div>
                   <span className="text-[11px] text-secondary">Photo attached — add words if you like, then send.</span>
               </div>
           )}
           {photoError && (
               <p className="mb-2 text-[11px] text-amber-500/90" role="alert">{photoError}</p>
           )}
           <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-center gap-2 relative bg-foreground/5 border border-border-dim rounded-[24px] px-2 py-2 focus-within:border-brand/40 transition-colors shadow-inner"
           >
               <input
                   ref={photoInputRef}
                   type="file"
                   accept="image/*"
                   className="hidden"
                   onChange={(e) => {
                       const file = e.target.files?.[0];
                       if (file) void handlePhotoSelected(file);
                   }}
               />
               <button
                   type="button"
                   onClick={() => photoInputRef.current?.click()}
                   disabled={isUploadingPhoto || isSending || !hasPassedGateway}
                   aria-label="Attach a photo"
                   title="Attach a photo"
                   className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-muted hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
               >
                   {isUploadingPhoto ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
               </button>
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
                   disabled={(!inputValue.trim() && !pendingPhoto) || isSending || isUploadingPhoto || !hasPassedGateway}
                   className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-opacity disabled:opacity-50"
                   style={{ backgroundColor: primaryColor }}
               >
                   <Send className="w-3.5 h-3.5 text-white" />
               </button>
           </form>
           <div className="w-full text-center mt-3">
               <span className="text-[10px] text-muted font-mono uppercase tracking-widest">Powered by Hakken</span>
           </div>
       </div>

    </div>
  );
}
