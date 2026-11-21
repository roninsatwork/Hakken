"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Blocks } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { MenuFeature } from "@/convex/utils/coreModules";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TABLE_PAGE_SIZE, matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { LevelsStrip } from "../../../_components/LevelsStrip";
import { AlwaysOnLabel, featureWordColumns, useMenuFeatureRows, type FeatureRow } from "../../../_components/features/FeatureTableParts";

type PlatformFeaturesContentProps = {
  offForEveryone: string[];
  companies: number;
  /** For each feature, how many companies have it ticked on their own page. */
  ticked: { feature: string; companies: number }[];
};

/**
 * System Settings → Features (features-switches-plan-2026-11-21.md, FS4): what
 * every company has in its menu. Unticking a feature here takes it from every
 * company's menu and stops its collection. Each company's own tick is kept, so
 * ticking it again gives each one back what it had.
 */
export function PlatformFeaturesContent({ offForEveryone, companies, ticked }: PlatformFeaturesContentProps) {
  const t = useTranslations("admin.features");
  const save = useMutation(api.featureSwitches.setFeaturesOffForEveryone);
  const rows = useMenuFeatureRows();
  const action = useAdminAction({ scope: "admin-platform-features" });

  const [off, setOff] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");

  // Adopt the server's answer whenever it changes, during render, keyed on
  // the contents (as the company Features tab does).
  const offKey = offForEveryone.join("\u0000");
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (offKey !== seenKey) {
    setSeenKey(offKey);
    setOff(offForEveryone);
  }

  const toggle = (feature: MenuFeature) => {
    setOff((previous) => (previous.includes(feature) ? previous.filter((key) => key !== feature) : [...previous, feature]));
  };
  const tickedFor = (feature: MenuFeature) => ticked.find((entry) => entry.feature === feature)?.companies ?? companies;

  const matching = rows.filter((row) => matchesSearchTerm(searchTerm, [row.name, row.description]));
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);
  const isPristine = off.length === offForEveryone.length && off.every((key) => offForEveryone.includes(key));

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    const outcome = await action.run(() => save({ featuresOff: off }), {
      key: "save-platform-features",
      suppressErrorToast: true,
      fallbackMessage: t("saveFailed"),
    });
    if (outcome.ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else if (outcome.message) {
      setError(outcome.message);
    }
    setIsSaving(false);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader icon={<Blocks className="w-6 h-6 text-brand" />} title={t("title")} description={t("everyoneDescription")} />

      <LevelsStrip
        steps={[
          { name: t("levels.platform", { number: 1 }), where: t("levels.thisPage"), text: t("levels.platformHere"), current: true },
          { name: t("levels.company", { number: 2 }), where: t("levels.itsFeatures"), text: t("levels.companyFromPlatform") },
        ]}
        note={t("levels.platformNote")}
      />

      <DataTable<FeatureRow>
        rows={paged.items}
        rowKey={(row) => row.id}
        search={{
          value: searchTerm,
          onChange: (next) => {
            setSearchTerm(next);
            setPage(1);
          },
          placeholder: t("search"),
        }}
        empty={{ icon: <Blocks className="w-8 h-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: false,
          onPageChange: setPage,
          labels: { empty: t("empty") },
        }}
        columns={[
          ...featureWordColumns<FeatureRow>({ feature: t("columns.feature"), what: t("columns.what") }),
          {
            key: "companies",
            header: t("columns.companies"),
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: (row) => {
              // The state the company page names it by: one name for one state.
              if (row.feature && off.includes(row.feature)) return <span className="text-[12px] text-muted">{t("offForEveryone")}</span>;
              const on = row.feature ? tickedFor(row.feature) : companies;
              return <span className="font-mono text-[12px] text-foreground">{t("companiesOn", { on, all: companies })}</span>;
            },
          },
          {
            key: "on",
            header: t("columns.on"),
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: (row) => {
              const feature = row.feature;
              if (!feature) return <AlwaysOnLabel />;
              return <Checkbox label={row.name} labelHidden checked={!off.includes(feature)} onChange={() => toggle(feature)} />;
            },
          },
        ]}
      />

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <SaveError>{error}</SaveError>
        </div>
        <SaveAction
          onClick={handleSave}
          disabled={isSaving || isPristine}
          isSaving={isSaving}
          showSuccess={saveSuccess}
          label={t("save")}
          savingLabel={t("saving")}
          successLabel={t("saved")}
        />
      </div>
    </div>
  );
}
