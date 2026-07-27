"use client";

import Link from "next/link";
import { Boxes, ExternalLink } from "lucide-react";

type TranslationFn = (key: string) => string;

type PresetKey = "knowledgeAssistant" | "supportWidget" | "operatorWorkspace";

export type WhiteLabelModulePreset = {
  key: PresetKey;
  href: string;
  linkLabelKey: "agents" | "widget" | "health";
  readinessDependencies: Array<"identity" | "logos" | "brandColor" | "diagnostics" | "widget" | "email" | "production">;
  visible: string[];
  owner: string[];
  handoff: string[];
};

type WhiteLabelModulePresetsSectionProps = {
  presets?: WhiteLabelModulePreset[];
  t: TranslationFn;
};

const fallbackPresets: WhiteLabelModulePreset[] = [
  {
    key: "knowledgeAssistant",
    href: "/admin/agents",
    linkLabelKey: "agents",
    readinessDependencies: ["identity", "logos", "brandColor", "diagnostics", "production"],
    visible: ["assistantWorkspace", "knowledgeSurfaces", "reportsOptional"],
    owner: ["agentBuilderEvals", "modelDefaults", "systemHealth"],
    handoff: ["replaceDemoKnowledge", "runReleaseGate", "keepDiagnosticsDisabled"],
  },
  {
    key: "supportWidget",
    href: "/admin/ai/widget",
    linkLabelKey: "widget",
    readinessDependencies: ["identity", "brandColor", "widget", "email", "production"],
    visible: ["publicWidget", "customerChatHistory", "knowledgeQa"],
    owner: ["widgetSetup", "connectorMarketplace", "approvalsInbox"],
    handoff: ["setAllowedDomains", "reviewWidgetBranding", "testEscalationPolicy"],
  },
  {
    key: "operatorWorkspace",
    href: "/admin/health",
    linkLabelKey: "health",
    readinessDependencies: ["identity", "logos", "diagnostics", "email", "production"],
    visible: ["dashboardReports", "workflowsSchedules", "approvalsRuns"],
    owner: ["systemHealth", "auditLedger"],
    handoff: ["confirmRoleAccess", "setScheduleOwners", "exportHealthReport"],
  },
];

export function WhiteLabelModulePresetsSection({ presets, t }: WhiteLabelModulePresetsSectionProps) {
  const resolvedPresets = presets && presets.length > 0 ? presets : fallbackPresets;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {resolvedPresets.map((preset) => {
        return (
          <div key={preset.key} className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-[10px] bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
                  <Boxes className="w-4 h-4 text-brand" />
                </div>
                <div className="flex flex-col gap-1 min-w-0">
                  <h4 className="text-[14px] font-semibold text-foreground">{t(`modulePresets.presets.${preset.key}.title`)}</h4>
                  <p className="text-[12px] text-muted leading-relaxed">{t(`modulePresets.presets.${preset.key}.summary`)}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <PresetList
                title={t("modulePresets.sections.visible")}
                items={preset.visible.map((item) => t(`modulePresets.items.${item}`))}
              />
              <PresetList
                title={t("modulePresets.sections.owner")}
                items={preset.owner.map((item) => t(`modulePresets.items.${item}`))}
              />
              <PresetList
                title={t("modulePresets.sections.handoff")}
                items={preset.handoff.map((item) => t(`modulePresets.items.${item}`))}
              />
            </div>

            <Link href={preset.href} className="mt-auto inline-flex items-center gap-1.5 text-[12px] font-medium text-brand hover:text-brand/80">
              {t(`modulePresets.links.${preset.linkLabelKey}`)}
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
