import Image from "next/image";
import type { ChangeEvent } from "react";
import { Building2, ImageIcon, Loader2, X } from "lucide-react";
import { SettingBlock } from "./SettingBlock";
import { Field } from "@/src/ui/components/screens/Field";
import type { SystemSettingsFormData } from "./types";

type IdentitySettingsSectionProps = {
  formData: SystemSettingsFormData;
  setFormData: (formData: SystemSettingsFormData) => void;
  uploadingLight: boolean;
  uploadingDark: boolean;
  onFileUpload: (event: ChangeEvent<HTMLInputElement>, mode: "light" | "dark") => void;
  onRemoveLogo: (mode: "light" | "dark") => void;
  t: (key: string) => string;
};

export function IdentitySettingsSection({
  formData,
  setFormData,
  uploadingLight,
  uploadingDark,
  onFileUpload,
  onRemoveLogo,
  t,
}: IdentitySettingsSectionProps) {
  return (
    <section className="flex flex-col gap-6">
      <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
        <Building2 className="w-3.5 h-3.5" /> {t("identity.title")}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <SettingBlock title={t("identity.platformName")} sub={t("identity.platformNameSub")}>
          {/* The card's own title names this box, so the label is kept for
              anyone listening rather than printed twice. */}
          <Field
            label={t("identity.platformName")}
            labelHidden
            value={formData.platformName || ""}
            onChange={(event) => setFormData({ ...formData, platformName: event.target.value })}
            placeholder={t("identity.placeholder")}
            className="text-[15px] font-bold"
          />
        </SettingBlock>

        <SettingBlock title={t("identity.logoLight")} sub={t("identity.logoLightSub")}>
          <div className="w-full h-[120px] rounded-[16px] border-2 border-dashed border-border-dim/50 flex items-center justify-center relative overflow-hidden bg-white hover:bg-white/90 transition-colors group">
            {formData.logoUrlLight ? (
              <Image
                src={formData.logoUrlLight}
                width={180}
                height={80}
                unoptimized
                className="max-w-[80%] max-h-[80%] object-contain mix-blend-multiply"
                alt="Light mode"
              />
            ) : (
              <ImageIcon className="w-8 h-8 text-black/20" />
            )}
            <input type="file" onChange={(event) => onFileUpload(event, "light")} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
            {/* Sits above the file input, which covers the whole tile: without a
                higher layer the click to remove would open the file picker. */}
            {formData.logoUrlLight ? (
              <button
                type="button"
                onClick={() => onRemoveLogo("light")}
                aria-label={t("identity.removeLogoLight")}
                title={t("identity.removeLogoLight")}
                className="absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-[8px] bg-black/70 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-black"
              >
                <X className="w-3.5 h-3.5" />
                {t("identity.removeLogo")}
              </button>
            ) : null}
            {uploadingLight && <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-30"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>}
          </div>
        </SettingBlock>

        <SettingBlock title={t("identity.logoDark")} sub={t("identity.logoDarkSub")}>
          <div className="w-full h-[120px] rounded-[16px] border-2 border-dashed border-border-dim/50 flex items-center justify-center relative overflow-hidden bg-black hover:bg-black/90 transition-colors group">
            {formData.logoUrlDark ? (
              <Image
                src={formData.logoUrlDark}
                width={180}
                height={80}
                unoptimized
                className="max-w-[80%] max-h-[80%] object-contain"
                alt="Dark mode"
              />
            ) : (
              <ImageIcon className="w-8 h-8 text-white/20" />
            )}
            <input type="file" onChange={(event) => onFileUpload(event, "dark")} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
            {formData.logoUrlDark ? (
              <button
                type="button"
                onClick={() => onRemoveLogo("dark")}
                aria-label={t("identity.removeLogoDark")}
                title={t("identity.removeLogoDark")}
                className="absolute top-2 right-2 z-20 flex items-center gap-1.5 rounded-[8px] bg-white/85 px-2.5 py-1.5 text-[11px] font-medium text-black transition-colors hover:bg-white"
              >
                <X className="w-3.5 h-3.5" />
                {t("identity.removeLogo")}
              </button>
            ) : null}
            {uploadingDark && <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-30"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>}
          </div>
        </SettingBlock>
      </div>

      <SettingBlock title={t("identity.emailSender")} sub={t("identity.emailSenderSub")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field
            label={t("identity.emailSenderName")}
            value={formData.emailSenderName || ""}
            onChange={(event) => setFormData({ ...formData, emailSenderName: event.target.value })}
            placeholder={t("identity.emailSenderNamePlaceholder")}
          />
          <Field
            label={t("identity.emailSenderAddress")}
            type="email"
            value={formData.emailSenderAddress || ""}
            onChange={(event) => setFormData({ ...formData, emailSenderAddress: event.target.value })}
            placeholder={t("identity.emailSenderAddressPlaceholder")}
          />
        </div>
      </SettingBlock>
    </section>
  );
}
