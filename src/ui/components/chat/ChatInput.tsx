"use client";

import { useState, useRef, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ShieldCheck, 
  Plus, 
  Square,
  ArrowUp,
  Loader2,
  Mic,
  MicOff,
  AlertTriangle,
  Paperclip,
  FileText,
  X
} from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import SonaeModal from "../feedback/SonaeModal";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

interface ChatInputProps {
  threadId: Id<"threads">;
  onUploadStateChange?: (status: string | null) => void;
  onOptimisticMessage?: (text: string | null) => void;
}



export default function ChatInput({ threadId, onUploadStateChange, onOptimisticMessage }: ChatInputProps) {
  const settings = useSystemSettings();
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { isRecording, isTranscribing, toggleRecording, permissionError, setPermissionError } = useVoiceToText({
     onTranscribe: (text) => setContent(prev => prev + (prev && prev.length > 0 ? " " : "") + text)
  });



  const sendMessage = useMutation(api.chat.sendMessage);
  const generateUploadUrl = useMutation(api.chat.generateChatUploadUrl);
  const saveChatDocument = useMutation(api.knowledge.saveChatDocument);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  


  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 250)}px`;
    }
  }, [content]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const allowedTypes = [
      "application/pdf", 
      "text/csv", 
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain"
    ];
    
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB lock

    Array.from(files).forEach(file => {
      if (file.size > MAX_FILE_SIZE) {
         invalidFiles.push(`${file.name} (exceeds 50MB limit)`);
      } else if (allowedTypes.includes(file.type) || file.name.endsWith(".csv") || file.name.endsWith(".txt") || file.name.endsWith(".docx")) {
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
             
             // Plumb through Vector AI Engine
             await saveChatDocument({
                 storageId,
                 threadId,
                 title: file.name,
                 format: file.type
             });

             uploadedFileIds.push(storageId);
          }
          const parsingText = "Parsing Intelligence Data...";
          setUploadStatus(parsingText);
          if (onUploadStateChange) onUploadStateChange(parsingText);
        } else {
          const connectingText = "Connecting to Agent...";
          setUploadStatus(connectingText);
          if (onUploadStateChange) onUploadStateChange(connectingText);
        }
  
        await sendMessage({
        threadId,
        content: textSnapshot || "Analyzed attached documents.",
        modelId: undefined,
        thinkingLevel: "NONE",
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

  const selectedModelData = activeModels.find((m: any) => m.modelId === selectedModelId);

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
          {/* Reactive Outer Envelope */}
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
                placeholder={isRecording ? "Recording securely..." : isTranscribing ? "Transcribing perfectly..." : `Enter a prompt for ${settings.platformName}`}
                className={`w-full bg-transparent border-none outline-none focus:outline-none text-[16px] focus:ring-0 p-0 resize-none min-h-[24px] max-h-[350px] scrollbar-hide font-light leading-relaxed transition-colors ${
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

                {/* Voice Dictation (Mic) Node */}
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
            {settings.platformName} Assistant is AI and can make mistakes, please check all responses.
          </span>
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
              Your browser has explicitly blocked {settings.platformName} from accessing the native Web Speech API microphone proxy.
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
    </>
  );
}
