"use client";

import { useState, type ChangeEvent } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import { IdentitySettingsSection } from "../../_components/IdentitySettingsSection";
import { SettingsScreen } from "../../_components/SettingsScreen";
import { IDENTITY_SETTINGS_FIELDS, useSystemSettingsForm } from "../../_components/useSystemSettingsForm";

export default function CoreIdentityPage() {
  const t = useTranslations("admin.settings");
  const { formData, setFormData, isLoading, isSaving, saveSuccess, save, updateSettings } =
    useSystemSettingsForm(IDENTITY_SETTINGS_FIELDS);
  const clearLogo = useMutation(api.settings.clearLogo);
  const generateUploadUrl = useMutation(api.settings.generateUploadUrl);

  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>, mode: "light" | "dark") => {
    const file = event.target.files?.[0];
    if (!file) return;
    const validation = validateUploadFile(file, "adminImage");
    if (!validation.allowed) return;

    if (mode === "light") setUploadingLight(true);
    if (mode === "dark") setUploadingDark(true);

    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();

      // Saved on the spot rather than waiting for the save button: the tile
      // shows the uploaded logo immediately, and a logo shown but unsaved is
      // the one state that reads as a bug.
      if (mode === "light") {
        await updateSettings({ logoUrlLight: storageId });
        setFormData((current) => ({ ...current, logoUrlLight: storageId }));
      } else {
        await updateSettings({ logoUrlDark: storageId });
        setFormData((current) => ({ ...current, logoUrlDark: storageId }));
      }
    } catch (error) {
      console.error("Upload failed", error);
    } finally {
      if (mode === "light") setUploadingLight(false);
      if (mode === "dark") setUploadingDark(false);
    }
  };

  const handleRemoveLogo = async (mode: "light" | "dark") => {
    if (mode === "light") setUploadingLight(true);
    if (mode === "dark") setUploadingDark(true);

    try {
      await clearLogo({ mode });
      setFormData((current) => ({
        ...current,
        ...(mode === "light" ? { logoUrlLight: undefined } : { logoUrlDark: undefined }),
      }));
    } catch (error) {
      console.error("Logo removal failed", error);
    } finally {
      if (mode === "light") setUploadingLight(false);
      if (mode === "dark") setUploadingDark(false);
    }
  };

  return (
    <SettingsScreen
      isLoading={isLoading}
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
