import Image from "next/image";
import { AppWindow, Bell, Loader2, UploadCloud, Volume2, X } from "lucide-react";
import type { LogoUploadHandler } from "./types";
import { WidgetPanel } from "./WidgetPanel";

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
  return (
    <WidgetPanel
      title="Appearance"
      description="Customize widget appearance that will be shown to the user."
    >
      <div className="grid grid-cols-1 gap-6">
        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-secondary">Public Name</label>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors"
            placeholder="e.g. Sales Assistant"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-secondary">Primary Widget Color</label>
          <div className="flex items-center gap-2 bg-background border border-border-dim rounded-[10px] px-2 py-1.5 focus-within:border-brand transition-colors">
            <input
              type="text"
              value={themePrimaryColor}
              onChange={(event) => setThemePrimaryColor(event.target.value)}
              className="flex-1 bg-transparent border-none outline-none font-mono text-[14px] tracking-wider text-foreground placeholder:text-muted/60"
            />
            <input
              type="color"
              value={activeColor}
              onChange={(event) => setThemePrimaryColor(event.target.value)}
              className="w-10 h-8 rounded shrink-0 cursor-pointer border-none bg-transparent"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-secondary">Custom Source Logo</label>
          {themeLogoUrl ? (
            <div className="flex items-center gap-4 bg-background border border-border-dim rounded-[10px] p-3">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-border-dim/50 flex-shrink-0 bg-sidebar/50">
                {logoPreviewUrl ? (
                  <Image
                    src={logoPreviewUrl}
                    alt="Widget Logo"
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
                  {themeLogoUrl.startsWith("blob:") ? "Uploading..." : "Custom Logo Set"}
                </span>
              </div>
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
                {isUploadingLogo ? "Uploading..." : "Click to upload an image"}
              </span>
              <span className="text-[11px] text-secondary mt-1">
                PNG, JPG, SVG up to 2MB. Recommended 256x256.
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-semibold text-secondary">Input Placeholder Text</label>
          <input
            type="text"
            value={themePlaceholder}
            onChange={(event) => setThemePlaceholder(event.target.value)}
            className="w-full bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors"
            placeholder="Write a reply..."
          />
        </div>

        <div className="flex flex-col gap-4 mt-2">
          <label className="flex items-center justify-between p-4 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-brand" />
              <span className="text-[13px] font-semibold tracking-wide text-foreground">
                Enable sound notifications
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
                Show pop-up message preview
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
