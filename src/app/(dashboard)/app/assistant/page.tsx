"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Loader2,
  ShieldCheck,
  Plus,
  ChevronDown,
  Check,
  ArrowUp,
  Mic,
  MicOff,
  AlertTriangle,
  FileText,
  X
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

import { useTranslations } from "next-intl";
import { useProgressiveLoading } from "@/src/hooks/useProgressiveLoading";
import { CHAT_DOCUMENT_MAX_BYTES, isSupportedChatDocument } from "@/src/lib/constants/uploads";

const THINKING_LEVELS = [
  { id: "NONE" },
  { id: "LOW" },
  { id: "MEDIUM" },
  { id: "HIGH" },
] as const;

type ThinkingLevelId = (typeof THINKING_LEVELS)[number]["id"];

function getGreetingKey() {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 21) return "evening";
  return "night";
}

export default function AssistantWelcomePage() {
  const t = useTranslations('ai.assistant');
  const tCommon = useTranslations('common');
  const settings = useSystemSettings();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const greetingKey = getGreetingKey();
  
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  
  const progressiveText = useProgressiveLoading(isSubmitting);
  const isUploadingFiles = uploadStatus?.startsWith("Encrypting & Uploading") || uploadStatus?.startsWith("Parsing Intelligence");
  const displayedUploadStatus = isSubmitting && !isUploadingFiles && progressiveText ? progressiveText : uploadStatus;
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isRecording, isTranscribing, toggleRecording, permissionError, setPermissionError } = useVoiceToText({
    onTranscribe: (text) => setContent(prev => prev + (prev && prev.length > 0 ? " " : "") + text)
  });

  const allModels = useQuery(api.aiModels.getModels) as Doc<"aiModels">[] | undefined;
  const activeModels = (allModels ?? []).filter((model) => model.isEnabled);

  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const defaultModel = activeModels.find((model) => model.isDefault) || activeModels[0];
  const effectiveSelectedModelId = selectedModelId || defaultModel?.modelId || null;

  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [selectedThinkingId, setSelectedThinkingId] = useState<ThinkingLevelId>(THINKING_LEVELS[0].id);

  const [isAutonomousMode] = useState(false);

  const modelRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const generateUploadUrl = useMutation(api.chat.generateChatUploadUrl);
  const saveChatDocument = useMutation(api.knowledge.saveChatDocument);
  const user = useQuery(api.users.getMe);
  const router = useRouter();

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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [content]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach(file => {
      if (file.size > CHAT_DOCUMENT_MAX_BYTES) {
         invalidFiles.push(`${file.name} (exceeds 50MB limit)`);
      } else if (isSupportedChatDocument(file)) {
        validFiles.push(file);
      } else {
        invalidFiles.push(file.name);
      }
    });

    if (invalidFiles.length > 0) {
      setUploadError(`Unsupported file(s): ${invalidFiles.join(", ")}. Please upload PDF, CSV, Excel, Word, or Text files under 50MB.`);
    }

    if (validFiles.length > 0) {
      setPendingFiles(prev => [...prev, ...validFiles]);
    }
    
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

  const handleStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!content.trim() && pendingFiles.length === 0) || isSubmitting) return;

    if (isRecording) toggleRecording(); // Clean detach stream early

    setIsSubmitting(true);
    const textSnapshot = content.trim();
    const filesSnapshot = [...pendingFiles];
    setContent("");
    setPendingFiles([]);

    try {
      const threadId = await createThread({});
      
      let uploadedFileIds: Id<"_storage">[] | undefined = undefined;

      if (filesSnapshot.length > 0) {
        setUploadStatus(`Encrypting & Uploading ${filesSnapshot.length} file(s)...`);
        uploadedFileIds = [];
        for (const file of filesSnapshot) {
           const postUrl = await generateUploadUrl();
           const result = await fetch(postUrl, {
             method: "POST",
             headers: { "Content-Type": file.type },
             body: file,
           });
           const { storageId } = await result.json();
           
           await saveChatDocument({
               storageId,
               threadId,
               title: file.name,
               format: file.type
           });

           uploadedFileIds.push(storageId);
        }
        setUploadStatus("Parsing Intelligence Data...");
        
        // Clear file upload status to allow progressive loading hook to take over
        setUploadStatus(null);
      }

      await sendMessage({
        threadId,
        content: textSnapshot || "Analyzed attached documents.",
        modelId: effectiveSelectedModelId || undefined,
        thinkingLevel: isAutonomousMode ? "SWARM" : selectedThinkingId,
        fileIds: uploadedFileIds,
      });
      router.push(`/app/assistant/${threadId}`);
    } catch (error) {
      console.error(error);
      setContent(textSnapshot);
      setPendingFiles(filesSnapshot);
      setIsSubmitting(false); // Reset boundary on rejection
      setUploadStatus(null);
    }
  };

  const firstName = user?.name ? user.name.split(" ")[0] : "";
  const selectedModelData = activeModels.find((model) => model.modelId === effectiveSelectedModelId);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden bg-transparent w-full min-h-0">

      {/* Background Centralized Aura */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vw] h-[50vw] bg-brand/5 blur-[150px] rounded-full pointer-events-none z-0" />

      {/* Hero Welcome Protocol */}
      <div className="flex flex-col items-center gap-6 z-10 w-full max-w-2xl text-center mb-[8vh] mt-[-10vh]">
        <div className="w-14 h-14 rounded-[18px] bg-brand/10 border border-brand/20 flex items-center justify-center shadow-2xl shadow-brand/20 backdrop-blur-3xl animate-pulse">
          <Sparkles className="w-6 h-6 text-brand" />
        </div>
        <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground drop-shadow-md">
          {t(`welcome.greetings.${greetingKey}`)}{firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="max-w-[500px] text-[15px] sm:text-[18px] text-muted font-light leading-relaxed">
          {t('welcome.subtitle')}
        </p>
      </div>

      {/* Universal Injection Input */}
      <div className="w-full flex justify-center z-10 absolute bottom-[10vh]">
        <div className="w-full flex items-center justify-center flex-col px-4 sm:px-8">
          
          {/* Transcript-styled Upload Indicator (Moved out of input) */}
          <AnimatePresence>
            {displayedUploadStatus && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex w-full justify-end mb-6 max-w-4xl"
              >
                <div className="px-4 py-2 rounded-full bg-brand/10 border border-brand/20 flex items-center gap-2 self-end shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 text-brand animate-spin" />
                  <span className="text-[12px] font-semibold tracking-wide text-brand uppercase">{displayedUploadStatus}</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <form
            onSubmit={handleStart}
            className="w-full relative"
          >
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative flex flex-col bg-card dark:bg-[#1e1e20] border rounded-[32px] p-4 pb-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 ${
              isDragging 
                 ? "border-brand shadow-[0_0_40px_-5px_rgba(var(--brand),0.5)] border-dashed bg-card/80 dark:bg-[#2a2a2d] scale-[1.01]"
                 : isRecording 
                 ? "border-brand shadow-[0_0_30px_-5px_rgba(var(--brand),0.3)] bg-card/70 dark:bg-[#252528]" 
                 : "border-border-dim dark:border-white/5 focus-within:bg-card/70 dark:focus-within:bg-[#252528]"
            }`}>
              
              {/* Pending Files Area */}
              {pendingFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3 px-1">
                  {pendingFiles.map((file, i) => (
                    <div key={i} className="flex items-center gap-2 bg-foreground/5 dark:bg-white/10 px-3 py-1.5 rounded-full relative group">
                      <FileText className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-[13px] font-medium text-foreground max-w-[120px] truncate">{file.name}</span>
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
                accept=".pdf,.csv,.xlsx,.docx,.txt"
                onChange={(e) => handleFileSelect(e.target.files)} 
              />

              {/* Top Row: Icon + Input */}
              <div className="flex items-start gap-3 w-full pl-1">
                <ShieldCheck className={`w-[18px] h-[18px] mt-[3px] flex-shrink-0 transition-colors ${isRecording ? "text-brand" : "text-muted/60"}`} />
                <textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={isRecording ? t('welcome.recording') : isTranscribing ? t('welcome.transcribing') : t('welcome.inputPlaceholder', { platformName: settings.platformName })}
                  className={`w-full bg-transparent border-none outline-none focus:outline-none text-[16px] focus:ring-0 p-0 resize-none min-h-[24px] max-h-[350px] scrollbar-hide font-light leading-relaxed transition-colors ${isRecording ? "text-brand placeholder:text-brand/50" : "text-foreground placeholder:text-muted/70"
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
              <div className="flex flex-wrap items-center justify-between w-full mt-3 gap-2 relative">

                {/* Left Controls */}
                <div className="flex items-center gap-1">
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isSubmitting || isRecording}
                    className="w-10 h-10 flex items-center justify-center rounded-full transition-all hover:bg-foreground/5 dark:hover:bg-white/10 text-muted hover:text-foreground group"
                    title="Upload File"
                  >
                    <Plus className="w-[20px] h-[20px] transition-transform group-hover:scale-110" />
                  </button>

                </div>

                {/* Right Controls */}
                <div className="flex flex-wrap items-center justify-end gap-2">

                  {/* Voice Dictation (Mic) */}
                  <button
                    type="button"
                    onClick={toggleRecording}
                    disabled={isTranscribing}
                    className={`w-10 h-10 flex items-center justify-center rounded-full transition-all sm:mr-1 ${isRecording
                        ? "bg-brand/10 text-brand animate-pulse scale-105"
                        : isTranscribing
                          ? "text-brand"
                          : "hover:bg-foreground/5 dark:hover:bg-white/10 text-muted hover:text-foreground"
                      }`}
                    title={isRecording ? t('controls.mic.stop') : t('controls.mic.start')}
                  >
                    {isRecording ? <MicOff className="w-[18px] h-[18px]" /> :
                      isTranscribing ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> :
                        <Mic className="w-[18px] h-[18px]" />}
                  </button>

                  {/* Database Model Selector */}
                  <div className="relative" ref={modelRef}>
                    <button
                      type="button"
                      onClick={() => { setModelDropdownOpen(!modelDropdownOpen); setThinkingDropdownOpen(false); }}
                      disabled={isRecording || activeModels.length === 0 || isAutonomousMode}
                      className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors disabled:opacity-50 ${modelDropdownOpen ? 'bg-foreground/5 dark:bg-white/10 text-foreground' : 'hover:bg-foreground/5 dark:hover:bg-white/10 text-muted'}`}
                    >
                      <span className="text-[14px] font-medium max-w-[140px] truncate">{selectedModelData ? (selectedModelData.friendlyName || selectedModelData.displayName || selectedModelData.modelId) : t('controls.engine.label')}</span>
                      <ChevronDown className="w-4 h-4 flex-shrink-0" />
                    </button>

                    <AnimatePresence>
                      {modelDropdownOpen && !isRecording && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full right-0 mb-3 w-[280px] sm:w-[320px] bg-card dark:bg-[#1a1a1c] border border-border-dim dark:border-white/10 rounded-[24px] shadow-2xl p-2 z-50 flex flex-col max-h-[300px] overflow-y-auto custom-scrollbar"
                        >
                          <div className="px-4 py-3 pb-2 border-b border-border-dim dark:border-white/5 mb-1 sticky top-0 bg-card z-10">
                            <span className="text-[12px] font-medium text-muted tracking-widest uppercase">{t('controls.engine.title')}</span>
                          </div>
                          {activeModels.map((model) => (
                            <button
                              key={model.modelId}
                              type="button"
                              onClick={() => {
                                setSelectedModelId(model.modelId);
                                setModelDropdownOpen(false);
                              }}
                              className={`flex items-center justify-between w-full p-4 rounded-[16px] text-left transition-colors ${effectiveSelectedModelId === model.modelId ? 'bg-foreground/5 dark:bg-white/10' : 'hover:bg-foreground/5 dark:hover:bg-white/5'}`}
                            >
                              <div className="flex flex-col gap-1 min-w-0 pr-4">
                                <span className={`text-[15px] font-medium truncate ${effectiveSelectedModelId === model.modelId ? 'text-foreground' : 'text-foreground/80'}`}>{model.friendlyName || model.displayName || model.modelId}</span>
                                <span className="text-[13px] text-muted font-light truncate">{model.description || t('controls.engine.defaultDesc')}</span>
                              </div>
                              {effectiveSelectedModelId === model.modelId && (
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

                  {/* Thinking Level Dropdown */}
                  <div className="relative" ref={thinkingRef}>
                    <button
                      type="button"
                      onClick={() => { setThinkingDropdownOpen(!thinkingDropdownOpen); setModelDropdownOpen(false); }}
                      disabled={isRecording || isAutonomousMode}
                      className={`h-10 px-4 flex items-center gap-2 rounded-full transition-colors disabled:opacity-50 ${thinkingDropdownOpen ? 'bg-foreground/5 dark:bg-white/10 text-foreground' : 'hover:bg-foreground/5 dark:hover:bg-white/10 text-muted'}`}
                    >
                      <span className="text-[14px] font-medium">{t(`controls.reasoning.levels.${selectedThinkingId}`)}</span>
                      <ChevronDown className="w-4 h-4" />
                    </button>

                    <AnimatePresence>
                      {thinkingDropdownOpen && !isRecording && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: 10 }}
                          transition={{ duration: 0.15 }}
                          className="absolute bottom-full right-0 mb-3 w-[260px] sm:w-[300px] bg-card dark:bg-[#1a1a1c] border border-border-dim dark:border-white/10 rounded-[24px] shadow-2xl p-2 z-50 flex flex-col"
                        >
                          <div className="px-4 py-3 pb-2 border-b border-border-dim dark:border-white/5 mb-1">
                            <span className="text-[12px] font-medium text-muted tracking-widest uppercase">{t('controls.reasoning.title')}</span>
                          </div>
                          {THINKING_LEVELS.map((level) => (
                            <button
                              key={level.id}
                              type="button"
                              onClick={() => {
                                setSelectedThinkingId(level.id);
                                setThinkingDropdownOpen(false);
                              }}
                              className={`flex items-center justify-between w-full p-4 rounded-[16px] text-left transition-colors ${selectedThinkingId === level.id ? 'bg-foreground/5 dark:bg-white/10' : 'hover:bg-foreground/5 dark:hover:bg-white/5'}`}
                            >
                              <div className="flex flex-col gap-1 pr-4 min-w-0">
                                <span className={`text-[15px] font-medium truncate ${selectedThinkingId === level.id ? 'text-foreground' : 'text-foreground/80'}`}>{t(`controls.reasoning.levels.${level.id}`)}</span>
                                <span className="text-[13px] text-muted font-light truncate">{t(`controls.reasoning.descriptions.${level.id}`)}</span>
                              </div>
                              {selectedThinkingId === level.id && (
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
                    className={`w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full transition-all duration-300 ${isSubmitting
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
          <div className="mt-4 z-10 opacity-70 w-full text-center px-4">
            <span className="text-[12px] text-muted font-light leading-relaxed">
              {t('welcome.footer', { platformName: settings.platformName })}
            </span>
          </div>
        </div>
      </div>

      {/* Access Denial Matrix */}
      <SonaeModal
        isOpen={permissionError}
        onClose={() => setPermissionError(false)}
        title={t('errors.mic.title')}
      >
        <div className="flex flex-col gap-5 pt-2">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <AlertTriangle className="w-6 h-6 text-red-500 opacity-80" />
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[16px] font-semibold tracking-wide">{t('errors.mic.subtitle')}</span>
            <p className="text-[14px] text-secondary font-light leading-relaxed">
              {t('errors.mic.description', { platformName: settings.platformName })}
            </p>
          </div>
          <div className="bg-foreground/[0.03] border border-border-dim rounded-[12px] p-4 text-[13px] text-muted font-mono tracking-wide mt-2">
            {t('errors.mic.instruction')}
          </div>
          <div className="w-full flex justify-end mt-2">
            <button
              onClick={() => setPermissionError(false)}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-2.5 rounded-full text-[13px] font-bold tracking-widest uppercase transition-colors"
            >
              {tCommon('actions.dismiss')}
            </button>
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
            <button 
              onClick={() => setUploadError(null)}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-6 py-2.5 rounded-full text-[13px] font-bold tracking-widest uppercase transition-colors"
            >
              Clear Alert
            </button>
          </div>
        </div>
      </SonaeModal>

    </div>
  );
}
