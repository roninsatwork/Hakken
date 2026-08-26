"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { 
  Bot, 
  Loader2, 
  ArrowUp, 
  AlertTriangle,
  ChevronDown,
  Check,
  RefreshCcw
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/src/ui/components/layout/Header";
import dynamic from "next/dynamic";

const ChatMessage = dynamic(() => import("@/src/ui/components/chat/ChatMessage"));

const HOLLYWOOD_PHASES = [
  "Initializing Secure Sandbox...",
  "Parsing Intent Parameters...",
  "Aligning Semantic Vectors...",
  "Establishing Telemetry Lock...",
  "Routing Tool Dispatch...",
  "Synthesizing Response..."
];

export default function AgenticTestingSandbox() {
  const t = useTranslations("agenticTesting");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<Id<"threads"> | null>(null);
  const [loadingPhase, setLoadingPhase] = useState(0);
  
  const [agentDropdownOpen, setAgentDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const agents = useQuery(api.agents.list);
  const [selectedAgentId, setSelectedAgentId] = useState<Id<"agents"> | "any" | null>(null);

  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const routeAgentIntent = useAction(api.orchestrator.routeAgentIntent);
  
  const messages = useQuery(api.chat.getMessages, activeThreadId ? { threadId: activeThreadId } : "skip");

  useEffect(() => {
    if (agents && agents.length > 0 && selectedAgentId === null) {
       setSelectedAgentId(agents[0]?._id);
    }
  }, [agents, selectedAgentId]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isSubmitting) {
      setLoadingPhase(0);
      interval = setInterval(() => {
        setLoadingPhase((prev) => (prev + 1) % HOLLYWOOD_PHASES.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [isSubmitting]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [content]);

  useEffect(() => {
    if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting || !selectedAgentId) return;

    setIsSubmitting(true);
    let targetThreadId = activeThreadId;

    try {
      const promptCopy = content.trim();

      // ** AUTO-ROUTING ORCHESTRATOR PATH ** 
      let finalAgentId: Id<"agents"> | undefined = selectedAgentId !== "any" ? selectedAgentId : undefined;

      if (selectedAgentId === "any") {
          // Pre-flight intent routing happens on EVERY message if "Any" is selected
          const routingResult = await routeAgentIntent({ prompt: promptCopy });
          if (routingResult && routingResult.matchedAgentId) {
             finalAgentId = routingResult.matchedAgentId as Id<"agents">;
          } else {
             finalAgentId = undefined; // Fallback to Global AI (no agentId assigned)
          }
      }

      if (!targetThreadId) {
          targetThreadId = await createThread({ agentId: finalAgentId });
          setActiveThreadId(targetThreadId);
      }

      setContent(""); // optimistic clear
      
      await sendMessage({ 
        threadId: targetThreadId, 
        content: promptCopy,
        dynamicAgentId: selectedAgentId === "any" ? (finalAgentId ?? null) : finalAgentId,
      });

    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
     setActiveThreadId(null);
     setContent("");
  };

  const selectedAgent = agents?.find(a => a._id === selectedAgentId);
  
  // Keep loading animation running until the AI explicitly responds
  const isWaitingForAI = messages && messages.length > 0 && messages[messages.length - 1].role === "user";
  const showLoader = Boolean(isSubmitting || isWaitingForAI);

  return (
    <div className="flex flex-col">
      <Header />
      
      <div className="flex flex-col flex-1 min-h-[calc(100vh-140px)]">
        
        {/* Background Centralized Aura */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[40vw] h-[40vw] bg-indigo-500/5 blur-[150px] rounded-full pointer-events-none z-0" />

        {/* Header Container */}
        <div className="relative w-full flex items-center justify-between z-50 bg-card border border-border-dim rounded-[20px] p-3 shadow-sm pr-4 shrink-0 mt-6 lg:mt-0">
         <div className="flex items-center gap-3 pl-2">
            <div className="w-10 h-10 rounded-[12px] bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20">
               <Bot className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex flex-col">
               <span className="text-[14px] font-bold tracking-wide text-foreground">{t("sandboxExec")}</span>
               <span className="text-[12px] font-mono text-muted uppercase tracking-widest">{t("isolatedRuntime")}</span>
            </div>
         </div>

         <div className="flex items-center gap-3 relative" ref={dropdownRef}>
            {activeThreadId && (
               <button 
                 onClick={handleReset}
                 className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 rounded-[8px] transition-colors text-muted"
                 title={t("resetSession")}
               >
                  <RefreshCcw className="w-4 h-4" />
               </button>
            )}

            <button 
              type="button"
              onClick={() => setAgentDropdownOpen(!agentDropdownOpen)}
              className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors border ${agentDropdownOpen ? 'bg-foreground/5 border-border-dim text-foreground' : 'hover:bg-foreground/5 bg-sidebar text-foreground border-border-dim'}`}
            >
              <span className="text-[13px] font-medium tracking-wide">
                 {selectedAgentId === "any" ? "Any (Auto-Route)" : selectedAgent ? selectedAgent.name : "Select an Agent"}
              </span>
              <ChevronDown className="w-4 h-4 text-muted" />
            </button>

            {/* Agent Dropdown */}
            {agentDropdownOpen && (
                <div 
                  className="absolute top-full right-0 mt-2 w-[280px] sm:w-[320px] bg-card dark:bg-[#1a1a1c] border border-border-dim rounded-[16px] shadow-2xl p-2 z-[9999] flex flex-col"
                >
                  <div className="px-4 py-3 pb-2 border-b border-border-dim mb-1">
                    <span className="text-[11px] font-medium text-muted tracking-widest uppercase">{t("selectIdentity")}</span>
                  </div>
                  {agents === undefined ? (
                     <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted" /></div>
                  ) : agents.length === 0 ? (
                     <div className="p-4 text-center text-[12px] text-muted">{t("noAgents")}</div>
                  ) : (
                    <>
                      <div
                        role="button"
                        onClick={() => {
                          setSelectedAgentId("any");
                          setAgentDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between w-full p-3.5 rounded-[12px] text-left transition-colors cursor-pointer mb-1 ${selectedAgentId === "any" ? 'bg-indigo-500/10' : 'hover:bg-foreground/5'}`}
                      >
                        <div className="flex flex-col gap-0.5 pointer-events-none">
                           <span className={`text-[14px] font-bold ${selectedAgentId === "any" ? 'text-indigo-400' : 'text-foreground/90'}`}>
                              Any (Auto-Route)
                           </span>
                           <span className="text-[12px] text-muted leading-tight pr-4">{t("autoRoute")}</span>
                        </div>
                        {selectedAgentId === "any" && (
                          <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      
                      <div className="border-t border-border-dim my-1.5" />
                      
                      {agents.map((agent) => (
                      <div
                        key={agent._id}
                        role="button"
                        onClick={() => {
                          setSelectedAgentId(agent._id);
                          setAgentDropdownOpen(false);
                        }}
                        className={`flex items-center justify-between w-full p-3.5 rounded-[12px] text-left transition-colors cursor-pointer ${selectedAgentId === agent._id ? 'bg-indigo-500/10' : 'hover:bg-foreground/5'}`}
                      >
                        <span className={`text-[14px] font-medium pointer-events-none ${selectedAgentId === agent._id ? 'text-indigo-400' : 'text-foreground/80'}`}>
                           {agent.name}
                        </span>
                        {selectedAgentId === agent._id && (
                          <div className="w-5 h-5 rounded-full bg-indigo-500 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                    </>
                  )}
                </div>
            )}
         </div>
      </div>

      {/* Chat History View */}
      <div className="w-full z-10 flex flex-col px-2 sm:px-0">
         {(activeThreadId && messages) || isSubmitting ? (
             <div className="flex flex-col pb-[2vh]">
               {(messages || []).map((m) => (
                  <ChatMessage key={m._id} message={m} />
               ))}
               
               {showLoader && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex gap-4 w-full justify-start mb-6 items-center"
                  >
                    <div className="w-8 h-8 rounded-[10px] bg-indigo-500/20 flex-shrink-0 flex items-center justify-center border border-indigo-500/30">
                       <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                    </div>
                    <AnimatePresence mode="wait">
                       <motion.div 
                          key={loadingPhase}
                          initial={{ opacity: 0, y: 2 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -2 }}
                          transition={{ duration: 0.15 }}
                          className="text-[13px] font-mono tracking-wide text-indigo-400/80"
                       >
                          {HOLLYWOOD_PHASES[loadingPhase]}
                       </motion.div>
                    </AnimatePresence>
                  </motion.div>
               )}
               <div ref={messagesEndRef} className="h-4" />
             </div>
         ) : (
             <div className="w-full flex flex-col items-center justify-center py-[10vh] animate-in fade-in zoom-in-95 duration-500">
                <div className="w-16 h-16 rounded-[24px] bg-sidebar border border-border-dim shadow-sm flex items-center justify-center mb-6 relative">
                   <div className="absolute inset-0 bg-indigo-500/10 rounded-[24px] animate-pulse pointer-events-none" />
                   <AlertTriangle className="w-8 h-8 text-indigo-400 opacity-80" />
                </div>
                <h3 className="text-xl font-bold tracking-tight text-foreground mb-2">{t("airGapped")}</h3>
                <p className="text-[14px] text-secondary max-w-[400px] text-center font-light leading-relaxed">
                   Select an agent from the top right and send a message. All AI loop telemetry will be recorded cleanly into the Agent Logs tab without affecting standard users.
                </p>
             </div>
         )}
      </div>

      {/* Input Composer */}
      <div className="w-full flex justify-center z-20 shrink-0 sticky bottom-0 bg-background/95 backdrop-blur-3xl pb-8 pt-6 mt-auto">
        <form 
          onSubmit={handleStart}
          className="w-full relative"
        >
          <div className="relative flex flex-col bg-card border border-border-dim rounded-[32px] p-4 pb-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] focus-within:bg-sidebar transition-colors duration-300">
            
            <div className="flex items-start gap-3 w-full pl-2">
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={!selectedAgentId || showLoader}
                placeholder={!selectedAgentId ? "Awaiting Agent Selection..." : "Dispatch a prompt to trigger agentic logic..."}
                className="w-full bg-transparent border-none outline-none focus:outline-none text-[15px] focus:ring-0 p-0 resize-none min-h-[24px] max-h-[350px] scrollbar-hide font-mono mt-0.5 placeholder:font-sans transition-colors disabled:opacity-50"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleStart(e as unknown as React.FormEvent);
                  }
                }}
              />
            </div>

            <div className="flex items-center justify-end w-full mt-3">
              <button
                type="submit"
                disabled={!content.trim() && !showLoader}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                  showLoader 
                    ? 'bg-transparent cursor-not-allowed opacity-50' 
                    : content.trim() 
                      ? 'bg-indigo-500 text-white shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:bg-indigo-400 hover:scale-105' 
                      : 'bg-white/5 text-muted cursor-not-allowed'
                }`}
              >
                {showLoader ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <ArrowUp className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      </div>
    </div>
  );
}
