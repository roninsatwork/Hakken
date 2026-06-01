import type { DragEvent, FormEvent, RefObject } from "react";
import { ArrowUp, Loader2, Mic, MicOff, Plus, ShieldCheck } from "lucide-react";
import { AssistantModelSelector } from "./AssistantModelSelector";
import { AssistantThinkingSelector } from "./AssistantThinkingSelector";
import { AssistantUploadStatus } from "./AssistantUploadStatus";
import { PendingFileTray } from "./PendingFileTray";
import type { AssistantModel, Translate } from "./types";
import type { ThinkingLevelId } from "./assistantWelcomeUtils";

type AssistantComposerProps = {
  activeModels: AssistantModel[];
  content: string;
  displayedUploadStatus: string | null;
  effectiveSelectedModelId: string | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  footerText: string;
  handleFileSelect: (files: FileList | null) => void;
  isAutonomousMode: boolean;
  isDragging: boolean;
  isRecording: boolean;
  isSubmitting: boolean;
  isTranscribing: boolean;
  modelDropdownOpen: boolean;
  modelRef: RefObject<HTMLDivElement | null>;
  onDragLeave: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onModelDropdownChange: (isOpen: boolean) => void;
  onRemovePendingFile: (index: number) => void;
  onSelectModel: (modelId: string) => void;
  onSelectThinking: (thinkingId: ThinkingLevelId) => void;
  onStart: (event: FormEvent) => void;
  onThinkingDropdownChange: (isOpen: boolean) => void;
  onToggleRecording: () => void;
  pendingFiles: File[];
  platformName: string;
  selectedModelData: AssistantModel | undefined;
  selectedThinkingId: ThinkingLevelId;
  setContent: (value: string) => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  thinkingDropdownOpen: boolean;
  thinkingRef: RefObject<HTMLDivElement | null>;
  t: Translate;
};

export function AssistantComposer({
  activeModels,
  content,
  displayedUploadStatus,
  effectiveSelectedModelId,
  fileInputRef,
  footerText,
  handleFileSelect,
  isAutonomousMode,
  isDragging,
  isRecording,
  isSubmitting,
  isTranscribing,
  modelDropdownOpen,
  modelRef,
  onDragLeave,
  onDragOver,
  onDrop,
  onModelDropdownChange,
  onRemovePendingFile,
  onSelectModel,
  onSelectThinking,
  onStart,
  onThinkingDropdownChange,
  onToggleRecording,
  pendingFiles,
  platformName,
  selectedModelData,
  selectedThinkingId,
  setContent,
  textareaRef,
  thinkingDropdownOpen,
  thinkingRef,
  t,
}: AssistantComposerProps) {
  return (
    <div className="w-full flex justify-center z-10 absolute bottom-[10vh]">
      <div className="w-full flex items-center justify-center flex-col px-4 sm:px-8">
        <AssistantUploadStatus status={displayedUploadStatus} />

        <form onSubmit={onStart} className="w-full relative">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className={`relative flex flex-col bg-card dark:bg-[#1e1e20] border rounded-[32px] p-4 pb-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all duration-300 ${
              isDragging
                ? "border-brand shadow-[0_0_40px_-5px_rgba(var(--brand),0.5)] border-dashed bg-card/80 dark:bg-[#2a2a2d] scale-[1.01]"
                : isRecording
                  ? "border-brand shadow-[0_0_30px_-5px_rgba(var(--brand),0.3)] bg-card/70 dark:bg-[#252528]"
                  : "border-border-dim dark:border-white/5 focus-within:bg-card/70 dark:focus-within:bg-[#252528]"
            }`}
          >
            <PendingFileTray files={pendingFiles} onRemoveFile={onRemovePendingFile} />

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept=".pdf,.csv,.xlsx,.docx,.txt"
              onChange={(event) => handleFileSelect(event.target.files)}
            />

            <div className="flex items-start gap-3 w-full pl-1">
              <ShieldCheck
                className={`w-[18px] h-[18px] mt-[3px] flex-shrink-0 transition-colors ${
                  isRecording ? "text-brand" : "text-muted/60"
                }`}
              />
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={
                  isRecording
                    ? t("welcome.recording")
                    : isTranscribing
                      ? t("welcome.transcribing")
                      : t("welcome.inputPlaceholder", { platformName })
                }
                className={`w-full bg-transparent border-none outline-none focus:outline-none text-[16px] focus:ring-0 p-0 resize-none min-h-[24px] max-h-[350px] scrollbar-hide font-light leading-relaxed transition-colors ${
                  isRecording ? "text-brand placeholder:text-brand/50" : "text-foreground placeholder:text-muted/70"
                }`}
                rows={1}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    onStart(event as unknown as FormEvent);
                  }
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between w-full mt-3 gap-2 relative">
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

              <div className="flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onToggleRecording}
                  disabled={isTranscribing}
                  className={`w-10 h-10 flex items-center justify-center rounded-full transition-all sm:mr-1 ${
                    isRecording
                      ? "bg-brand/10 text-brand animate-pulse scale-105"
                      : isTranscribing
                        ? "text-brand"
                        : "hover:bg-foreground/5 dark:hover:bg-white/10 text-muted hover:text-foreground"
                  }`}
                  title={isRecording ? t("controls.mic.stop") : t("controls.mic.start")}
                >
                  {isRecording ? (
                    <MicOff className="w-[18px] h-[18px]" />
                  ) : isTranscribing ? (
                    <Loader2 className="w-[18px] h-[18px] animate-spin" />
                  ) : (
                    <Mic className="w-[18px] h-[18px]" />
                  )}
                </button>

                <AssistantModelSelector
                  activeModels={activeModels}
                  effectiveSelectedModelId={effectiveSelectedModelId}
                  isAutonomousMode={isAutonomousMode}
                  isOpen={modelDropdownOpen}
                  isRecording={isRecording}
                  onOpenChange={onModelDropdownChange}
                  onSelectModel={onSelectModel}
                  selectedModelData={selectedModelData}
                  selectorRef={modelRef}
                  t={t}
                />

                <AssistantThinkingSelector
                  isAutonomousMode={isAutonomousMode}
                  isOpen={thinkingDropdownOpen}
                  isRecording={isRecording}
                  onOpenChange={onThinkingDropdownChange}
                  onSelectThinking={onSelectThinking}
                  selectedThinkingId={selectedThinkingId}
                  selectorRef={thinkingRef}
                  t={t}
                />

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
                  {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowUp className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </form>

        <div className="mt-4 z-10 opacity-70 w-full text-center px-4">
          <span className="text-[12px] text-muted font-light leading-relaxed">{footerText}</span>
        </div>
      </div>
    </div>
  );
}
