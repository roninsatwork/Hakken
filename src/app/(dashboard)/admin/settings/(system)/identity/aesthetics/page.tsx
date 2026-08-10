"use client";

import { useTranslations } from "next-intl";
import { AppearanceSettingsSection } from "../../../_components/AppearanceSettingsSection";
import { SettingsScreen } from "../../../_components/SettingsScreen";
import { AESTHETICS_SETTINGS_FIELDS, useSystemSettingsForm } from "../../../_components/useSystemSettingsForm";

export default function GlobalAestheticsPage() {
  const t = useTranslations("admin.settings");
  const { formData, setFormData, isLoading, isSaving, saveSuccess, save } = useSystemSettingsForm(AESTHETICS_SETTINGS_FIELDS);

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
      <AppearanceSettingsSection formData={formData} setFormData={setFormData} t={t} />
    </SettingsScreen>
  );
}
