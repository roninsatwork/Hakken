"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useMutation } from "convex/react";
import { Bot, ImagePlus, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "@/src/ui/components/screens/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { SaveError } from "@/src/ui/components/screens/SaveControls";

/**
 * Picking an agent's picture.
 *
 * Lifted out of the agent settings screen so the create screen can carry the
 * same one. Anthony, 2026-08-01, pointing at the settings screen's profile card
 * while looking at the create screen: *"this is missing."* It was, and copying a
 * hundred lines of drag-and-drop into a second screen is how two screens start
 * behaving differently under the same picture.
 *
 * The upload is done here and reported back; what the caller does with the
 * storage id — patch an agent, or hold it until the agent exists — is the
 * caller's business.
 */
export function AdminAvatarPicker({ avatar, labels, onUploaded }: {
  avatar: string;
  labels: {
    updateButton: string;
    hint: string;
    modalTitle: string;
    modalSubtitle: string;
    processing: string;
    dropText: string;
    dropHint: string;
    cancel: string;
    uploadFailed: string;
  };
  onUploaded: (upload: { storageId: Id<"_storage">; previewUrl: string }) => void;
}) {
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);

  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processUpload = async (file: File) => {
    const { validateUploadFile } = await import("@/src/lib/constants/uploads");
    const validation = validateUploadFile(file, "adminImage");
    if (!validation.allowed) {
      setUploadError(validation.reason);
      return;
    }

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
      onUploaded({ storageId, previewUrl: URL.createObjectURL(file) });
      setIsOpen(false);
    } catch (error) {
      console.error("Upload failed", error);
      setUploadError(labels.uploadFailed);
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

  return (
    <>
      <div className="flex items-center gap-5">
        {avatar ? (
          <Image
            src={avatar}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="h-16 w-16 shrink-0 rounded-full border border-white/10 bg-card object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-dashed border-white/20 bg-white/5">
            <Bot className="h-6 w-6 text-muted" />
          </div>
        )}
        <div className="flex flex-col items-start gap-1.5">
          {/* Stays raw: a foreground-tinted chip (bg-foreground/10, bright text) whose colours match no variant. */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="rounded-[10px] border border-border-dim bg-foreground/10 px-4 py-2 text-[12px] font-medium text-foreground transition-colors hover:bg-foreground/20"
          >
            {labels.updateButton}
          </button>
          <p className="text-[11px] text-muted">{labels.hint}</p>
        </div>
      </div>

      <SonaeModal
        isOpen={isOpen}
        onClose={() => !isUploading && setIsOpen(false)}
        title={labels.modalTitle}
      >
        <div className="flex flex-col gap-6 mt-2 relative">
          <p className="text-[13px] text-secondary">{labels.modalSubtitle}</p>
          <SaveError>{uploadError}</SaveError>

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "w-full h-[200px] border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center gap-4 transition-all relative overflow-hidden",
              dragActive ? "border-brand bg-brand/5" : "border-border-dim bg-background/50",
              isUploading ? "opacity-50 pointer-events-none" : "",
            )}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
                <span className="text-[13px] font-medium text-foreground">{labels.processing}</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center pointer-events-none">
                  <ImagePlus className="w-5 h-5 text-secondary" />
                </div>
                <div className="flex flex-col items-center gap-1 pointer-events-none text-center px-4">
                  <span className="text-[14px] font-medium text-foreground">{labels.dropText}</span>
                  <span className="text-[11px] text-muted font-mono uppercase tracking-widest mt-1">
                    {labels.dropHint}
                  </span>
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
            <Button
              variant="ghost"
              onClick={() => !isUploading && setIsOpen(false)}
              disabled={isUploading}
              className="rounded-[10px]"
            >
              {labels.cancel}
            </Button>
          </div>
        </div>
      </SonaeModal>
    </>
  );
}
