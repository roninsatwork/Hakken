"use client";

import { useTranslations } from "next-intl";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { SettingBlock } from "../../_components/SettingBlock";
import { SettingsScreen } from "../../_components/SettingsScreen";
import { DIAGNOSTICS_SETTINGS_FIELDS, useSystemSettingsForm } from "../../_components/useSystemSettingsForm";

export default function DeveloperDiagnosticsPage() {
  const t = useTranslations("admin.settings");
  const { formData, setFormData, isLoading, isSaving, saveSuccess, save } = useSystemSettingsForm(DIAGNOSTICS_SETTINGS_FIELDS);

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
      {/* The heading and its sentence come from the block; the row inside
          repeated both, word for word, wrapped in a third box. One row, said
          once, with the switch labelled so it reads as on or off. */}
      <SettingBlock title={t("options.routingMatrix")} sub={t("options.routingMatrixSub")}>
        {/* Stays raw: a full-width aria-pressed toggle card — matches no variant. */}
        <button
          type="button"
          aria-pressed={formData.diagnosticRoutingEnabled ?? false}
          onClick={() =>
            setFormData({ ...formData, diagnosticRoutingEnabled: !formData.diagnosticRoutingEnabled })
          }
          className="flex items-center justify-between gap-4 w-full rounded-[16px] border border-border-dim bg-background/50 p-5 text-left transition-colors hover:bg-hover/40"
        >
          <span className={`text-[14px] font-semibold ${formData.diagnosticRoutingEnabled ? "text-foreground" : "text-muted"}`}>
            {formData.diagnosticRoutingEnabled ? t("options.routingMatrixOn") : t("options.routingMatrixOff")}
          </span>
          <span className={`flex-shrink-0 transition-colors ${formData.diagnosticRoutingEnabled ? "text-brand" : "text-muted"}`}>
            {formData.diagnosticRoutingEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
          </span>
        </button>
      </SettingBlock>
    </SettingsScreen>
  );
}
