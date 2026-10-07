"use client";

import { useMutation, useQuery } from "convex/react";
import { Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Communication } from "@/convex/utils/communications";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";

/**
 * The profile's Communication preferences tab (docs/plans/active/outbox-and-
 * preferences-plan.md, C2; board CommunicationPreferences): only the emails a
 * person may choose — the profile is for clients — each ticked until they opt
 * out, and one button for all of them. No search box or page footer: a
 * handful of rows (Anthony, 2026-10-07).
 */
export function CommunicationTab() {
  const t = useTranslations("user.preferences.communication");
  const tKinds = useTranslations("communications");
  const { platformName } = useSystemSettings();
  const preferences = useQuery(api.readerPreferences.getMyEmailPreferences);
  const setOne = useMutation(api.readerPreferences.setMyEmail);
  const setAll = useMutation(api.readerPreferences.setAllMyEmails);
  const action = useAdminAction({ scope: "profile-communication" });
  const choices = preferences?.choices;
  const anyOn = (choices ?? []).some((choice) => choice.on);
  // The digest and the reports read their own names; Hakken tasks reads as the person's own.
  const nameOf = (kind: Communication) => (kind === "HAKKEN_TASKS" ? tKinds("HAKKEN_TASKS.yours", { platformName }) : tKinds(`${kind}.name`, { platformName }));

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h4 className="text-[13px] font-medium text-foreground tracking-wide flex items-center gap-2">
          <Mail className="w-4 h-4 text-brand" />
          {t("title")}
        </h4>
        <p className="text-[11px] text-secondary mt-0.5">{t("description")}</p>
      </div>
      <DataTable
        rows={choices}
        rowKey={(row) => row.communication}
        empty={{ icon: <Mail className="h-8 w-8 text-muted/30" />, label: t("empty") }}
        columns={[
          { key: "name", header: t("columns.email"), className: "w-[240px]", cell: (row) => <span className="text-[13px] font-medium text-foreground">{nameOf(row.communication)}</span> },
          { key: "what", header: t("columns.what"), cell: (row) => <span className="text-[12px] text-secondary">{tKinds(`${row.communication}.what`, { platformName })}</span> },
          { key: "often", header: t("columns.often"), cell: (row) => <TagLabel>{tKinds(`${row.communication}.often`)}</TagLabel> },
          {
            key: "on",
            header: t("columns.on"),
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: (row) => (
              <Checkbox
                label={nameOf(row.communication)}
                labelHidden
                checked={row.on}
                onChange={(on) => void action.run(() => setOne({ communication: row.communication, on }), { fallbackMessage: t("failed") })}
              />
            ),
          },
        ]}
      />
      {choices && choices.length > 0 ? (
        <div>
          <Button variant="quiet" onClick={() => void action.run(() => setAll({ on: !anyOn }), { fallbackMessage: t("failed") })}>
            {anyOn ? t("unsubscribeAll") : t("subscribeAll")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
