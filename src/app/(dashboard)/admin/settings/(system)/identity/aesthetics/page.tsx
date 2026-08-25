"use client";

import { lazy, Suspense } from "react";
import { useTranslations } from "next-intl";
import { SettingsScreen } from "../../../_components/SettingsScreen";
import { AESTHETICS_SETTINGS_FIELDS, useSystemSettingsForm } from "../../../_components/useSystemSettingsForm";

const AppearanceSettingsSection = lazy(() =>
  import("../../../_components/AppearanceSettingsSection").then((module) => ({
    default: module.AppearanceSettingsSection,
  })),
);

export default function GlobalAestheticsPage() {
  const t = useTranslations("admin.settings");
  const { formData, setFormData, isLoading, isSaving, saveSuccess, save } = useSystemSettingsForm(AESTHETICS_SETTINGS_FIELDS);

  return (
    <Suspense fallback={<SettingsScreen isLoading>{null}</SettingsScreen>}>
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
    </Suspense>
  );
}
