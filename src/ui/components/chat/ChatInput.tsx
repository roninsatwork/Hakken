"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  ShieldCheck, 
  Plus, 
  ChevronDown, 
  Check, 
  Square,
  ArrowUp,
  Loader2,
  Mic,
  MicOff,
  AlertTriangle,
  AudioLines,
  FileText,
  X
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "../feedback/SonaeModal";
import { Button } from "@/src/ui/atoms/Button";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useTranslations } from "next-intl";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import {
  modelSupportsThinking,
  readRememberedThinkingLevel,
  rememberThinkingLevel,
  resolveThinkingLevelForModel,
  type ThinkingLevelId,
} from "@/src/lib/composerPreferences";

interface ChatInputProps {
  threadId: Id<"threads">;
  onUploadStateChange?: (status: string | null) => void;
  onOptimisticMessage?: (text: string | null) => void;
  onOpenVoice?: () => void;
}



export default function ChatInput({ threadId, onUploadStateChange, onOptimisticMessage, onOpenVoice }: ChatInputProps) {
  const settings = useSystemSettings();
  const t = useTranslations("ai.assistant.welcome");
  const tComposer = useTranslations("ai.assistant.composer");
  const tControls = useTranslations("ai.assistant.controls");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // What the assistant is doing after submit is reported by the run itself
  // (the thread's stage pill); this component no longer invents status text.

  const thinkingLevels: Array<{ id: ThinkingLevelId; name: string; description: string }> = [
    { id: "NONE", name: tComposer("fastName"), description: tComposer("fastDescription") },
    { id: "LOW", name: tComposer("lowName"), description: tComposer("lowDescription") },
    { id: "MEDIUM", name: tComposer("mediumName"), description: tComposer("mediumDescription") },
    { id: "HIGH", name: tComposer("highName"), description: tComposer("highDescription") },
  ];

  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { isRecording, isTranscribing, toggleRecording, permissionError, setPermissionError } = useVoiceToText({
     onTranscribe: (text) => setContent(prev => prev + (prev && prev.length > 0 ? " " : "") + text)
  });

  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "chat" });
  const activeModels = useMemo(() => activeModelsData ?? [], [activeModelsData]);

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);

  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  // Restored after mount so the server and first client render agree.
  const [selectedThinkingId, setSelectedThinkingId] = useState<ThinkingLevelId>("NONE");
  useEffect(() => {
    const restore = setTimeout(() => setSelectedThinkingId(readRememberedThinkingLevel()), 0);
    return () => clearTimeout(restore);
  }, []);
  
  const [isAutonomousMode] = useState(false);

  const sendMessage = useMutation(api.chat.sendMessage);
  const generateUploadUrl = useMutation(api.chat.generateChatUploadUrl);
  const saveChatDocument = useMutation(api.knowledge.saveChatDocument);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const modelRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);

  // Set default model automatically
  useEffect(() => {
    if (!selectedModelId && activeModels.length > 0) {
       const defModel = activeModels.find((model) => model.isDefault) || activeModels[0];
       setSelectedModelId(defModel.modelId);
    }
  }, [activeModels, selectedModelId]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modelRef.current && !modelRef.current.contains(event.target as Node)) {
        setModelDropdownOpen(false);
      }
      if (thinkingRef.current && !thinkingRef.current.contains(event.target as Node)) {
        setThinkingDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.ceil(Math.min(textareaRef.current.scrollHeight, 250))}px`;
    }
  }, [content]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach(file => {
      // A photo and a document are different attachments with different
      // budgets: an image is inline evidence for this turn (5MB), a document
      // is parsed and can be far larger. Routed by what the file is, so the
      // one picker serves both.
      const policy = file.type.startsWith("image/") ? "chatImage" : "chatDocument";
      const validation = validateUploadFile(file, policy);
      if (validation.allowed) {
        validFiles.push(file);
      } else {
        invalidFiles.push(`${file.name} (${validation.reason})`);
      }
    });

    if (invalidFiles.length > 0) {
      setUploadError(`Unsupported file(s): ${invalidFiles.join(", ")}`);
    }

    if (validFiles.length > 0) {
      setPendingFiles(prev => [...prev, ...validFiles]);
    }
    
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const selectedModelData = activeModels.find((model) => model.modelId === selectedModelId);

  // On this path only Google models act on the thinking setting — the other
  // adapters ignore it — so the control is only offered where it does
  // something. Offering "Deep thinking" on a model that cannot think would be
  // a decorative lie.
  const thinkingApplies = modelSupportsThinking(selectedModelData?.providerKey);
  const selectedThinking = thinkingLevels.find((level) => level.id === selectedThinkingId) ?? thinkingLevels[0];

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!content.trim() && pendingFiles.length === 0) || isSubmitting) return;

    if (isRecording) {
      toggleRecording(); // Cleanly detach MediaRecorder so audio saves if they press enter before stopping
    }

    setIsSubmitting(true);
      const textSnapshot = content.trim();
      const filesSnapshot = [...pendingFiles];
      setContent("");
      setPendingFiles([]);
  
      if (onOptimisticMessage) onOptimisticMessage(textSnapshot || "Analyzed attached documents.");
  
      try {
        let uploadedFileIds: Id<"_storage">[] | undefined = undefined;
  
        if (filesSnapshot.length > 0) {
          const statusText = `Encrypting & Uploading ${filesSnapshot.length} file(s)...`;
          setUploadStatus(statusText);
          if (onUploadStateChange) onUploadStateChange(statusText);
          
          uploadedFileIds = [];
          for (const file of filesSnapshot) {
             const postUrl = await generateUploadUrl();
             const result = await fetch(postUrl, {
               method: "POST",
               headers: { "Content-Type": file.type },
               body: file,
             });
             const { storageId } = await result.json();

             // A document becomes knowledge; a photo does not. Images ride on
             // the message as inline evidence for this turn only — never
             // ingested, never retrievable by later questions.
             if (!file.type.startsWith("image/")) {
               await saveChatDocument({
                   storageId,
                   threadId,
                   title: file.name,
                   format: file.type
               });
             }

             uploadedFileIds.push(storageId);
          }
          const parsingText = "Parsing Intelligence Data...";
          setUploadStatus(parsingText);
          if (onUploadStateChange) onUploadStateChange(parsingText);
          
          // Clear file upload status to allow progressive loading hook to take over
          setUploadStatus(null);
        }
  
        await sendMessage({
        threadId,
        content: textSnapshot || "Analyzed attached documents.",
        modelId: selectedModelId || undefined,
        // A model that ignores the thinking setting is never sent one, so the
        // request matches what the screen offered.
        thinkingLevel: isAutonomousMode
          ? "SWARM"
          : resolveThinkingLevelForModel({
              remembered: selectedThinkingId,
              modelSupportsThinking: modelSupportsThinking(selectedModelData?.providerKey),
            }),
        fileIds: uploadedFileIds,
      });
    } catch (error) {
      console.error("Failed to send message:", error);
      setContent(textSnapshot); // revert
      setPendingFiles(filesSnapshot);
      if (onOptimisticMessage) onOptimisticMessage(null);
    } finally {
      setIsSubmitting(false);
      setUploadStatus(null);
      if (onUploadStateChange) onUploadStateChange(null);
      if (onOptimisticMessage) onOptimisticMessage(null);
    }
  };

  return (
    <>
      <div className="w-full flex flex-col items-center px-4 sm:px-8 pb-0">
        
        {/* Fallback Transcript-Styled Indicator (Shown if parent doesn't provide transcript rendering) */}
        {!onUploadStateChange && (
          <AnimatePresence>
            {uploadStatus && (
              <motion.div 
                key="status"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex w-full justify-end mb-4"
              >
                <div className="px-4 py-2 rounded-full bg-brand/10 border border-brand/20 flex items-center gap-2 self-end shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
                  <span className="text-[12px] font-semibold tracking-wide text-brand uppercase">{uploadStatus}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <form 
          onSubmit={handleSubmit}
          className="w-full relative z-20"
        >
          {/* Field first, settings after: the input is unmistakably an
              input, and the controls read as secondary because they sit
              outside it. */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="flex flex-col gap-2.5"
          >
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 px-0.5">
                {pendingFiles.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 bg-foreground/5 dark:bg-white/10 px-3 py-1.5 rounded-full relative group">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-[13px] font-medium text-foreground max-w-[120px] truncate">{file.name}</span>
                    {/* Raw on purpose: a 16px chip remover — far smaller than
                        any Button variant's hit target. */}
                    <button
                      type="button"
                      onClick={() => removePendingFile(i)}
                      className="w-4 h-4 rounded-full bg-foreground/10 hover:bg-foreground/20 flex items-center justify-center transition-colors -mr-1"
                    >
                      <X className="w-3 h-3 text-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept=".pdf,.csv,.xlsx,.docx,.txt,image/*"
              onChange={(e) => handleFileSelect(e.target.files)}
            />

            {/* Items end-aligned so the send button tracks the last line as
                the field grows rather than floating mid-box. */}
            <div
              className={`flex items-end gap-2.5 rounded-[12px] border bg-background/60 dark:bg-black/25 px-3.5 py-3 transition-colors ${
                isDragging
                  ? "border-brand border-dashed"
                  : isRecording
                    ? "border-brand"
                    : "border-border-dim focus-within:border-brand/50"
              }`}
            >
              <ShieldCheck className={`w-[16px] h-[16px] mb-[3px] flex-shrink-0 transition-colors ${isRecording ? "text-brand" : "text-muted/50"}`} />
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onPaste={(e) => {
                  // A screenshot pasted straight from the clipboard is the
                  // commonest way a photo reaches a chat box.
                  const files = Array.from(e.clipboardData?.files ?? []);
                  if (files.length === 0) return;
                  e.preventDefault();
                  const list = new DataTransfer();
                  files.forEach((file) => list.items.add(file));
                  handleFileSelect(list.files);
                }}
                placeholder={isRecording ? "Recording securely..." : isTranscribing ? "Transcribing perfectly..." : t("replyPlaceholder", { platformName: settings.platformName })}
                className={`w-full bg-transparent border-none outline-none focus:outline-none text-[15px] focus:ring-0 p-0 resize-none min-h-[24px] max-h-[260px] overflow-y-auto scrollbar-hide leading-relaxed transition-colors ${
                  isRecording ? "text-brand placeholder:text-brand/50" : "text-foreground placeholder:text-muted/70"
                }`}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
              />
              {/* Raw on purpose: the send control morphs between submit and
                  stop, and its whole recipe swaps with that state. */}
              <button
                type={isSubmitting ? "button" : "submit"}
                disabled={!content.trim() && !isSubmitting}
                aria-label={tControls("send")}
                className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-[8px] transition-all mb-[1px] ${
                  content.trim() || isSubmitting
                    ? "bg-brand text-white hover:brightness-110 active:scale-95"
                    : "bg-foreground/10 text-muted pointer-events-none"
                }`}
              >
                {isSubmitting ? <Square className="w-3 h-3 fill-current" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* The composer chips below stay raw on purpose: h-7 borderless
                  or state-tinted recipes of the chat front end, not the admin
                  kit's variants. */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || isRecording}
                className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {tControls("attach")}
              </button>

              <button
                type="button"
                onClick={toggleRecording}
                disabled={isTranscribing}
                className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-[8px] border text-[12px] transition-colors ${
                  isRecording
                    ? "border-brand/40 bg-brand/10 text-brand"
                    : "border-border-dim text-secondary hover:text-foreground hover:bg-foreground/5"
                }`}
                title={isRecording ? tControls("mic.stop") : tControls("mic.start")}
              >
                {isRecording ? <MicOff className="w-3.5 h-3.5" /> : isTranscribing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mic className="w-3.5 h-3.5" />}
                {isRecording ? tControls("mic.stop") : tControls("speak")}
              </button>

              {onOpenVoice ? (
                <button
                  type="button"
                  onClick={onOpenVoice}
                  disabled={isSubmitting || isRecording}
                  className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
                  title={tControls("voice")}
                >
                  <AudioLines className="w-3.5 h-3.5" />
                  {tControls("voice")}
                </button>
              ) : null}

              <div className="ml-auto flex items-center gap-2">
                {/* Database Model Selector */}
                <div className="relative" ref={modelRef}>
                  {/* Raw on purpose (and the menu rows below): open-state pills
                      and listbox rows, not standalone button recipes. */}
                  <button
                    type="button"
                    onClick={() => { setModelDropdownOpen(!modelDropdownOpen); setThinkingDropdownOpen(false); }}
                    disabled={isRecording || activeModels.length === 0 || isAutonomousMode}
                    className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors disabled:opacity-50 ${modelDropdownOpen ? 'bg-foreground/5 dark:bg-white/10 text-foreground' : 'hover:bg-foreground/5 dark:hover:bg-white/10 text-muted'}`}
                  >
                    <span className="text-[14px] font-medium max-w-[140px] truncate">{selectedModelData ? (selectedModelData.friendlyName || selectedModelData.displayName || selectedModelData.modelId) : tComposer("selectModel")}</span>
                    <ChevronDown className="w-4 h-4 flex-shrink-0" />
                  </button>

                  <AnimatePresence>
                    {modelDropdownOpen && !isRecording && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full right-0 mb-3 w-[220px] bg-card dark:bg-[#1a1a1c] border border-border-dim dark:border-white/10 rounded-[14px] shadow-2xl p-1.5 z-50 flex flex-col max-h-[300px] overflow-y-auto custom-scrollbar"
                      >
                        <div className="px-3 py-2 border-b border-border-dim dark:border-white/5 mb-1 sticky top-0 bg-card z-10">
                          <span className="text-[11px] font-medium text-muted tracking-widest uppercase">{tComposer("modelMenuTitle")}</span>
                        </div>
                        {activeModels.map((model) => (
                          <button
                            key={model.modelId}
                            type="button"
                            onClick={() => {
                              setSelectedModelId(model.modelId);
                              setModelDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between w-full px-3 py-2 rounded-[10px] text-left transition-colors ${selectedModelId === model.modelId ? 'bg-foreground/5 dark:bg-white/10' : 'hover:bg-foreground/5 dark:hover:bg-white/5'}`}
                          >
                            <span className={`text-[14px] font-medium truncate pr-3 ${selectedModelId === model.modelId ? 'text-foreground' : 'text-foreground/80'}`}>{model.friendlyName || model.displayName || model.modelId}</span>
                            {selectedModelId === model.modelId && (
                              <Check className="w-3.5 h-3.5 text-brand flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Thinking Level Dropdown — only for models the setting reaches */}
                {thinkingApplies && (
                <div className="relative" ref={thinkingRef}>
                  <button
                    type="button"
                    onClick={() => { setThinkingDropdownOpen(!thinkingDropdownOpen); setModelDropdownOpen(false); }}
                    disabled={isRecording || isAutonomousMode}
                    className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors disabled:opacity-50 ${thinkingDropdownOpen ? 'bg-foreground/5 dark:bg-white/10 text-foreground' : 'hover:bg-foreground/5 dark:hover:bg-white/10 text-muted'}`}
                  >
                    <span className="text-[14px] font-medium">{selectedThinking.name}</span>
                    <ChevronDown className="w-4 h-4" />
                  </button>

                  <AnimatePresence>
                    {thinkingDropdownOpen && !isRecording && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full right-0 mb-3 w-[240px] bg-card dark:bg-[#1a1a1c] border border-border-dim dark:border-white/10 rounded-[14px] shadow-2xl p-1.5 z-50 flex flex-col"
                      >
                        <div className="px-3 py-2 border-b border-border-dim dark:border-white/5 mb-1">
                          <span className="text-[11px] font-medium text-muted tracking-widest uppercase">{tComposer("thinkingMenuTitle")}</span>
                        </div>
                        {thinkingLevels.map((level) => (
                          <button
                            key={level.id}
                            type="button"
                            onClick={() => {
                              setSelectedThinkingId(level.id);
                              rememberThinkingLevel(level.id);
                              setThinkingDropdownOpen(false);
                            }}
                            className={`flex items-center justify-between w-full px-3 py-2 rounded-[10px] text-left transition-colors ${selectedThinkingId === level.id ? 'bg-foreground/5 dark:bg-white/10' : 'hover:bg-foreground/5 dark:hover:bg-white/5'}`}
                          >
                            <div className="flex flex-col min-w-0 pr-3">
                              <span className={`text-[14px] font-medium truncate ${selectedThinkingId === level.id ? 'text-foreground' : 'text-foreground/80'}`}>{level.name}</span>
                              <span className="text-[12px] text-muted font-light truncate">{level.description}</span>
                            </div>
                            {selectedThinkingId === level.id && (
                              <Check className="w-3.5 h-3.5 text-brand flex-shrink-0" />
                            )}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                )}

              </div>
            </div>
          </div>
        </form>

        {/* Required AI disclosure. Kept legible on purpose — it is a
            transparency obligation, not footer decoration. */}
        <p className="mt-2.5 pb-2 text-[11px] leading-relaxed text-secondary">
          {settings.platformName} Assistant is AI and can make mistakes, please check all responses.
        </p>
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
              Your browser has explicitly blocked {settings.platformName} from accessing the native Web Speech API microphone proxy.
            </p>
          </div>
          <div className="bg-foreground/[0.03] border border-border-dim rounded-[12px] p-4 text-[13px] text-muted font-mono tracking-wide mt-2">
            Click the `microphone` icon located in your browser&apos;s top URL search bar and select &quot;Allow&quot;.
          </div>
          <div className="w-full flex justify-end mt-2">
            <Button variant="destructive" onClick={() => setPermissionError(false)}>
              Close Alert
            </Button>
          </div>
        </div>
      </SonaeModal>

      {/* File Upload Error Matrix */}
      <SonaeModal 
        isOpen={!!uploadError} 
        onClose={() => setUploadError(null)}
        title="File Upload Invalid"
      >
        <div className="flex flex-col gap-5 pt-2">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-500 opacity-80" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-semibold tracking-wide">Unsupported File Format</span>
            <p className="text-[14px] text-secondary font-light leading-relaxed">
              {uploadError}
            </p>
          </div>
          <div className="bg-foreground/[0.03] border border-border-dim rounded-[12px] p-4 text-[13px] text-muted font-mono tracking-wide mt-2">
            Tip: Convert documents to pure text formats (CSV or standard PDF) for stable execution.
          </div>
          <div className="w-full flex justify-end mt-2">
            <Button variant="destructive" onClick={() => setUploadError(null)}>
              Clear Alert
            </Button>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
