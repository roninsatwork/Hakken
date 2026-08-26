"use client";

import { useState } from "react";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import { Blocks, Info } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { COMPANY_MODULES } from "@/convex/utils/companyModules";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  paginateItems,
} from "@/src/ui/components/screens/pagination";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";

type CompanyFeaturesContentProps = {
  companyId: Id<"companies">;
  enabledModules?: string[];
  planGrants:
    | {
        grantedModules: string[];
        planName: string;
      }
    | null
    | undefined;
};

export function CompanyFeaturesContent({
  companyId,
  enabledModules,
  planGrants,
}: CompanyFeaturesContentProps) {
  const t = useTranslations("admin.companies");
  const setCompanyModules = useMutation(api.companies.setCompanyModules);

  const [selected, setSelected] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const action = useAdminAction({ scope: "admin-company-features" });
  const [error, setError] = useState("");

  // Adopt the server's answer whenever it changes, during render rather than
  // in an effect — the effect version painted a frame of the stale selection
  // first.
  const [seenModules, setSeenModules] = useState<typeof enabledModules | null>(null);
  if (enabledModules !== undefined && enabledModules !== seenModules) {
    setSeenModules(enabledModules);
    setSelected(enabledModules ?? []);
  }

  const toggle = (key: string) => {
    setSelected((previous) =>
      previous.includes(key)
        ? previous.filter((entry) => entry !== key)
        : [...previous, key]
    );
  };

  const matching = COMPANY_MODULES.filter((module) =>
    matchesSearchTerm(searchTerm, [
      t(`modules.${module.key}.name`),
      t(`modules.${module.key}.description`),
    ])
  );
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);

  const isPristine =
    selected.length === (enabledModules ?? []).length &&
    selected.every((key) => (enabledModules ?? []).includes(key));

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    const outcome = await action.run(
      () => setCompanyModules({ id: companyId, enabledModules: selected }),
      { key: "save-features", suppressErrorToast: true, fallbackMessage: t("featuresSaveFailed") }
    );
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
      <PageHeader
        icon={<Blocks className="w-6 h-6 text-brand" />}
        title={t("featuresTitle")}
        description={t("featuresIntro")}
      />

      {planGrants && planGrants.grantedModules.length > 0 && (
        <div className="flex items-start gap-4 p-4 bg-foreground/[0.015] border border-border-dim/50 rounded-[12px] text-secondary">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-muted" />
          <div className="flex flex-col gap-0.5">
            <h3 className="text-[13px] font-medium text-foreground tracking-wide">
              {t("featuresPlanNote")}
            </h3>
            <p className="text-[12.5px] leading-relaxed text-secondary opacity-80 tracking-wide">
              <span className="text-foreground">{planGrants.planName}</span> already switches on{" "}
              <span className="text-foreground">
                {planGrants.grantedModules.map((key) => t(`modules.${key}.name`)).join(", ")}
              </span>
              {" — those stay on whatever the boxes below say. To switch one off, move the"}
              {" workspace to a plan without it."}
            </p>
          </div>
        </div>
      )}

      <DataTable
        rows={paged.items}
        rowKey={(module) => module.key}
        minWidthClassName="min-w-[640px]"
        search={{
          value: searchTerm,
          onChange: (next) => {
            setSearchTerm(next);
            setPage(1);
          },
          placeholder: t("featuresSearchPlaceholder"),
        }}
        empty={{
          icon: <Blocks className="w-8 h-8 text-muted/30" />,
          label: t("featuresEmptyState"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: false,
          onPageChange: setPage,
          labels: { empty: t("featuresEmptyState") },
        }}
        columns={[
          {
            key: "feature",
            header: t("featuresNameColumn"),
            className: "w-[200px]",
            cell: (module) => (
              <span className="text-[13px] font-medium text-foreground">
                {t(`modules.${module.key}.name`)}
              </span>
            ),
          },
          {
            key: "description",
            header: t("featuresDescriptionColumn"),
            cell: (module) => (
              <span className="text-[12px] text-secondary">
                {t(`modules.${module.key}.description`)}
              </span>
            ),
          },
          {
            key: "on",
            header: t("featuresOnColumn"),
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: (module) => (
              <Checkbox
                label={t(`modules.${module.key}.name`)}
                labelHidden
                checked={selected.includes(module.key)}
                onChange={() => toggle(module.key)}
              />
            ),
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
          label="Save Features"
          savingLabel="Saving…"
          successLabel="Features updated."
        />
      </div>
    </div>
  );
}
