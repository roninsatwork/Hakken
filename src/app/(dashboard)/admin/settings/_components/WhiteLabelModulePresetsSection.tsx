"use client";

import Link from "next/link";
import { Boxes, ExternalLink } from "lucide-react";

type TranslationFn = (key: string) => string;

type PresetKey = "knowledgeAssistant" | "supportWidget" | "operatorWorkspace";

type WhiteLabelModulePresetsSectionProps = {
  t: TranslationFn;
};

const presetKeys: PresetKey[] = ["knowledgeAssistant", "supportWidget", "operatorWorkspace"];

const presetLinks: Record<PresetKey, { href: string; labelKey: string }> = {
  knowledgeAssistant: { href: "/admin/app-kits", labelKey: "modulePresets.links.launch" },
  supportWidget: { href: "/admin/ai/widget", labelKey: "modulePresets.links.widget" },
  operatorWorkspace: { href: "/admin/settings/system-health", labelKey: "modulePresets.links.health" },
};

const itemIndexes = [0, 1, 2] as const;

export function WhiteLabelModulePresetsSection({ t }: WhiteLabelModulePresetsSectionProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {presetKeys.map((presetKey) => {
        const link = presetLinks[presetKey];
        return (
          <div key={presetKey} className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-[10px] bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
                  <Boxes className="w-4 h-4 text-brand" />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <h4 className="text-[14px] font-semibold text-foreground">{t(`modulePresets.presets.${presetKey}.title`)}</h4>
                  <p className="text-[12px] text-muted leading-relaxed">{t(`modulePresets.presets.${presetKey}.summary`)}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <PresetList
                title={t("modulePresets.sections.visible")}
                items={itemIndexes.map((index) => t(`modulePresets.presets.${presetKey}.visible.${index}`))}
              />
              <PresetList
                title={t("modulePresets.sections.owner")}
                items={itemIndexes.map((index) => t(`modulePresets.presets.${presetKey}.owner.${index}`))}
              />
              <PresetList
                title={t("modulePresets.sections.handoff")}
                items={itemIndexes.map((index) => t(`modulePresets.presets.${presetKey}.handoff.${index}`))}
              />
            </div>

            <Link href={link.href} className="mt-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand/80">
              {t(link.labelKey)}
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}

function PresetList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted">{title}</span>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item} className="text-[12px] text-secondary leading-relaxed flex gap-2">
            <span className="mt-[7px] w-1 h-1 rounded-full bg-brand/70 flex-shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
