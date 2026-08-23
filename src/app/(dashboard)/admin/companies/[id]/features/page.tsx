"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Blocks, Info } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { COMPANY_MODULES } from "@/convex/utils/companyModules";
import { getErrorMessage } from "@/src/lib/errors";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  paginateItems,
} from "@/src/ui/components/screens/pagination";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";

/**
 * What this workspace can reach.
 *
 * Lived as a card at the bottom of the company's Overview screen until
 * 2026-08-18, where Anthony found it: *"this needs to be on its own screen in
 * the company"*. It had outgrown the spot. When it was written it offered one
 * bespoke module and read as a footnote to the profile; it now decides whether
 * a workspace has Tasks, Calls, Reception, a Wiki and the rest, which is not
 * a footnote to anything.
 *
 * Saves on its own, as it always did. Editing the company's details and
 * granting it a section are different kinds of change, and coupling them would
 * mean a half-finished profile edit blocks switching a feature on.
 *
 * Super admin only, matching the plan override: a workspace admin choosing
 * which features their own workspace holds would defeat the point of the flag.
 *
 * A standard table since 2026-08-22. It was a column of bordered tick-box rows,
 * which was a shape no other screen used — Anthony, with the screen open:
 * *"this is not our standard table... with the pagination footer and search."*
 * The list is short enough that neither the search nor the footer earns its
 * place on its own; they are here because every list screen in the admin has
 * them, and a screen that drops them because its list is short is how the
 * section stops matching itself.
 */
export default function CompanyFeaturesPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const t = useTranslations("admin.companies");
  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const currentUser = useQuery(api.users.getMe);
  const planGrants = useQuery(api.companies.getPlanGrantsForCompany, { id: companyId });
  const setCompanyModules = useMutation(api.companies.setCompanyModules);

  const enabled = company?.enabledModules;
  const [selected, setSelected] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState("");

  // Follows the record when it changes underneath — a save elsewhere, or the
  // first load arriving after this mounted.
  useEffect(() => {
    setSelected(enabled ?? []);
  }, [enabled]);

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
    selected.length === (enabled ?? []).length &&
    selected.every((key) => (enabled ?? []).includes(key));

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    try {
      await setCompanyModules({ id: companyId, enabledModules: selected });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e: unknown) {
      setError(getErrorMessage(e, "Failed to update features"));
    } finally {
      setIsSaving(false);
    }
  };

  // Nothing at all until the answer arrives, rather than a screen that says
  // "not allowed" for a moment to the person who is allowed.
  if (currentUser === undefined || company === undefined) return null;

  if (currentUser?.role !== "SUPER_ADMIN") {
    return (
      <p className="text-[13px] text-secondary">
        Only a platform administrator can change which features a workspace has.
      </p>
    );
  }

  return (
    // The wrapper the sibling tabs in this section use, so Features sits at the
    // same height and rhythm as Dashboard and Overview.
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
            // Page 3 of a search that now has one page of results is an empty
            // table, so a new search always starts at the top.
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
              // Same keys the provisioning modal and the plans screen use, so
              // the three cannot drift apart in how they describe a feature.
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
            // The name column already says which feature this is, so the box
            // keeps its label for whoever is listening and drops it for
            // whoever is looking.
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
