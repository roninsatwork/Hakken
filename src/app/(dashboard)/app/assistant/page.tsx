"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { 
  Sparkles, 
  Loader2, 
  ShieldCheck, 
  Plus, 
  Settings2, 
  ChevronDown, 
  Check, 
  ArrowUp,
  Square,
  Mic,
  MicOff,
  AlertTriangle
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";

const MODELS = [
  { id: "fast", name: "Fast", description: "Answers quickly" },
  { id: "thinking", name: "Thinking", description: "Solves complex problems" },
  { id: "pro", name: "Pro", description: "Advanced logic and frameworks" },
];

export default function AssistantWelcomePage() {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [greeting, setGreeting] = useState("Welcome");
  
  const { isRecording, isTranscribing, toggleRecording, permissionError, setPermissionError } = useVoiceToText({
     onTranscribe: (text) => setContent(prev => prev + (prev && prev.length > 0 ? " " : "") + text)
  });

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0]); // Default to Fast
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const user = useQuery(api.users.getMe);
  const router = useRouter();

  // Auto-resize and Dropdown Handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [content]);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 17) setGreeting("Good afternoon");
    else if (hour < 21) setGreeting("Good evening");
    else setGreeting("Good night");
  }, []);

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    if (isRecording) toggleRecording(); // Clean detach stream early

    setIsSubmitting(true);
    try {
      const threadId = await createThread();
      await sendMessage({ 
        threadId, 
        content: content.trim(),
        modelId: selectedModel.id
      });
      router.push(`/app/assistant/${threadId}`);
    } catch (error) {
      console.error(error);
      setIsSubmitting(false); // Reset boundary on rejection
    }
  };

  const firstName = user?.name ? user.name.split(" ")[0] : "";

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden bg-card/10 w-full h-full">
      
      {/* Background Centralized Aura */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] bg-brand/5 blur-[150px] rounded-full pointer-events-none z-0" />

      {/* Hero Welcome Protocol */}
      <div className="flex flex-col items-center gap-6 z-10 w-full max-w-2xl text-center mb-[8vh] mt-[-10vh]">
        <div className="w-14 h-14 rounded-[18px] bg-brand/10 border border-brand/20 flex items-center justify-center shadow-2xl shadow-brand/20 backdrop-blur-3xl animate-pulse">
          <Sparkles className="w-6 h-6 text-brand" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground drop-shadow-md">
          {greeting}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="max-w-[500px] text-[15px] sm:text-[18px] text-muted font-light leading-relaxed">
          What would you like to discuss today?
        </p>
      </div>

      {/* Universal Injection Input */}
      <div className="w-full flex justify-center z-10 absolute bottom-[10vh]">
        <div className="w-full flex items-center justify-center flex-col px-4 sm:px-8">
          <form 
            onSubmit={handleStart}
            className="w-full relative"
          >
            <div className="relative flex flex-col bg-card dark:bg-[#1e1e20] border border-border-dim dark:border-white/5 rounded-[32px] p-4 pb-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] focus-within:bg-card/70 dark:focus-within:bg-[#252528] transition-colors duration-300">
              
              {/* Top Row: Icon + Input */}
              <div className="flex items-start gap-3 w-full pl-1">
                <ShieldCheck className={`w-[18px] h-[18px] mt-[3px] flex-shrink-0 transition-colors ${isRecording ? "text-brand" : "text-muted/60"}`} />
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={isRecording ? "Recording securely..." : isTranscribing ? "Transcribing perfectly..." : "Enter a prompt for Sonae"}
                  className={`w-full bg-transparent border-none outline-none focus:outline-none text-[16px] focus:ring-0 p-0 resize-none min-h-[24px] max-h-[350px] scrollbar-hide font-light leading-relaxed transition-colors ${
                    isRecording ? "text-brand placeholder:text-brand/50" : "text-foreground placeholder:text-muted/70"
                  }`}
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleStart(e as unknown as React.FormEvent);
                    }
                  }}
                />
              </div>

              {/* Bottom Row: Controls */}
              <div className="flex items-center justify-between w-full mt-3">
                
                {/* Left Controls */}
                <div className="flex items-center gap-1">
                  <button type="button" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-foreground/5 dark:hover:bg-white/10 text-muted transition-colors">
                    <Plus className="w-5 h-5" />
                  </button>
                  <button type="button" className="h-10 px-4 flex items-center gap-2 rounded-full hover:bg-foreground/5 dark:hover:bg-white/10 text-muted transition-colors">
                    <Settings2 className="w-[18px] h-[18px]" />
                    <span className="text-[14px] font-medium tracking-wide">Tools</span>
                  </button>
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2 relative">

                  {/* Voice Dictation (Mic) */}
                  <button 
                    type="button" 
                    onClick={toggleRecording}
                    disabled={isTranscribing}
                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-all sm:mr-1 ${
                      isRecording 
                        ? "bg-brand/10 text-brand animate-pulse scale-105" 
                        : isTranscribing
                        ? "text-brand"
                        : "hover:bg-foreground/5 dark:hover:bg-white/10 text-muted hover:text-foreground"
                    }`}
                    title={isRecording ? "Stop recording" : "Start voice dictation"}
                  >
                    {isRecording ? <MicOff className="w-[18px] h-[18px]" /> : 
                     isTranscribing ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : 
                     <Mic className="w-[18px] h-[18px]" />}
                  </button>

                  {/* Model Selector Wrapper */}
                  <div className="relative" ref={dropdownRef}>
                    <button 
                      type="button"
                      onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                      className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors ${modelDropdownOpen ? 'bg-foreground/5 dark:bg-white/10 text-foreground' : 'hover:bg-foreground/5 dark:hover:bg-white/10 text-muted'}`}
                    >
                      <span className="text-[14px] font-medium">{selectedModel.name}</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu */}
                    <AnimatePresence>
                      {modelDropdownOpen && (
                        <motion.div 
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full right-0 mb-3 w-[280px] sm:w-[320px] bg-card dark:bg-[#1a1a1c] border border-border-dim dark:border-white/10 rounded-[24px] shadow-2xl p-2 z-50 flex flex-col"
                        >
                          <div className="px-4 py-3 pb-2 border-b border-border-dim dark:border-white/5 mb-1">
                            <span className="text-[12px] font-medium text-muted tracking-widest uppercase">Sonae Models</span>
                          </div>
                          {MODELS.map((model) => (
                            <button
                              key={model.id}
                              type="button"
                              onClick={() => {
                                setSelectedModel(model);
                                setModelDropdownOpen(false);
                              }}
                              className={`flex items-center justify-between w-full p-4 rounded-[16px] text-left transition-colors ${selectedModel.id === model.id ? 'bg-foreground/5 dark:bg-white/10' : 'hover:bg-foreground/5 dark:hover:bg-white/5'}`}
                            >
                              <div className="flex flex-col gap-1">
                                <span className={`text-[15px] font-medium ${selectedModel.id === model.id ? 'text-foreground' : 'text-foreground/80'}`}>{model.name}</span>
                                <span className="text-[13px] text-muted font-light">{model.description}</span>
                              </div>
                              {selectedModel.id === model.id && (
                                <div className="w-5 h-5 rounded-full bg-brand/20 flex items-center justify-center flex-shrink-0">
                                  <Check className="w-3 h-3 text-brand" />
                                </div>
                              )}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Submit / Loader */}
                  <button
                    type="submit"
                    disabled={!content.trim() && !isSubmitting}
                    className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-300 ${
                      isSubmitting 
                        ? "bg-foreground text-background scale-95" 
                        : content.trim() 
                          ? "bg-foreground text-background hover:scale-105 active:scale-95" 
                          : "bg-white/5 text-muted pointer-events-none"
                    }`}
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ArrowUp className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </form>

          {/* Footer Legal Copy */}
          <div className="mt-4 text-center max-w-2xl px-4 w-full">
            <span className="text-[12px] text-muted font-light leading-relaxed">
              Sonae Assistant is AI and can make mistakes, please check all responses.
            </span>
          </div>
        </div>
      </div>

      {/* Access Denial Matrix */}
      <SonaeModal 
        isOpen={permissionError} 
        onClose={() => setPermissionError(false)}
        title="Microphone Access Blocked"
      >
        <div className="flex flex-col gap-5 pt-2">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-500 opacity-80" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-semibold tracking-wide">Secure API Blocked</span>
            <p className="text-[14px] text-secondary font-light leading-relaxed">
              Your browser has explicitly blocked Sonae from accessing the native Web Speech API microphone proxy.
            </p>
          </div>
          <div className="bg-foreground/[0.03] border border-border-dim rounded-[12px] p-4 text-[13px] text-muted font-mono tracking-wide mt-2">
            Click the `microphone` icon located in your browser's top URL search bar and select "Allow".
          </div>
          <div className="w-full flex justify-end mt-2">
            <button 
              onClick={() => setPermissionError(false)}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-2.5 rounded-full text-[13px] font-bold tracking-widest uppercase transition-colors"
            >
              Close Alert
            </button>
          </div>
        </div>
      </SonaeModal>
      
    </div>
  );
}
