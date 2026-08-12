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
  selectedModelData,
  selectedThinkingId,
  setContent,
  textareaRef,
  thinkingDropdownOpen,
  thinkingRef,
  t,
}: AssistantComposerProps) {
  return (
    // In flow with the greeting above it, not floated over the screen.
    <div className="w-full">
      <div className="w-full flex flex-col">
        <AssistantUploadStatus status={displayedUploadStatus} />

        <form onSubmit={onStart} className="w-full relative">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            className="flex flex-col gap-2.5"
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

            {/* The field reads as a field: its own recessed surface, a real
                border, and the send button inside it. Items end-aligned so
                the button sits level with the last line once the box grows
                rather than floating in the middle of it. */}
            <div
              className={`flex items-end gap-2.5 rounded-[12px] border bg-background/60 dark:bg-black/25 px-3.5 py-3 transition-colors ${
                isDragging
                  ? "border-brand border-dashed"
                  : isRecording
                    ? "border-brand"
                    : "border-border-dim focus-within:border-brand/50"
              }`}
            >
              <ShieldCheck
                className={`w-[16px] h-[16px] mb-[3px] flex-shrink-0 transition-colors ${
                  isRecording ? "text-brand" : "text-muted/50"
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
                      : t("welcome.inputPlaceholder")
                }
                className={`w-full bg-transparent border-none outline-none focus:outline-none text-[15px] focus:ring-0 p-0 resize-none min-h-[24px] max-h-[260px] overflow-y-auto scrollbar-hide leading-relaxed transition-colors ${
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
              <button
                type="submit"
                disabled={!content.trim() && !isSubmitting}
                aria-label={t("controls.send")}
                className={`w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-[8px] transition-all mb-[1px] ${
                  content.trim() || isSubmitting
                    ? "bg-brand text-white hover:brightness-110 active:scale-95"
                    : "bg-foreground/10 text-muted pointer-events-none"
                }`}
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-4 h-4" />}
              </button>
            </div>

            {/* Settings sit outside the field, so they read as settings. */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || isRecording}
                className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("controls.attach")}
              </button>

              <button
                type="button"
                onClick={onToggleRecording}
                disabled={isTranscribing}
                className={`h-7 px-2.5 inline-flex items-center gap-1.5 rounded-[8px] border text-[12px] transition-colors ${
                  isRecording
                    ? "border-brand/40 bg-brand/10 text-brand"
                    : "border-border-dim text-secondary hover:text-foreground hover:bg-foreground/5"
                }`}
                title={isRecording ? t("controls.mic.stop") : t("controls.mic.start")}
              >
                {isRecording ? (
                  <MicOff className="w-3.5 h-3.5" />
                ) : isTranscribing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Mic className="w-3.5 h-3.5" />
                )}
                {isRecording ? t("controls.mic.stop") : t("controls.speak")}
              </button>

              <div className="ml-auto flex items-center gap-2">
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

                {/* Only for models the setting reaches — on this path that is
                    Google; the other adapters ignore it, so offering the knob
                    there would be a decorative lie. */}
                {selectedModelData?.providerKey === "google" && (
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
                )}
              </div>
            </div>
          </div>
        </form>

        <p className="mt-2.5 w-full text-[11px] leading-relaxed text-secondary">{footerText}</p>
      </div>
    </div>
  );
}
