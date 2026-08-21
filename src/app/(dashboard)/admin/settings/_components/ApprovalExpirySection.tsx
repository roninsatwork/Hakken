"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/src/lib/errors";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { SettingBlock } from "./SettingBlock";
import { Field } from "@/src/ui/components/screens/Field";
import { useTranslations } from "next-intl";

/**
 * How long an agent run may wait for a person before the platform gives up.
 *
 * Configurable rather than a constant because it is an operational limit, and the
 * one other operational limit on this platform an admin can set — purge retention —
 * established the pattern: a systemConfig row, a validated setter with a hard
 * minimum, and a section here. Every other threshold is a module constant that the
 * system health screen can only display.
 */
export function ApprovalExpirySection() {
  const t = useTranslations("admin.settings.approvals");
  const config = useQuery(api.agentRunApprovals.getApprovalExpiryConfig, {});
  const updateConfig = useMutation(api.agentRunApprovals.updateApprovalExpiryConfig);

  const [hours, setHours] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (config) setHours(String(config.expiryHours));
  }, [config]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError("");
    try {
      await updateConfig({ expiryHours: Number(hours) });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      // The server refuses a window below the minimum by name, so the reason is
      // shown rather than a generic failure.
      setSaveError(getErrorMessage(error, t("saveFailed")));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingBlock
      title={t("title")}
      sub={t("subtitle")}
    >
      <div className="flex flex-col gap-4">
        <p className="text-[12px] text-secondary leading-relaxed max-w-2xl">
          {t("explainer")}
        </p>

        <div className="max-w-[260px]">
          <Field
            id="approval-expiry-hours"
            label={t("hoursLabel")}
            type="number"
            min={config?.minHours ?? 1}
            max={config?.maxHours ?? 720}
            step="1"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            disabled={config === undefined}
            className="disabled:opacity-50"
            hint={
              config
                ? t("hoursHint", { default: config.defaultHours, min: config.minHours, max: config.maxHours })
                : t("loading")
            }
          />
        </div>

        <SaveError>{saveError}</SaveError>

        <div className="flex justify-end">
          <SaveAction
            onClick={handleSave}
            isSaving={isSaving}
            showSuccess={saveSuccess}
            label={t("save")}
            savingLabel={t("saving")}
            successLabel={t("saved")}
            disabled={config === undefined}
          />
        </div>
      </div>
    </SettingBlock>
  );
}
