"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { SaveAction } from "@/src/ui/components/screens/SaveControls";

type SettingsScreenProps = {
  children: ReactNode;
  isLoading?: boolean;
  /** Omit on read-only screens; the save row then does not render at all. */
  save?: {
    onSave: () => void;
    isSaving: boolean;
    saveSuccess: boolean;
    label: string;
    savingLabel: string;
    successLabel: string;
  };
};

/**
 * One settings screen: its content, and its own save.
 *
 * Each screen saves only itself. The single header button this replaced wrote
 * the whole settings document whatever tab you were on, so changing a colour
 * and pressing Save could also commit a half-edited platform name from a tab
 * you had left.
 */
export function SettingsScreen({ children, isLoading = false, save }: SettingsScreenProps) {
  if (isLoading) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-6 w-full pb-20">
      {children}
      {save ? (
        <div className="flex justify-end">
          <SaveAction
            onClick={save.onSave}
            isSaving={save.isSaving}
            showSuccess={save.saveSuccess}
            label={save.label}
            savingLabel={save.savingLabel}
            successLabel={save.successLabel}
          />
        </div>
      ) : null}
    </section>
  );
}
