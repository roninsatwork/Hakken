"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import { useState, useEffect, useMemo, useRef } from "react";
import type { DragEvent, FormEvent } from "react";
import { useParams } from "next/navigation";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  Bot,
  CheckCircle2,
  ImagePlus,
  Globe,
  Loader2
} from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useTranslations } from "next-intl";
import {
  AdminSaveAction,
  AdminSaveError,
} from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";

type ReasoningEffort = "LOW" | "MEDIUM" | "HIGH";

type AgentSettingsFormData = {
  name: string;
  description: string;
  avatar: string;
  modelId: string;
  thinkingMode: boolean;
  reasoningEffort: ReasoningEffort;
  allowInternetAccess: boolean;
  isActive: boolean;
  storageId?: Id<"_storage">;
};

const emptyFormData: AgentSettingsFormData = {
  name: "",
  description: "",
  avatar: "",
  modelId: "",
  thinkingMode: false,
  reasoningEffort: "MEDIUM",
  allowInternetAccess: false,
  isActive: true,
};

const reasoningLevels: ReasoningEffort[] = ["LOW", "MEDIUM", "HIGH"];


export default function AgentOverviewPage() {
  const t = useTranslations("admin.agents.details.settings");
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const agent = useQuery(api.agents.get, { id: agentId });
  const allModels = useQuery(api.aiModels.getModels);
  const activeModels = useMemo(
    () => ((allModels ?? []) as Doc<"aiModels">[]).filter((model) => model.isEnabled),
    [allModels],
  );
  const defaultModelId = useMemo(
    () => activeModels.find((model) => model.isDefault)?.modelId ?? "",
    [activeModels],
  );

  const updateAgent = useMutation(api.agents.updateAgent);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);

  const [formData, setFormData] = useState<AgentSettingsFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [uploadError, setUploadError] = useState("");

  // Avatar Upload State
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initializedAgentIdRef = useRef<Id<"agents"> | null>(null);

  useEffect(() => {
    if (!agent || initializedAgentIdRef.current === agent._id) return;
    if (!agent.modelId && allModels === undefined) return;

    initializedAgentIdRef.current = agent._id;
    setFormData({
      name: agent.name || "",
      description: agent.description || "",
      avatar: agent.avatar || "",
      modelId: agent.modelId || defaultModelId,
      thinkingMode: agent.thinkingMode || false,
      reasoningEffort: agent.reasoningEffort || "MEDIUM",
      allowInternetAccess: agent.allowInternetAccess || false,
      isActive: agent.isActive ?? true,
      storageId: undefined,
    });
  }, [agent, allModels, defaultModelId]);

  const handleSave = async (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
    }
    setIsSaving(true);
    setSaveError("");
    try {
      await updateAgent({
        id: agentId,
        name: formData.name,
        description: formData.description,
        avatar: formData.avatar,
        modelId: formData.modelId,
        thinkingMode: formData.thinkingMode,
        reasoningEffort: formData.reasoningEffort,
        allowInternetAccess: formData.allowInternetAccess,
        isActive: formData.isActive,
        storageId: formData.storageId
      });
      setFormData((prev) => ({ ...prev, storageId: undefined }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: unknown) {
      setSaveError(getErrorMessage(err, t("errors.saveFailed")));
    } finally {
      setIsSaving(false);
    }
  };

  const processUpload = async (file: File) => {
    setIsUploading(true);
    setUploadError("");
    try {
      const postUrl = await generateUploadUrl();
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json() as { storageId: Id<"_storage"> };
      const localPreviewUrl = URL.createObjectURL(file);

      setFormData((prev) => ({
        ...prev,
        storageId,
        avatar: localPreviewUrl
      }));
      setIsAvatarModalOpen(false);
    } catch (error) {
      console.error("Upload failed", error);
      setUploadError(t("errors.uploadFailed"));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrag = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUpload(e.dataTransfer.files[0]);
    }
  };

  if (agent === undefined) return <div className="p-8 text-secondary">{t("loading")}</div>;
  if (agent === null) return <div className="p-8 text-red-500">{t("notFound")}</div>;

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 antialiased">
      <form onSubmit={handleSave} className="flex flex-col gap-12 w-full">
	        <div className="flex flex-col gap-6">
	          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim/50 pb-4">
            <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">1</span>
              {t("sections.identity.title")}
            </h2>

            <AdminSaveAction
              type="submit"
              isSaving={isSaving}
              label={t("sections.identity.saveButton")}
              savingLabel={t("sections.identity.saving")}
              successLabel={t("sections.identity.synchronized")}
              showSuccess={saveSuccess}
            />
	          </div>
            <AdminSaveError>{saveError}</AdminSaveError>

	          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col sm:flex-row gap-8 md:col-span-2 w-full">
              <div className="flex flex-col gap-2 shrink-0">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.identity.avatar.label")}</label>
                <div className="flex items-center gap-4 py-2 pr-6 border-r border-border-dim/30">
                  {formData.avatar ? (
                    <Image
                      src={formData.avatar}
                      alt="Agent Preview"
                      width={64}
                      height={64}
                      unoptimized
                      className="w-16 h-16 rounded-full object-cover border border-white/10 shrink-0 bg-card shadow-sm"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full border border-dashed border-white/20 flex items-center justify-center bg-white/5 shrink-0">
                      <Bot className="w-6 h-6 text-muted" />
                    </div>
                  )}
                  <div className="flex flex-col items-start gap-1">
                    <button
                      type="button"
                      onClick={() => setIsAvatarModalOpen(true)}
                      className="px-4 py-2 rounded-[10px] bg-foreground/10 text-foreground text-[12px] font-medium hover:bg-foreground/20 transition-all border border-border-dim"
                    >
                      {t("sections.identity.avatar.updateButton")}
                    </button>
                    <p className="text-[10px] text-secondary">{t("sections.identity.avatar.hint")}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 flex-1 justify-center">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.identity.name")}</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[14px] text-foreground outline-none transition-all placeholder:text-muted focus:border-[#10b981]/50"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.identity.description")}</label>
              <textarea
                rows={3}
                value={formData.description || ''}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[13px] text-foreground outline-none transition-all placeholder:text-muted focus:border-[#10b981]/50 leading-relaxed min-h-[100px] resize-none"
              />
            </div>

          </div>
        </div>

        {/* Advanced Parameters */}
        <div className="flex flex-col gap-6">
          <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2 border-b border-border-dim/50 pb-4">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">2</span>
            {t("sections.engine.title")}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="flex flex-col gap-2 md:col-span-2 md:w-1/2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.model.label")}</label>
              <select
                value={formData.modelId || ''}
                onChange={e => setFormData({ ...formData, modelId: e.target.value })}
                className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[14px] text-foreground outline-none transition-all focus:border-[#10b981]/50 appearance-none cursor-pointer"
              >
                <option value="" disabled>{t("sections.engine.model.placeholder")}</option>
                {activeModels.map((m) => (
                  <option key={m.modelId} value={m.modelId}>
                    {m.friendlyName || m.displayName || m.modelId} {m.isDefault && t("sections.engine.model.systemDefault")}
                  </option>
                ))}

                {formData.modelId && activeModels.length > 0 && !activeModels.find(m => m.modelId === formData.modelId) && (
                  <option value={formData.modelId}>
                    {formData.modelId} {t("sections.engine.model.legacy")}
                  </option>
                )}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.reasoning.label")}</label>
              <div className="grid grid-cols-3 gap-2 h-[46px]">
                {reasoningLevels.map((level) => (
                  <button
                    key={level}
                    type="button"
                    onClick={() => setFormData({ ...formData, reasoningEffort: level })}
                    className={`flex items-center justify-center gap-2 rounded-[12px] text-[12px] font-medium border transition-all h-full ${formData.reasoningEffort === level ? "bg-brand/20 border-brand/30 text-brand" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                  >
                    {t(`sections.engine.reasoning.levels.${level}`)}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted">{t("sections.engine.reasoning.hint")}</p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.internet.label")}</label>
              <div className="grid grid-cols-2 gap-3 h-[46px]">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, allowInternetAccess: false })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${!formData.allowInternetAccess ? "bg-foreground/10 border-foreground/20 text-foreground" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  {t("sections.engine.internet.offline")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, allowInternetAccess: true })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${formData.allowInternetAccess ? "bg-green-500/20 border-green-500/30 text-green-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  <Globe className="w-4 h-4" /> {t("sections.engine.internet.liveSearch")}
                </button>
              </div>
              <p className="text-[10px] text-muted">{t("sections.engine.internet.hint")}</p>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2 pt-4 border-t border-border-dim/50">
              <label className="text-[11px] font-mono tracking-widest text-muted uppercase">{t("sections.engine.status.label")}</label>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 h-[46px]">
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: false })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${!formData.isActive ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  {t("sections.engine.status.inactive")}
                </button>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: true })}
                  className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${formData.isActive ? "bg-green-500/20 border-green-500/30 text-green-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                >
                  <CheckCircle2 className="w-4 h-4" /> {t("sections.engine.status.active")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Upload Drag & Drop Modal */}
      <SonaeModal
        isOpen={isAvatarModalOpen}
        onClose={() => !isUploading && setIsAvatarModalOpen(false)}
        title={t("uploadModal.title")}
      >
	        <div className="flex flex-col gap-6 mt-2 relative">
	          <p className="text-[13px] text-secondary">
	            {t("uploadModal.subtitle")}
	          </p>
            {uploadError && (
              <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-400">
                {uploadError}
              </div>
            )}

	          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "w-full h-[200px] border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center gap-4 transition-all relative overflow-hidden",
              dragActive ? "border-brand bg-brand/5" : "border-border-dim bg-background/50",
              isUploading ? "opacity-50 pointer-events-none" : ""
            )}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
                <span className="text-[13px] font-medium text-foreground">{t("uploadModal.processing")}</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center pointer-events-none">
                  <ImagePlus className="w-5 h-5 text-secondary" />
                </div>
                <div className="flex flex-col items-center gap-1 pointer-events-none text-center px-4">
                  <span className="text-[14px] font-medium text-foreground">{t("uploadModal.dropText")}</span>
                  <span className="text-[11px] text-muted font-mono uppercase tracking-widest mt-1">{t("uploadModal.dropHint")}</span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processUpload(e.target.files[0]);
                    }
                  }}
                />
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-border-dim/50">
            <button
              type="button"
              onClick={() => !isUploading && setIsAvatarModalOpen(false)}
              disabled={isUploading}
              className="px-5 py-2.5 rounded-[10px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            >
              {t("uploadModal.cancel")}
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
