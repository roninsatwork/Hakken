"use client";

import { useState, type ChangeEvent } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { IdentitySettingsSection } from "../../_components/IdentitySettingsSection";
import { SettingsScreen } from "../../_components/SettingsScreen";
import type { useSystemSettingsForm } from "../../_components/useSystemSettingsForm";

type IdentitySettingsContentProps = Omit<ReturnType<typeof useSystemSettingsForm>, "isLoading">;

export function IdentitySettingsContent({
  formData,
  setFormData,
  isSaving,
  saveSuccess,
  save,
  updateSettings,
}: IdentitySettingsContentProps) {
  const t = useTranslations("admin.settings");
  const action = useAdminAction({ scope: "admin-system-identity" });
  const clearLogo = useMutation(api.settings.clearLogo);
  const generateUploadUrl = useMutation(api.settings.generateUploadUrl);

  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>, mode: "light" | "dark") => {
    const file = event.target.files?.[0];
    if (!file) return;
    const { validateUploadFile } = await import("@/src/lib/constants/uploads");
    const validation = validateUploadFile(file, "adminImage");
    if (!validation.allowed) return;

    if (mode === "light") setUploadingLight(true);
    if (mode === "dark") setUploadingDark(true);

    const outcome = await action.run(
      async () => {
        const uploadUrl = await generateUploadUrl({ sizeBytes: file.size, contentType: file.type });
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: file,
        });
        const { storageId } = (await res.json()) as { storageId: string };

        // Saved on the spot rather than waiting for the save button: the tile
        // shows the uploaded logo immediately, and a logo shown but unsaved is
        // the one state that reads as a bug.
        await updateSettings(
          mode === "light" ? { logoUrlLight: storageId } : { logoUrlDark: storageId }
        );
        return storageId;
      },
      { key: mode, fallbackMessage: t("logoUploadFailed") }
    );

    if (mode === "light") setUploadingLight(false);
    if (mode === "dark") setUploadingDark(false);
    if (!outcome.ok) return;

    setFormData((current) => ({
      ...current,
      ...(mode === "light" ? { logoUrlLight: outcome.data } : { logoUrlDark: outcome.data }),
    }));
  };

  const handleRemoveLogo = async (mode: "light" | "dark") => {
    if (mode === "light") setUploadingLight(true);
    if (mode === "dark") setUploadingDark(true);

    const outcome = await action.run(() => clearLogo({ mode }), {
      key: mode,
      fallbackMessage: t("logoRemoveFailed"),
    });

    if (mode === "light") setUploadingLight(false);
    if (mode === "dark") setUploadingDark(false);
    if (!outcome.ok) return;

    setFormData((current) => ({
      ...current,
      ...(mode === "light" ? { logoUrlLight: undefined } : { logoUrlDark: undefined }),
    }));
  };

  return (
    <SettingsScreen
      save={{
        onSave: save,
        isSaving,
        saveSuccess,
        label: t("save"),
        savingLabel: t("saving"),
        successLabel: t("success"),
      }}
    >
      <IdentitySettingsSection
        formData={formData}
        setFormData={setFormData}
        uploadingLight={uploadingLight}
        uploadingDark={uploadingDark}
        onFileUpload={handleFileUpload}
        onRemoveLogo={handleRemoveLogo}
        t={t}
      />
    </SettingsScreen>
  );
}
