"use client";

import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import { AssistantComposer } from "./_components/AssistantComposer";
import { AssistantHero } from "./_components/AssistantHero";
import { AssistantModals } from "./_components/AssistantModals";
import {
  appendTranscript,
  buildUnsupportedFileMessage,
  canStartAssistantThread,
  getGreetingKey,
} from "./_components/assistantWelcomeUtils";
import {
  modelSupportsThinking,
  readRememberedThinkingLevel,
  rememberThinkingLevel,
  resolveThinkingLevelForModel,
  type ThinkingLevelId,
} from "@/src/lib/composerPreferences";

export default function AssistantWelcomePage() {
  const t = useTranslations("ai.assistant");
  const tCommon = useTranslations("common");
  const settings = useSystemSettings();
  const router = useRouter();

  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  // Restored after mount so the server and first client render agree; the
  // choice is a preference and survives the page.
  const [selectedThinkingId, setSelectedThinkingId] = useState<ThinkingLevelId>("NONE");
  useEffect(() => {
    const restore = setTimeout(() => setSelectedThinkingId(readRememberedThinkingLevel()), 0);
    return () => clearTimeout(restore);
  }, []);
  const [isAutonomousMode] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const generateUploadUrl = useMutation(api.chat.generateChatUploadUrl);
  const saveChatDocument = useMutation(api.knowledge.saveChatDocument);
  const user = useQuery(api.users.getMe);
  const activeModels = useQuery(api.aiModels.getActiveModels, { useCase: "chat" }) ?? [];
  const defaultModel = activeModels.find((model) => model.isDefault) || activeModels[0];
  const effectiveSelectedModelId = selectedModelId || defaultModel?.modelId || null;
  const selectedModelData = activeModels.find((model) => model.modelId === effectiveSelectedModelId);

  // Once the message is sent this screen redirects to the thread, where the
  // run's own stage pill reports what is actually happening; no invented
  // status text here.
  const displayedUploadStatus = uploadStatus;

  const { isRecording, isTranscribing, toggleRecording, permissionError, setPermissionError } = useVoiceToText({
    onTranscribe: (text) => setContent((previous) => appendTranscript(previous, text)),
  });

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
    if (!textareaRef.current) return;

    textareaRef.current.style.height = "auto";
    textareaRef.current.style.height = `${Math.ceil(Math.min(textareaRef.current.scrollHeight, 250))}px`;
  }, [content]);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach((file) => {
      const validation = validateUploadFile(file, "chatDocument");
      if (validation.allowed) {
        validFiles.push(file);
      } else {
        invalidFiles.push(`${file.name} (${validation.reason})`);
      }
    });

    const invalidFileMessage = buildUnsupportedFileMessage(invalidFiles);
    if (invalidFileMessage) {
      setUploadError(invalidFileMessage);
    }

    if (validFiles.length > 0) {
      setPendingFiles((previous) => [...previous, ...validFiles]);
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    handleFileSelect(event.dataTransfer.files);
  };

  const removePendingFile = (index: number) => {
    setPendingFiles((previous) => previous.filter((_, fileIndex) => fileIndex !== index));
  };

  const handleModelDropdownChange = (isOpen: boolean) => {
    setModelDropdownOpen(isOpen);
    if (isOpen) setThinkingDropdownOpen(false);
  };

  const handleThinkingDropdownChange = (isOpen: boolean) => {
    setThinkingDropdownOpen(isOpen);
    if (isOpen) setModelDropdownOpen(false);
  };

  const handleSelectModel = (modelId: string) => {
    setSelectedModelId(modelId);
    setModelDropdownOpen(false);
  };

  const handleSelectThinking = (thinkingId: ThinkingLevelId) => {
    setSelectedThinkingId(thinkingId);
    rememberThinkingLevel(thinkingId);
    setThinkingDropdownOpen(false);
  };

  // A starting point loads into the input and focuses it. It never sends on
  // its own — the press to send stays deliberate.
  const handlePickStarter = (text: string) => {
    setContent(text);
    textareaRef.current?.focus();
  };

  const handleStart = async (event: FormEvent) => {
    event.preventDefault();
    if (!canStartAssistantThread(content, pendingFiles.length, isSubmitting)) return;

    if (isRecording) toggleRecording();

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
            format: file.type,
          });

          uploadedFileIds.push(storageId);
        }

        setUploadStatus("Parsing Intelligence Data...");
        setUploadStatus(null);
      }

      await sendMessage({
        threadId,
        content: textSnapshot || "Analyzed attached documents.",
        modelId: effectiveSelectedModelId || undefined,
        // A model that ignores the thinking setting is never sent one, so
        // the request matches what the screen offered.
        thinkingLevel: isAutonomousMode
          ? "SWARM"
          : resolveThinkingLevelForModel({
              remembered: selectedThinkingId,
              modelSupportsThinking: modelSupportsThinking(selectedModelData?.providerKey),
            }),
        fileIds: uploadedFileIds,
      });
      router.push(`/app/assistant/${threadId}`);
    } catch (error) {
      console.error(error);
      setContent(textSnapshot);
      setPendingFiles(filesSnapshot);
      setIsSubmitting(false);
      setUploadStatus(null);
    }
  };

  const firstName = user?.name ? user.name.split(" ")[0] : "";
  const greetingKey = getGreetingKey();

  return (
    // One left-aligned column: greeting, ways in, then the composer. The
    // ambient brand glow is gone — the watermark behind the greeting does
    // that job now without tinting the whole screen.
    <div className="flex-1 flex flex-col justify-center relative overflow-y-auto w-full min-h-0 px-6 py-10">
      <div className="w-full max-w-[660px] mx-auto flex flex-col gap-8">
      <AssistantHero
        firstName={firstName}
        greeting={t(`welcome.greetings.${greetingKey}`)}
        onPickStarter={handlePickStarter}
        t={t}
      />

      <AssistantComposer
        activeModels={activeModels}
        content={content}
        displayedUploadStatus={displayedUploadStatus}
        effectiveSelectedModelId={effectiveSelectedModelId}
        fileInputRef={fileInputRef}
        footerText={t("welcome.footer", { platformName: settings.platformName })}
        handleFileSelect={handleFileSelect}
        isAutonomousMode={isAutonomousMode}
        isDragging={isDragging}
        isRecording={isRecording}
        isSubmitting={isSubmitting}
        isTranscribing={isTranscribing}
        modelDropdownOpen={modelDropdownOpen}
        modelRef={modelRef}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onModelDropdownChange={handleModelDropdownChange}
        onRemovePendingFile={removePendingFile}
        onSelectModel={handleSelectModel}
        onSelectThinking={handleSelectThinking}
        onStart={handleStart}
        onThinkingDropdownChange={handleThinkingDropdownChange}
        onToggleRecording={toggleRecording}
        pendingFiles={pendingFiles}
        selectedModelData={selectedModelData}
        selectedThinkingId={selectedThinkingId}
        setContent={setContent}
        textareaRef={textareaRef}
        thinkingDropdownOpen={thinkingDropdownOpen}
        thinkingRef={thinkingRef}
        t={t}
      />

      </div>

      <AssistantModals
        onClearUploadError={() => setUploadError(null)}
        onPermissionErrorClose={() => setPermissionError(false)}
        permissionError={permissionError}
        platformName={settings.platformName}
        t={t}
        tCommon={tCommon}
        uploadError={uploadError}
      />
    </div>
  );
}
