"use client";

import { Eye, EyeOff, Route, ShieldCheck } from "lucide-react";

type TranslationFn = (key: string) => string;

type ProfileKey = "customerWorkspace" | "supportWidget" | "operatorConsole";

export type WhiteLabelNavigationProfile = {
  key: ProfileKey;
  visible: string[];
  owner: string[];
  hide: string[];
  implementationNotes: string[];
};

type WhiteLabelNavigationProfilesSectionProps = {
  profiles?: WhiteLabelNavigationProfile[];
  t: TranslationFn;
};

const fallbackProfiles: WhiteLabelNavigationProfile[] = [
  {
    key: "customerWorkspace",
    visible: ["appDashboard", "assistant", "reports", "organization"],
    owner: ["systemSettings", "systemHealth"],
    hide: ["adminCompanies", "apiKeys"],
    implementationNotes: ["tenantScoped", "preserveAdminRoutes", "keepServerAuthz"],
  },
  {
    key: "supportWidget",
    visible: ["publicWidget", "customerChatHistory", "knowledgeQa"],
    owner: ["widgetSetup", "globalKnowledge", "chatLogs"],
    hide: ["properties", "arcade", "diagnostics"],
    implementationNotes: ["domainAllowlist", "widgetBranding", "emailSender"],
  },
  {
    key: "operatorConsole",
    visible: ["adminDashboard", "agents", "workflows", "approvals", "runObservatory"],
    owner: ["systemHealth", "auditLogs"],
    hide: ["properties", "arcade", "publicWidget"],
    implementationNotes: ["superAdminOnly", "auditRouteChanges", "documentHiddenRoutes"],
  },
];

export function WhiteLabelNavigationProfilesSection({ profiles, t }: WhiteLabelNavigationProfilesSectionProps) {
  const resolvedProfiles = profiles && profiles.length > 0 ? profiles : fallbackProfiles;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {resolvedProfiles.map((profile) => (
        <div key={profile.key} className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex flex-col gap-5">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-[10px] bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
              <Route className="w-4 h-4 text-brand" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <h4 className="text-[14px] font-semibold text-foreground">{t(`navigationProfiles.profiles.${profile.key}.title`)}</h4>
              <p className="text-[12px] text-muted leading-relaxed">{t(`navigationProfiles.profiles.${profile.key}.summary`)}</p>
            </div>
          </div>

          <ProfileList
            icon={Eye}
            title={t("navigationProfiles.sections.visible")}
            items={profile.visible.map((item) => t(`navigationProfiles.items.${item}`))}
          />
          <ProfileList
            icon={ShieldCheck}
            title={t("navigationProfiles.sections.owner")}
            items={profile.owner.map((item) => t(`navigationProfiles.items.${item}`))}
          />
          <ProfileList
            icon={EyeOff}
            title={t("navigationProfiles.sections.hide")}
            items={profile.hide.map((item) => t(`navigationProfiles.items.${item}`))}
          />
          <ProfileList
            icon={Route}
            title={t("navigationProfiles.sections.notes")}
            items={profile.implementationNotes.map((item) => t(`navigationProfiles.items.${item}`))}
          />
        </div>
      ))}
    </div>
  );
}

function ProfileList({
  icon: Icon,
  title,
  items,
}: {
  icon: typeof Eye;
  title: string;
  items: string[];
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted flex items-center gap-1.5">
        <Icon className="w-3 h-3" />
        {title}
      </span>
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
