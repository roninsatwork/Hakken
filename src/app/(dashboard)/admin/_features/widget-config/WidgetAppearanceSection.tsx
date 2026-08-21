import Image from "next/image";
import { AppWindow, Bell, Loader2, UploadCloud, Volume2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { LogoUploadHandler } from "./types";
import { WidgetPanel } from "./WidgetPanel";
import { Field } from "@/src/ui/components/screens/Field";

type WidgetAppearanceSectionProps = {
  activeColor: string;
  enableSounds: boolean;
  isUploadingLogo: boolean;
  logoPreviewUrl: string | null;
  name: string;
  onLogoUpload: LogoUploadHandler;
  setEnableSounds: (value: boolean) => void;
  setName: (value: string) => void;
  setShowPopupPreview: (value: boolean) => void;
  setThemeLogoUrl: (value: string) => void;
  setThemePlaceholder: (value: string) => void;
  setThemePrimaryColor: (value: string) => void;
  showPopupPreview: boolean;
  themeLogoUrl: string;
  themePlaceholder: string;
  themePrimaryColor: string;
};

export function WidgetAppearanceSection({
  activeColor,
  enableSounds,
  isUploadingLogo,
  logoPreviewUrl,
  name,
  onLogoUpload,
  setEnableSounds,
  setName,
  setShowPopupPreview,
  setThemeLogoUrl,
  setThemePlaceholder,
  setThemePrimaryColor,
  showPopupPreview,
  themeLogoUrl,
  themePlaceholder,
  themePrimaryColor,
}: WidgetAppearanceSectionProps) {
  const t = useTranslations("ai.widget.appearance");
  return (
    <WidgetPanel
      title={t("title")}
      description={t("description")}
    >
      <div className="grid grid-cols-1 gap-6">
        <Field
          label={t("nameLabel")}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t("namePlaceholder")}
        />

        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Field
              label={t("colourLabel")}
              value={themePrimaryColor}
              onChange={(event) => setThemePrimaryColor(event.target.value)}
              className="font-mono tracking-wider"
            />
          </div>
          <input
            type="color"
            aria-label={t("colourPickerLabel")}
            value={activeColor}
            onChange={(event) => setThemePrimaryColor(event.target.value)}
            className="h-[46px] w-14 shrink-0 cursor-pointer rounded-[12px] border border-border-dim bg-transparent"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="mt-1 text-[12px] font-medium text-secondary">{t("logoLabel")}</label>
          {themeLogoUrl ? (
            <div className="flex items-center gap-4 bg-background border border-border-dim rounded-[10px] p-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-border-dim/50 flex-shrink-0 bg-sidebar/50">
                {logoPreviewUrl ? (
                  <Image
                    src={logoPreviewUrl}
                    alt={t("logoAlt")}
                    width={48}
                    height={48}
                    unoptimized
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <AppWindow className="w-full h-full p-3 text-secondary" />
                )}
              </div>
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <span className="text-[13px] text-foreground font-medium truncate">
                  {themeLogoUrl.startsWith("blob:") ? t("uploading") : t("customLogoSet")}
                </span>
              </div>
              {/* Raw: icon-shaped but with a destructive hover tone the icon variant does not offer. */}
              <button
                onClick={() => setThemeLogoUrl("")}
                disabled={isUploadingLogo}
                className="p-2 text-secondary hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors flex-shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="relative group rounded-[10px] border border-border-dim border-dashed bg-background hover:border-brand/40 hover:bg-foreground/[0.02] transition-colors p-4 flex flex-col items-center justify-center text-center cursor-pointer overflow-hidden">
              <input
                type="file"
                accept="image/*"
                onChange={onLogoUpload}
                disabled={isUploadingLogo}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
              />
              {isUploadingLogo ? (
                <Loader2 className="w-6 h-6 text-brand animate-spin mb-2" />
              ) : (
                <UploadCloud className="w-6 h-6 text-brand mb-2 group-hover:scale-110 transition-transform" />
              )}
              <span className="text-[13px] font-medium text-foreground tracking-wide">
                {isUploadingLogo ? t("uploading") : t("clickToUpload")}
              </span>
              <span className="text-[11px] text-secondary mt-1">
                {t("logoHint")}
              </span>
            </div>
          )}
        </div>

        <Field
          label={t("placeholderLabel")}
          value={themePlaceholder}
          onChange={(event) => setThemePlaceholder(event.target.value)}
          placeholder={t("placeholderPlaceholder")}
        />

        <div className="flex flex-col gap-4 mt-2">
          <label className="flex items-center justify-between p-4 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-brand" />
              <span className="text-[13px] font-semibold tracking-wide text-foreground">
                {t("sounds")}
              </span>
            </div>
            <input
              type="checkbox"
              checked={enableSounds}
              onChange={(event) => setEnableSounds(event.target.checked)}
              className="rounded border-border-dim text-brand focus:ring-brand form-checkbox bg-transparent w-4 h-4"
            />
          </label>
          <label className="flex items-center justify-between p-4 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-brand" />
              <span className="text-[13px] font-semibold tracking-wide text-foreground">
                {t("popupPreview")}
              </span>
            </div>
            <input
              type="checkbox"
              checked={showPopupPreview}
              onChange={(event) => setShowPopupPreview(event.target.checked)}
              className="rounded border-border-dim text-brand focus:ring-brand form-checkbox bg-transparent w-4 h-4"
            />
          </label>
        </div>
      </div>
    </WidgetPanel>
  );
}
