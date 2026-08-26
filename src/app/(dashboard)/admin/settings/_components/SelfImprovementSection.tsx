"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Info, Sparkles } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  paginateItems,
} from "@/src/ui/components/screens/pagination";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { useTranslations } from "next-intl";

type SwitchKey =
  | "autoReflection"
  | "outcomeWeightedRanking"
  | "endUserFeedback"
  | "retrievalPriors"
  | "autonomousMemory";

type SwitchState = Record<SwitchKey, boolean>;

type SwitchRow = {
  key: SwitchKey;
  name: string;
  description: string;
};

/**
 * The self-improvement switches from docs/plans/active/self-improvement-plan.md.
 *
 * The first four control learning that reorders or scores. The autonomy switch
 * is different in kind — with it on, what the AI learns is saved to memory
 * immediately, with no per-memory approval (owner decision, 2026-08-10). It was
 * set apart by wrapping it in its own tinted box; it is an ordinary row now, and
 * the note that explains it sits above the table where the workspace Features
 * screen keeps its plan note. Nothing about the switch changed, only where its
 * explanation lives.
 *
 * A standard table since 2026-08-23, with System Security and Developer
 * Diagnostics. All three had grown the same switch-card shape — a stack of
 * bordered rows with a toggle glyph on the right — which no other list screen
 * used and which the kit had no part for. Anthony, with the screens open:
 * *"there are new tables in the system settings that look hand drawn and need
 * to be standardised."*
 *
 * The rows no longer end in "— on" or "— off". A column headed "Switched on"
 * with a tick in it says that once, which is the point of having the column.
 */
export function SelfImprovementSection() {
  const t = useTranslations("admin.settings.selfImprovement");
  const config = useQuery(api.selfImprovementConfig.getConfig, {});
  const updateConfig = useMutation(api.selfImprovementConfig.updateConfig);
  const action = useAdminAction({ scope: "admin-self-improvement" });

  const [switches, setSwitches] = useState<SwitchState | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const [seenConfig, setSeenConfig] = useState<typeof config>(undefined);

  if (config && config !== seenConfig) {
    setSeenConfig(config);
    setSwitches(config);
  }

  const handleSave = async () => {
    if (!switches) return;
    setSaveError("");
    const outcome = await action.run(() => updateConfig(switches), {
      suppressErrorToast: true,
      fallbackMessage: t("saveFailed"),
    });
    if (outcome.ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
      return;
    }
    if (outcome.message) setSaveError(outcome.message);
  };

  /**
   * Each row explains itself in operator language, because the person deciding
   * whether to switch learning behaviour off mid-incident should not need the
   * plan document open to know what stops.
   *
   * Built here rather than at module scope so every key is a literal the
   * messages check can follow to the catalogue.
   */
  const rows: SwitchRow[] = [
    { key: "autoReflection", name: t("autoReflection"), description: t("autoReflectionSub") },
    {
      key: "outcomeWeightedRanking",
      name: t("outcomeWeightedRanking"),
      description: t("outcomeWeightedRankingSub"),
    },
    { key: "endUserFeedback", name: t("endUserFeedback"), description: t("endUserFeedbackSub") },
    { key: "retrievalPriors", name: t("retrievalPriors"), description: t("retrievalPriorsSub") },
    { key: "autonomousMemory", name: t("autonomousMemory"), description: t("autonomousMemorySub") },
  ];

  const matching = rows.filter((row) =>
    matchesSearchTerm(searchTerm, [row.name, row.description])
  );
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);

  return (
    <>
      <PageHeader
        icon={<Sparkles className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="flex items-start gap-4 p-4 bg-warning/5 border border-warning/30 rounded-[12px]">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-warning" />
        <p className="text-[12.5px] leading-relaxed text-secondary tracking-wide">
          {t("autonomyExplainer")}
        </p>
      </div>

      <DataTable
        // undefined until the stored switches arrive, so the kit draws its
        // loading row rather than a table of switches that all read as off.
        rows={switches === null ? undefined : paged.items}
        rowKey={(row) => row.key}
        minWidthClassName="min-w-[640px]"
        search={{
          value: searchTerm,
          onChange: (next) => {
            setSearchTerm(next);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <Sparkles className="w-8 h-8 text-muted/30" />,
          label: t("emptyState"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: switches === null,
          onPageChange: setPage,
          labels: { empty: t("emptyState") },
        }}
        columns={[
          {
            key: "switch",
            header: t("nameColumn"),
            className: "w-[280px]",
            cell: (row) => (
              <span className="text-[13px] font-medium text-foreground">{row.name}</span>
            ),
          },
          {
            key: "description",
            header: t("descriptionColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{row.description}</span>
            ),
          },
          {
            key: "on",
            header: t("onColumn"),
            align: "right",
            className: "w-[150px] whitespace-nowrap",
            cell: (row) => (
              <Checkbox
                label={row.name}
                labelHidden
                checked={switches?.[row.key] ?? false}
                disabled={switches === null}
                onChange={(next) =>
                  setSwitches((previous) =>
                    previous ? { ...previous, [row.key]: next } : previous
                  )
                }
              />
            ),
          },
        ]}
      />

      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <SaveError>{saveError}</SaveError>
        </div>
        <SaveAction
          onClick={handleSave}
          isSaving={action.isBusy()}
          showSuccess={saveSuccess}
          label={t("save")}
          savingLabel={t("saving")}
          successLabel={t("saved")}
          disabled={switches === null}
        />
      </div>
    </>
  );
}
