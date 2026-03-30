"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  ShieldCheck, 
  Plus, 
  Settings2, 
  ChevronDown, 
  Check, 
  Square,
  ArrowUp,
  Loader2,
  Mic
} from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";

interface ChatInputProps {
  threadId: Id<"threads">;
}

const MODELS = [
  { id: "fast", name: "Fast", description: "Answers quickly" },
  { id: "thinking", name: "Thinking", description: "Solves complex problems" },
  { id: "pro", name: "Pro", description: "Advanced logic and frameworks" },
];

export default function ChatInput({ threadId }: ChatInputProps) {
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[1]); // Default to Thinking
  
  const sendMessage = useMutation(api.chat.sendMessage);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [content]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    const textSnapshot = content.trim();
    setContent(""); 
    
    // Reset height manually after optimistic clear
    if (textareaRef.current) {
      textareaRef.current.style.height = "24px";
    }

    try {
      await sendMessage({ 
        threadId, 
        content: textSnapshot,
        modelId: selectedModel.id,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      setContent(textSnapshot); // revert
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center px-4 sm:px-8 pb-0">
      <form 
        onSubmit={handleSubmit}
        className="w-full relative z-20"
      >
        <div className="relative flex flex-col bg-[#1e1e20] border border-white/5 rounded-[32px] p-4 pb-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] focus-within:bg-[#252528] transition-colors duration-300">
          
          {/* Top Row: Icon + Input */}
          <div className="flex items-start gap-3 w-full pl-1">
            <ShieldCheck className="w-[18px] h-[18px] text-muted/60 mt-[3px] flex-shrink-0" />
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Enter a prompt for Sonae"
              className="w-full bg-transparent border-none outline-none focus:outline-none text-foreground text-[16px] placeholder:text-muted/70 focus:ring-0 p-0 resize-none min-h-[24px] max-h-[350px] scrollbar-hide font-light leading-relaxed"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          {/* Bottom Row: Controls */}
          <div className="flex items-center justify-between w-full mt-3">
            
            {/* Left Controls */}
            <div className="flex items-center gap-1">
              <button 
                type="button"
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-muted transition-colors"
                title="Upload files"
              >
                <Plus className="w-5 h-5" />
              </button>
              <button 
                type="button"
                className="h-10 px-4 flex items-center gap-2 rounded-full hover:bg-white/10 text-muted transition-colors"
              >
                <Settings2 className="w-[18px] h-[18px]" />
                <span className="text-[14px] font-medium tracking-wide">Tools</span>
              </button>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2 relative">
              
              {/* Voice Dictation (Mic) */}
              <button 
                type="button" 
                className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white/10 text-muted transition-colors sm:mr-1"
                title="Start voice dictation"
              >
                <Mic className="w-[18px] h-[18px]" />
              </button>

              {/* Model Selector Wrapper */}
              <div className="relative" ref={dropdownRef}>
                <button 
                  type="button"
                  onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                  className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors ${modelDropdownOpen ? 'bg-white/10 text-foreground' : 'hover:bg-white/10 text-muted'}`}
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
                      className="absolute bottom-full right-0 mb-3 w-[280px] sm:w-[320px] bg-[#1a1a1c] border border-white/10 rounded-[24px] shadow-2xl p-2 z-50 flex flex-col"
                    >
                      <div className="px-4 py-3 pb-2 border-b border-white/5 mb-1">
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
                          className={`flex items-center justify-between w-full p-4 rounded-[16px] text-left transition-colors ${selectedModel.id === model.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
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

              {/* Submit / Stop Button */}
              <button
                type={isSubmitting ? "button" : "submit"}
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
                  <Square className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <ArrowUp className="w-5 h-5" />
                )}
              </button>
            </div>
            
          </div>
        </div>
      </form>

      {/* Footer Legal Copy */}
      <div className="mt-2.5 pb-2 text-center max-w-2xl px-4 z-10 opacity-70">
        <span className="text-[12px] text-muted font-light leading-relaxed">
          Sonae Assistant is AI and can make mistakes, please check all responses.
        </span>
      </div>
    </div>
  );
}
