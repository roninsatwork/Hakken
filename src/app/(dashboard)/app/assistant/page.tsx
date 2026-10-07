"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useVoiceToText } from "@/src/hooks/useVoiceToText";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import { AssistantComposer } from "./_components/AssistantComposer";
import { AssistantHero } from "./_components/AssistantHero";
import {
  appendTranscript,
  buildUnsupportedFileList,
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
import { AssistantClientPicker, clientThreadArgs, type ClientChoice } from "./_components/AssistantClientPicker";
import { AssistantWebsitePicker, chosenWebsite } from "./_components/AssistantWebsitePicker";

const loadAssistantModals = () => import("./_components/AssistantModals");
const AssistantModals = lazy(() =>
  loadAssistantModals().then(({ AssistantModals: Component }) => ({ default: Component })),
);

export default function AssistantWelcomePage() {
  const t = useTranslations("ai.assistant");
  const tCommon = useTranslations("common");
  const settings = useSystemSettings();
  const router = useRouter();
  const startAction = useAdminAction({ scope: "assistant-welcome-start" });
  const voiceAction = useAdminAction({ scope: "assistant-welcome-voice" });
  // "Ask Hakken about this" on a News story arrives with its question typed
  // and not sent: the reader reads it, changes it if they like, and presses
  // send (knowledge-news-and-digest-plan.md, revised again 2026-10-01, R10).
  const searchParams = useSearchParams();
  const askedAbout = searchParams.get("ask");

  const [content, setContent] = useState(() => askedAbout?.slice(0, 2_000) ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [thinkingDropdownOpen, setThinkingDropdownOpen] = useState(false);
  const [modalsActivated, setModalsActivated] = useState(false);
  // Restored after mount so the server and first client render agree; the
  // choice is a preference and survives the page.
  const [selectedThinkingId, setSelectedThinkingId] = useState<ThinkingLevelId>("NONE");
  useEffect(() => {
    const restore = setTimeout(() => setSelectedThinkingId(readRememberedThinkingLevel()), 0);
    return () => clearTimeout(restore);
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLDivElement>(null);
  const thinkingRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const createThread = useMutation(api.chat.createThread);
  // A super admin chooses which client a new conversation answers for
  // (assistant-foundation-plan.md, item 8); everyone else is always answered
  // for their own company and sees no picker.
  const me = useQuery(api.users.getMe);
  const isSuperAdmin = me?.role === "SUPER_ADMIN";
  // Viewing as a company, a super admin answers for one of its websites, and sees only its websites
  // (keep-less-history-plan.md, 6.1); viewing as no one, the list of clients as before.
  const viewingAsCompany = isSuperAdmin && Boolean(me?.impersonatingCompanyId);
  const pickerHolds = useQuery(api.sites.listPickerHolds, viewingAsCompany ? {} : "skip");
  const chosenSite = viewingAsCompany && pickerHolds ? chosenWebsite(pickerHolds, searchParams.get("site")) : null;
  const threadArgs = () => ({
    ...clientThreadArgs(clientChoice, viewingAs),
    // The picker's shared shape carries a hold's id as text (`PickerHold`); it is one of `listPickerHolds`' ids.
    ...(chosenSite ? { forWebsiteId: chosenSite.siteId as Id<"companyWebsites"> } : {}),
  });
  const viewingAs = me ? (me.impersonatingCompanyId ?? me.companyId) : undefined;
  const [clientChoice, setClientChoice] = useState<ClientChoice | null>(null);
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

    setModalsActivated(true);
    void loadAssistantModals();

    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    Array.from(files).forEach((file) => {
      const policy = file.type.startsWith("image/") ? "chatImage" : "chatDocument";
      const validation = validateUploadFile(file, policy);
      if (validation.allowed) {
        validFiles.push(file);
      } else {
        invalidFiles.push(`${file.name} (${validation.reason})`);
      }
    });

    const invalidFileList = buildUnsupportedFileList(invalidFiles);
    if (invalidFileList) {
      setUploadError(t("unsupportedFiles", { files: invalidFileList }));
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

  // A spoken conversation from a blank slate: make the thread, then land on
  // it with voice mode opening. No message is sent here — the first thing
  // the thread hears is whatever the person says.
  const handleStartVoice = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const outcome = await voiceAction.run(
      async () => {
        const threadId = await createThread(threadArgs());
        router.push(`/app/assistant/${threadId}?voice=1`);
      },
      { fallbackMessage: tCommon("errors.default") },
    );
    // An empty message means a repeat press the runner turned away, not a
    // failure; the attempt in flight is still going to navigate.
    if (!outcome.ok && outcome.message) setIsSubmitting(false);
  };

  const handleToggleRecording = () => {
    setModalsActivated(true);
    void loadAssistantModals();
    toggleRecording();
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

    const outcome = await startAction.run(
      async () => {
        const threadId = await createThread(threadArgs());
        let uploadedFileIds: Id<"_storage">[] | undefined = undefined;

        if (filesSnapshot.length > 0) {
          setUploadStatus(`Encrypting & Uploading ${filesSnapshot.length} file(s)...`);
          uploadedFileIds = [];

          for (const file of filesSnapshot) {
            const postUrl = await generateUploadUrl({ sizeBytes: file.size, contentType: file.type });
            const result = await fetch(postUrl, {
              method: "POST",
              headers: { "Content-Type": file.type },
              body: file,
            });
            const { storageId } = await result.json();

            // A document becomes knowledge; a photo does not — it rides on the
            // message as inline evidence for this turn only.
            if (!file.type.startsWith("image/")) {
              await saveChatDocument({
                storageId,
                threadId,
                title: file.name,
                format: file.type,
              });
            }

            uploadedFileIds.push(storageId);
          }

          setUploadStatus("Parsing Intelligence Data...");
          setUploadStatus(null);
        }

        await sendMessage({
          threadId,
          content: textSnapshot || t("analyzedDocuments"),
          modelId: effectiveSelectedModelId || undefined,
          // A model that ignores the thinking setting is never sent one, so
          // the request matches what the screen offered.
          thinkingLevel: resolveThinkingLevelForModel({
            remembered: selectedThinkingId,
            modelSupportsThinking: modelSupportsThinking(selectedModelData?.providerKey),
          }),
          fileIds: uploadedFileIds,
        });
        router.push(`/app/assistant/${threadId}`);
      },
      { fallbackMessage: tCommon("errors.default") },
    );

    // An empty message means a repeat submit the runner turned away, not a
    // failure; the attempt in flight still owns the text and the navigation.
    if (!outcome.ok && outcome.message) {
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
        platformName={settings.platformName}
        t={t}
      />

      <AssistantComposer
        activeModels={activeModels}
        clientPicker={viewingAsCompany ? (
          <AssistantWebsitePicker holds={pickerHolds ?? []} chosen={chosenSite} />
        ) : isSuperAdmin ? (
          <AssistantClientPicker choice={clientChoice} viewingAs={viewingAs} onChoose={setClientChoice} />
        ) : undefined}
        content={content}
        displayedUploadStatus={displayedUploadStatus}
        effectiveSelectedModelId={effectiveSelectedModelId}
        fileInputRef={fileInputRef}
        footerText={t("welcome.footer", { platformName: settings.platformName })}
        handleFileSelect={handleFileSelect}
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
        onToggleRecording={handleToggleRecording}
        onStartVoice={handleStartVoice}
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

      {modalsActivated || permissionError || uploadError ? (
        <Suspense fallback={null}>
          <AssistantModals
            onClearUploadError={() => setUploadError(null)}
            onPermissionErrorClose={() => setPermissionError(false)}
            permissionError={permissionError}
            platformName={settings.platformName}
            t={t}
            tCommon={tCommon}
            uploadError={uploadError}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
