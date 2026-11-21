"use client";

import { useState } from "react";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Blocks, Info } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { COMPANY_MODULES } from "@/convex/utils/companyModules";
import { normalizeSwitchesOff, type SwitchedFeature } from "@/convex/utils/coreModules";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  paginateItems,
} from "@/src/ui/components/screens/pagination";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { LevelsStrip } from "../../../_components/LevelsStrip";
import { AlwaysOnLabel, featureWordColumns, useMenuFeatureRows } from "../../../_components/features/FeatureTableParts";

type CompanyFeaturesContentProps = {
  companyId: Id<"companies">;
  companyName: string;
  enabledModules?: string[];
  /** The menu features switched off for this company alone. */
  featuresOff?: string[];
  /** The menu features switched off for every company (System Settings → Features). */
  offForEveryone: string[];
  planGrants:
    | {
        grantedModules: string[];
        planName: string;
      }
    | null
    | undefined;
};

/** A row of the table: one of the 11 menu items, or one of Tasks, Calls, Reception and Wiki. */
type Row =
  | { kind: "menu"; id: string; feature: SwitchedFeature | null; name: string; description: string }
  | { kind: "module"; id: string; name: string; description: string };

/**
 * What a company has (features-switches-plan-2026-11-21.md, FS5): the client
 * menu in menu order, then Tasks, Calls, Reception and Wiki as before. A menu
 * feature System Settings has switched off for everyone says so, and can only
 * be ticked again there. One Save saves both kinds.
 */
export function CompanyFeaturesContent({
  companyId,
  companyName,
  enabledModules,
  featuresOff,
  offForEveryone,
  planGrants,
}: CompanyFeaturesContentProps) {
  const t = useTranslations("admin.companies");
  const tFeatures = useTranslations("admin.features");
  const setCompanyModules = useMutation(api.companies.setCompanyModules);
  const menuRows = useMenuFeatureRows();

  const [selected, setSelected] = useState<string[]>([]);
  const [off, setOff] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const action = useAdminAction({ scope: "admin-company-features" });
  const [error, setError] = useState("");

  // Adopt the server's answer whenever it changes, during render rather than
  // in an effect — the effect version painted a frame of the stale selection
  // first.
  //
  // Keyed on the contents rather than the array. Holding the array itself
  // worked only because a Convex query hands back the same reference until the
  // data really changes; the moment a parent writes `?? []`, or derives the
  // list with a `.filter`, every render produces a new array, the adoption
  // fires again, and the screen renders until React gives up. That is not a
  // hypothetical — it is what the model pricing screen did this morning.
  //
  // The page renders this only once the company has loaded, so a company with
  // no list of its own is adopted as an empty one, not waited for.
  const savedOff = normalizeSwitchesOff(featuresOff);
  const serverKey = `${(enabledModules ?? []).join("\u0000")}|${savedOff.join("\u0000")}`;
  const [seenServerKey, setSeenServerKey] = useState<string | null>(null);
  if (serverKey !== seenServerKey) {
    setSeenServerKey(serverKey);
    setSelected(enabledModules ?? []);
    setOff(savedOff);
  }

  const toggleModule = (key: string) => {
    setSelected((previous) =>
      previous.includes(key)
        ? previous.filter((entry) => entry !== key)
        : [...previous, key]
    );
  };
  const toggleFeature = (feature: SwitchedFeature) => {
    setOff((previous) => (previous.includes(feature) ? previous.filter((key) => key !== feature) : [...previous, feature]));
  };

  const rows: Row[] = [
    ...menuRows.map((row) => ({ kind: "menu" as const, ...row })),
    ...COMPANY_MODULES.map((module) => ({
      kind: "module" as const,
      id: `module-${module.key}`,
      name: t(`modules.${module.key}.name`),
      description: t(`modules.${module.key}.description`),
    })),
  ];
  const matching = rows.filter((row) => matchesSearchTerm(searchTerm, [row.name, row.description]));
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);

  const isPristine =
    selected.length === (enabledModules ?? []).length &&
    selected.every((key) => (enabledModules ?? []).includes(key)) &&
    off.length === savedOff.length &&
    off.every((key) => savedOff.includes(key as SwitchedFeature));

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    const outcome = await action.run(
      () => setCompanyModules({ id: companyId, enabledModules: selected, featuresOff: off }),
      { key: "save-features", suppressErrorToast: true, fallbackMessage: tFeatures("saveFailed") }
    );
    if (outcome.ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } else if (outcome.message) {
      setError(outcome.message);
    }
    setIsSaving(false);
  };

  const switchedOn = (row: Row) => {
    if (row.kind === "module") {
      const key = row.id.slice("module-".length);
      return <Checkbox label={row.name} labelHidden checked={selected.includes(key)} onChange={() => toggleModule(key)} />;
    }
    const feature = row.feature;
    if (!feature) return <AlwaysOnLabel />;
    if (offForEveryone.includes(feature)) return <StatusLabel tone="neutral">{tFeatures("offForEveryone")}</StatusLabel>;
    return <Checkbox label={row.name} labelHidden checked={!off.includes(feature)} onChange={() => toggleFeature(feature)} />;
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Blocks className="w-6 h-6 text-brand" />}
        title={tFeatures("title")}
        description={tFeatures("companyDescription", { company: companyName })}
      />

      <LevelsStrip
        steps={[
          {
            name: tFeatures("levels.platform", { number: 1 }),
            where: <Link href="/admin/settings/features" className="text-brand hover:underline">{tFeatures("levels.platformPage")}</Link>,
            text: tFeatures("levels.platformThere"),
          },
          { name: tFeatures("levels.company", { number: 2 }), where: tFeatures("levels.thisPage"), text: tFeatures("levels.companyHere", { company: companyName }), current: true },
        ]}
        note={tFeatures("levels.companyNote")}
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
              {". Those stay on whatever the boxes below say. To switch one off, move the"}
              {" company to a plan without it."}
            </p>
          </div>
        </div>
      )}

      <DataTable<Row>
        rows={paged.items}
        rowKey={(row) => row.id}
        search={{
          value: searchTerm,
          onChange: (next) => {
            setSearchTerm(next);
            setPage(1);
          },
          placeholder: tFeatures("search"),
        }}
        empty={{
          icon: <Blocks className="w-8 h-8 text-muted/30" />,
          label: tFeatures("empty"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: false,
          onPageChange: setPage,
          labels: { empty: tFeatures("empty") },
        }}
        columns={[
          ...featureWordColumns<Row>({ feature: tFeatures("columns.feature"), what: tFeatures("columns.what") }),
          {
            key: "on",
            header: tFeatures("columns.on"),
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: switchedOn,
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
          label={tFeatures("save")}
          savingLabel={tFeatures("saving")}
          successLabel={tFeatures("saved")}
        />
      </div>
    </div>
  );
}
