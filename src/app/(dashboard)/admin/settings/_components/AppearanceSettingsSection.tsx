import { Moon, Palette, Sun } from "lucide-react";
import { ColorInput, SettingBlock } from "./SettingBlock";
import type { SystemSettingsFormData } from "./types";

type AppearanceSettingsSectionProps = {
  formData: SystemSettingsFormData;
  setFormData: (formData: SystemSettingsFormData) => void;
  t: (key: string) => string;
};

export function AppearanceSettingsSection({ formData, setFormData, t }: AppearanceSettingsSectionProps) {
  return (
    <section className="flex flex-col gap-6">
      <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
        <Palette className="w-3.5 h-3.5" /> {t("appearance.title")}
      </h3>

      <SettingBlock title={t("appearance.typography")} sub={t("appearance.typographySub")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-2 relative">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("appearance.headingFont")}</span>
            <select
              value={formData.headingFontFamily || "var(--font-sans)"}
              onChange={(event) => setFormData({ ...formData, headingFontFamily: event.target.value })}
              className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
            >
              <option value="var(--font-sans)">{t("appearance.fonts.inter")}</option>
              <option value="var(--font-mono)">{t("appearance.fonts.jetbrains")}</option>
              <option value="'Playfair Display', serif">{t("appearance.fonts.playfair")}</option>
              <option value="'Outfit', sans-serif">{t("appearance.fonts.outfit")}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 relative">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("appearance.bodyFont")}</span>
            <select
              value={formData.bodyFontFamily || "var(--font-sans)"}
              onChange={(event) => setFormData({ ...formData, bodyFontFamily: event.target.value })}
              className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
            >
              <option value="var(--font-sans)">{t("appearance.fonts.inter")}</option>
              <option value="var(--font-mono)">{t("appearance.fonts.jetbrains")}</option>
              <option value="'Playfair Display', serif">{t("appearance.fonts.playfair")}</option>
              <option value="'Outfit', sans-serif">{t("appearance.fonts.outfit")}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 relative">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("appearance.headingSize")}</span>
            <select
              value={formData.headingSizeGlobal || "1.5rem"}
              onChange={(event) => setFormData({ ...formData, headingSizeGlobal: event.target.value })}
              className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer font-mono"
            >
              <option value="1.25rem">{t("appearance.sizes.tighter")}</option>
              <option value="1.5rem">{t("appearance.sizes.standard")}</option>
              <option value="1.875rem">{t("appearance.sizes.punchy")}</option>
              <option value="2.25rem">{t("appearance.sizes.editorial")}</option>
            </select>
          </div>

          <div className="flex flex-col gap-2 relative">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("appearance.subTextSize")}</span>
            <select
              value={formData.subTextSizeGlobal || "13px"}
              onChange={(event) => setFormData({ ...formData, subTextSizeGlobal: event.target.value })}
              className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer font-mono"
            >
              <option value="12px">{t("appearance.sizes.micro")}</option>
              <option value="13px">{t("appearance.sizes.standard")}</option>
              <option value="14px">{t("appearance.sizes.readable")}</option>
            </select>
          </div>
        </div>
      </SettingBlock>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingBlock title={t("appearance.darkMatrix")} sub={t("appearance.darkMatrixSub")}>
          <div className="absolute top-6 right-6 p-2 bg-background/50 rounded-full border border-border-dim"><Moon className="w-4 h-4 text-foreground" /></div>

          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-2">{t("appearance.coreEnv")}</span>
            <ColorInput label={t("appearance.bgBase")} value={formData.darkBg || ""} onChange={(value) => setFormData({ ...formData, darkBg: value })} />
            <ColorInput label={t("appearance.cardSurfaces")} value={formData.darkCardBg || ""} onChange={(value) => setFormData({ ...formData, darkCardBg: value })} />
            <ColorInput label={t("appearance.primaryText")} value={formData.darkFg || ""} onChange={(value) => setFormData({ ...formData, darkFg: value })} />
            <ColorInput label={t("appearance.secondaryText")} value={formData.darkCardFg || ""} onChange={(value) => setFormData({ ...formData, darkCardFg: value })} />
            <ColorInput label={t("appearance.hoverBlocks")} value={formData.darkMuted || ""} onChange={(value) => setFormData({ ...formData, darkMuted: value })} />
            <ColorInput label={t("appearance.borders")} value={formData.darkBorder || ""} onChange={(value) => setFormData({ ...formData, darkBorder: value })} />

            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-4">{t("appearance.semanticOps")}</span>
            <ColorInput label={t("appearance.success")} value={formData.darkSuccess || ""} onChange={(value) => setFormData({ ...formData, darkSuccess: value })} />
            <ColorInput label={t("appearance.destructive")} value={formData.darkDestructive || ""} onChange={(value) => setFormData({ ...formData, darkDestructive: value })} />
            <ColorInput label={t("appearance.focusRing")} value={formData.darkRing || ""} onChange={(value) => setFormData({ ...formData, darkRing: value })} />
          </div>
        </SettingBlock>

        <SettingBlock title={t("appearance.lightMatrix")} sub={t("appearance.lightMatrixSub")}>
          <div className="absolute top-6 right-6 p-2 bg-background/50 rounded-full border border-border-dim"><Sun className="w-4 h-4 text-foreground" /></div>

          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-2">{t("appearance.coreEnv")}</span>
            <ColorInput label={t("appearance.bgBase")} value={formData.lightBg || ""} onChange={(value) => setFormData({ ...formData, lightBg: value })} />
            <ColorInput label={t("appearance.cardSurfaces")} value={formData.lightCardBg || ""} onChange={(value) => setFormData({ ...formData, lightCardBg: value })} />
            <ColorInput label={t("appearance.primaryText")} value={formData.lightFg || ""} onChange={(value) => setFormData({ ...formData, lightFg: value })} />
            <ColorInput label={t("appearance.secondaryText")} value={formData.lightCardFg || ""} onChange={(value) => setFormData({ ...formData, lightCardFg: value })} />
            <ColorInput label={t("appearance.hoverBlocks")} value={formData.lightMuted || ""} onChange={(value) => setFormData({ ...formData, lightMuted: value })} />
            <ColorInput label={t("appearance.borders")} value={formData.lightBorder || ""} onChange={(value) => setFormData({ ...formData, lightBorder: value })} />

            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-4">{t("appearance.semanticOps")}</span>
            <ColorInput label={t("appearance.success")} value={formData.lightSuccess || ""} onChange={(value) => setFormData({ ...formData, lightSuccess: value })} />
            <ColorInput label={t("appearance.destructive")} value={formData.lightDestructive || ""} onChange={(value) => setFormData({ ...formData, lightDestructive: value })} />
            <ColorInput label={t("appearance.focusRing")} value={formData.lightRing || ""} onChange={(value) => setFormData({ ...formData, lightRing: value })} />
          </div>
        </SettingBlock>
      </div>

      <SettingBlock title={t("appearance.brandOrigin")} sub={t("appearance.brandOriginSub")}>
        <div className="flex flex-col gap-2">
          <ColorInput label={t("appearance.brandColor")} value={formData.brandColorHex || ""} onChange={(value) => setFormData({ ...formData, brandColorHex: value })} />
        </div>
      </SettingBlock>
    </section>
  );
}
