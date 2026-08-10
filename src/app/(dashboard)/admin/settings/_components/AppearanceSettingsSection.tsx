import { Moon, Palette, Sun } from "lucide-react";
import { ColorInput, SettingBlock } from "./SettingBlock";
import type { SystemSettingsFormData } from "./types";

type AppearanceSettingsSectionProps = {
  formData: SystemSettingsFormData;
  setFormData: (formData: SystemSettingsFormData) => void;
  t: (key: string) => string;
};

/**
 * One row per themed colour: the field suffix (prefixed dark/light), its
 * label and usage-description keys, the shipped default per theme (also the
 * reset target), and whether the value may carry transparency.
 *
 * Descriptions exist because this screen used to promise "the entire
 * platform" while three rows changed nothing at all; every row now says in
 * one sentence where it is actually used. Keep them true — the theme
 * compliance plan records what each token reaches.
 */
type ColorRow = {
  suffix: "Bg" | "CardBg" | "SidebarBg" | "Fg" | "CardFg" | "MutedFg" | "Muted" | "Border"
    | "Success" | "Destructive" | "Warning" | "Info" | "Ring";
  labelKey: string;
  subKey: string;
  darkDefault: string;
  lightDefault: string;
  alpha?: boolean;
};

const CORE_ROWS: ColorRow[] = [
  { suffix: "Bg", labelKey: "bgBase", subKey: "bgBaseSub", darkDefault: "#222224", lightDefault: "#FCFCFC" },
  { suffix: "CardBg", labelKey: "cardSurfaces", subKey: "cardSurfacesSub", darkDefault: "#2C2C2E", lightDefault: "#FFFFFF" },
  { suffix: "SidebarBg", labelKey: "sidebar", subKey: "sidebarSub", darkDefault: "#18181A", lightDefault: "#FFFFFF" },
  { suffix: "Fg", labelKey: "primaryText", subKey: "primaryTextSub", darkDefault: "#FFFFFF", lightDefault: "#111111" },
  { suffix: "CardFg", labelKey: "secondaryText", subKey: "secondaryTextSub", darkDefault: "#A1A1A6", lightDefault: "#666666" },
  { suffix: "MutedFg", labelKey: "mutedText", subKey: "mutedTextSub", darkDefault: "#737373", lightDefault: "#999999" },
  { suffix: "Muted", labelKey: "hoverBlocks", subKey: "hoverBlocksSub", darkDefault: "#3A3A3C", lightDefault: "#F2F2F2", alpha: true },
  { suffix: "Border", labelKey: "borders", subKey: "bordersSub", darkDefault: "#3A3A3C", lightDefault: "#E5E5E5", alpha: true },
];

const SEMANTIC_ROWS: ColorRow[] = [
  { suffix: "Success", labelKey: "success", subKey: "successSub", darkDefault: "#10B981", lightDefault: "#10B981" },
  { suffix: "Destructive", labelKey: "destructive", subKey: "destructiveSub", darkDefault: "#EF4444", lightDefault: "#EF4444" },
  { suffix: "Warning", labelKey: "warning", subKey: "warningSub", darkDefault: "#F59E0B", lightDefault: "#F59E0B" },
  { suffix: "Info", labelKey: "info", subKey: "infoSub", darkDefault: "#38BDF8", lightDefault: "#38BDF8" },
  { suffix: "Ring", labelKey: "focusRing", subKey: "focusRingSub", darkDefault: "#FF5A1F", lightDefault: "#FF5A1F" },
];

export function AppearanceSettingsSection({ formData, setFormData, t }: AppearanceSettingsSectionProps) {
  const renderRows = (rows: ColorRow[], mode: "dark" | "light") =>
    rows.map((row) => {
      const field = `${mode}${row.suffix}` as keyof SystemSettingsFormData & string;
      return (
        <ColorInput
          key={field}
          label={t(`appearance.${row.labelKey}`)}
          sub={t(`appearance.${row.subKey}`)}
          value={(formData[field] as string | undefined) || ""}
          onChange={(value) => setFormData({ ...formData, [field]: value })}
          defaultValue={mode === "dark" ? row.darkDefault : row.lightDefault}
          alpha={row.alpha}
          resetLabel={t("appearance.reset")}
        />
      );
    });

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-1 ml-2">
        <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase flex items-center gap-2">
          <Palette className="w-3.5 h-3.5" /> {t("appearance.title")}
        </h3>
        {/* Honest scope: this screen used to claim "the entire platform". */}
        <p className="text-[12px] text-secondary">{t("appearance.scope")}</p>
      </div>

      <SettingBlock title={t("appearance.typography")} sub={t("appearance.typographySub")}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Values are named keys, resolved to concrete font stacks in
              src/lib/themeFonts.ts. The old options submitted raw CSS —
              including `var(--font-sans)`, whose write created a variable
              cycle that broke the app's font entirely — and offered two
              fonts (Playfair, Outfit) the app never loads. */}
          <div className="flex flex-col gap-2 relative">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("appearance.headingFont")}</span>
            <select
              value={formData.headingFontFamily || "default"}
              onChange={(event) => setFormData({ ...formData, headingFontFamily: event.target.value })}
              className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
            >
              <option value="default">{t("appearance.fonts.inter")}</option>
              <option value="mono">{t("appearance.fonts.jetbrains")}</option>
            </select>
            <span className="text-[11px] text-muted ml-1">{t("appearance.headingFontSub")}</span>
          </div>

          <div className="flex flex-col gap-2 relative">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t("appearance.bodyFont")}</span>
            <select
              value={formData.bodyFontFamily || "default"}
              onChange={(event) => setFormData({ ...formData, bodyFontFamily: event.target.value })}
              className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
            >
              <option value="default">{t("appearance.fonts.inter")}</option>
              <option value="mono">{t("appearance.fonts.jetbrains")}</option>
            </select>
            <span className="text-[11px] text-muted ml-1">{t("appearance.bodyFontSub")}</span>
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
            <span className="text-[11px] text-muted ml-1">{t("appearance.headingSizeSub")}</span>
          </div>
          {/* "Small Text Size" was removed 2026-08-10: it targeted a CSS
              class (`header-subtitle`) that no component ever rendered, so
              the control changed nothing anywhere. */}
        </div>
      </SettingBlock>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SettingBlock title={t("appearance.darkMatrix")} sub={t("appearance.darkMatrixSub")}>
          <div className="absolute top-6 right-6 p-2 bg-background/50 rounded-full border border-border-dim"><Moon className="w-4 h-4 text-foreground" /></div>

          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-2">{t("appearance.coreEnv")}</span>
            {renderRows(CORE_ROWS, "dark")}

            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-4">{t("appearance.semanticOps")}</span>
            <span className="text-[11px] text-muted ml-2 -mt-1 mb-1">{t("appearance.semanticOpsSub")}</span>
            {renderRows(SEMANTIC_ROWS, "dark")}
          </div>
        </SettingBlock>

        <SettingBlock title={t("appearance.lightMatrix")} sub={t("appearance.lightMatrixSub")}>
          <div className="absolute top-6 right-6 p-2 bg-background/50 rounded-full border border-border-dim"><Sun className="w-4 h-4 text-foreground" /></div>

          <div className="flex flex-col gap-2 mt-2">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-2">{t("appearance.coreEnv")}</span>
            {renderRows(CORE_ROWS, "light")}

            <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-4">{t("appearance.semanticOps")}</span>
            <span className="text-[11px] text-muted ml-2 -mt-1 mb-1">{t("appearance.semanticOpsSub")}</span>
            {renderRows(SEMANTIC_ROWS, "light")}
          </div>
        </SettingBlock>
      </div>

      <SettingBlock title={t("appearance.brandOrigin")} sub={t("appearance.brandOriginSub")}>
        <div className="flex flex-col gap-2">
          <ColorInput
            label={t("appearance.brandColor")}
            sub={t("appearance.brandColorSub")}
            value={formData.brandColorHex || ""}
            onChange={(value) => setFormData({ ...formData, brandColorHex: value })}
            defaultValue="#E26D28"
            resetLabel={t("appearance.reset")}
          />
        </div>
      </SettingBlock>
    </section>
  );
}
