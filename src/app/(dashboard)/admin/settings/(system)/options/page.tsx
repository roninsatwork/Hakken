"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import {
  DIAGNOSTICS_SETTINGS_FIELDS,
  useSystemSettingsForm,
} from "../../_components/useSystemSettingsForm";

const DeveloperDiagnosticsContent = dynamic(
  () =>
    import("./DeveloperDiagnosticsContent").then(
      (module) => module.DeveloperDiagnosticsContent,
    ),
  { loading: SettingsLoading },
);

function SettingsLoading() {
  return (
    <div className="w-full h-[50vh] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
    </div>
  );
}

/**
 * The developer switches, which today is one of them.
 *
 * A standard table since 2026-08-23, alongside the two other settings screens
 * that had grown their own switch-card shape. One row is a short table, and the
 * search box and pager over it are doing nothing today — they are here for the
 * same reason the Features screen keeps its own: a screen that drops them
 * because its list is short is how a section stops matching itself, and the
 * second developer switch would otherwise arrive on a screen with no way to
 * find anything.
 *
 * The page's heading is the screen's, not the row's. The old card repeated the
 * row's name and its sentence word for word, one wrapped inside the other.
 */
export default function DeveloperDiagnosticsPage() {
  const { formData, setFormData, isLoading, isSaving, saveSuccess, save } =
    useSystemSettingsForm(DIAGNOSTICS_SETTINGS_FIELDS);

  if (isLoading) return <SettingsLoading />;

  return (
    <DeveloperDiagnosticsContent
      formData={formData}
      setFormData={setFormData}
      isSaving={isSaving}
      saveSuccess={saveSuccess}
      save={save}
    />
  );
}
