"use client";

import { useMutation } from "convex/react";
import { SlidersHorizontal } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Select } from "@/src/ui/components/screens/Select";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";

type Theme = "light" | "dark" | "system";
type Setting = "theme" | "language";

const SETTINGS: { key: Setting }[] = [{ key: "theme" }, { key: "language" }];
const THEMES: Theme[] = ["light", "dark", "system"];
const LANGUAGES = ["en", "it"] as const;

/**
 * The profile's Preferences tab (Anthony, 2026-10-08; board ProfilePreferences
 * in docs/plans/assets/outbox-and-preferences/): the two settings as a table,
 * like the Communication preferences and Integrations tabs beside it. No
 * search box or page footer: two rows. A choice applies at once; a new
 * language reloads the page in it.
 */
export function PreferencesTab() {
  const t = useTranslations("user.preferences");
  const { platformName } = useSystemSettings();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const recordLanguage = useMutation(api.readerPreferences.recordMyLanguage);
  const action = useAdminAction({ scope: "profile-preferences" });

  const changeLanguage = async (language: string) => {
    // Kept on the user as well as the browser: their Weekly News Digest is written in it.
    await action.run(() => recordLanguage({ language }), { fallbackMessage: t("failed"), suppressErrorToast: true });
    document.cookie = `locale=${language}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h4 className="text-[13px] font-medium text-foreground tracking-wide flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-brand" />
          {t("title", { platformName })}
        </h4>
        <p className="text-[11px] text-secondary mt-0.5">{t("description", { platformName })}</p>
      </div>
      <DataTable
        rows={SETTINGS}
        rowKey={(row) => row.key}
        empty={{ icon: <SlidersHorizontal className="h-8 w-8 text-muted/30" />, label: "" }}
        columns={[
          { key: "name", header: t("columns.setting"), className: "w-[240px]", cell: (row) => <span className="text-[13px] font-medium text-foreground">{t(`${row.key}.name`)}</span> },
          { key: "what", header: t("columns.what"), cell: (row) => <span className="text-[12px] text-secondary">{t(`${row.key}.what`, { platformName })}</span> },
          {
            key: "choice",
            header: t("columns.choice"),
            align: "right",
            className: "w-[340px] whitespace-nowrap",
            cell: (row) => (row.key === "theme"
              ? (
                <SegmentedChoice
                  label={t("theme.name")}
                  value={(theme as Theme | undefined) ?? "system"}
                  options={THEMES.map((value) => ({ value, label: t(`theme.${value}`) }))}
                  onChange={setTheme}
                  size="compact"
                />
              )
              : (
                <Select aria-label={t("language.name")} value={locale} onChange={(language) => void changeLanguage(language)} className="w-[200px]">
                  {LANGUAGES.map((language) => <option key={language} value={language}>{t(`language.${language}`)}</option>)}
                </Select>
              )),
          },
        ]}
      />
    </div>
  );
}
