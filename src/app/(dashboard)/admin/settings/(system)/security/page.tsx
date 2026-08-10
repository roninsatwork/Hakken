"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ToggleLeft, ToggleRight } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { SettingBlock } from "../../_components/SettingBlock";
import { SettingsScreen } from "../../_components/SettingsScreen";
import type { PiiConfig } from "../../_components/types";

export default function SystemSecurityPage() {
  const t = useTranslations("admin.settings");
  const currentPiiConfig = useQuery(api.system.getPiiConfig);
  const updatePiiConfig = useMutation(api.system.updatePiiConfig);

  const [piiData, setPiiData] = useState<PiiConfig>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (currentPiiConfig) setPiiData(currentPiiConfig);
  }, [currentPiiConfig]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updatePiiConfig({ configStr: JSON.stringify(piiData) });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsScreen
      isLoading={currentPiiConfig === undefined}
      save={{
        onSave: handleSave,
        isSaving,
        saveSuccess,
        label: t("save"),
        savingLabel: t("saving"),
        successLabel: t("success"),
      }}
    >
      <SettingBlock title={t("security.redaction")} sub={t("security.redactionSub")}>
        <div className="flex flex-col gap-0 border border-border-dim rounded-[16px] overflow-hidden">
          <div className="flex items-center justify-between p-5 bg-background/50 border-b border-border-dim">
            <div className="flex flex-col gap-1">
              <span className="text-[14px] text-foreground font-semibold">{t("security.masterToggle")}</span>
              <span className="text-[12px] text-muted">{t("security.masterToggleSub")}</span>
            </div>
            <button
              type="button"
              aria-pressed={piiData.enabled ?? false}
              onClick={() => setPiiData({ ...piiData, enabled: !piiData.enabled })}
              className={`transition-colors flex-shrink-0 ${piiData.enabled ? "text-brand" : "text-muted"}`}
            >
              {piiData.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
            </button>
          </div>

          <div className={`flex flex-col transition-all duration-300 ${piiData.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
            <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
              <span className="text-[13px] text-foreground/90">{t("security.maskEmails")}</span>
              <button
                type="button"
                aria-pressed={piiData.maskEmails ?? false}
                onClick={() => setPiiData({ ...piiData, maskEmails: !piiData.maskEmails })}
                className={`transition-colors flex-shrink-0 ${piiData.maskEmails ? "text-[#10B981]" : "text-border-dim"}`}
              >
                {piiData.maskEmails ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>

            <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
              <span className="text-[13px] text-foreground/90">{t("security.maskCreditCards")}</span>
              <button
                type="button"
                aria-pressed={piiData.maskCreditCards ?? false}
                onClick={() => setPiiData({ ...piiData, maskCreditCards: !piiData.maskCreditCards })}
                className={`transition-colors flex-shrink-0 ${piiData.maskCreditCards ? "text-[#10B981]" : "text-border-dim"}`}
              >
                {piiData.maskCreditCards ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>

            <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
              <span className="text-[13px] text-foreground/90">{t("security.maskNi")}</span>
              <button
                type="button"
                aria-pressed={piiData.maskNinos ?? false}
                onClick={() => setPiiData({ ...piiData, maskNinos: !piiData.maskNinos })}
                className={`transition-colors flex-shrink-0 ${piiData.maskNinos ? "text-[#10B981]" : "text-border-dim"}`}
              >
                {piiData.maskNinos ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>

            <div className="flex items-center justify-between p-5 bg-card/10">
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-foreground/90">{t("security.maskPhones")}</span>
                <span className="text-[11px] text-muted max-w-[280px]">{t("security.maskPhonesSub")}</span>
              </div>
              <button
                type="button"
                aria-pressed={piiData.maskPhones ?? false}
                onClick={() => setPiiData({ ...piiData, maskPhones: !piiData.maskPhones })}
                className={`transition-colors flex-shrink-0 ${piiData.maskPhones ? "text-[#10B981]" : "text-border-dim"}`}
              >
                {piiData.maskPhones ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
              </button>
            </div>
          </div>
        </div>
      </SettingBlock>
    </SettingsScreen>
  );
}
