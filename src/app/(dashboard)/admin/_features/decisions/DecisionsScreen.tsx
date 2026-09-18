"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Info, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import {
  TABLE_PAGE_SIZE,
  matchesSearchTerm,
  paginateItems,
} from "@/src/ui/components/screens/pagination";

type DecisionMode = "OFF" | "ASK_A_PERSON" | "ACT";

type DecisionRow = {
  key: string;
  copyKey: string;
  usedIn: string;
  stakes: "LOW" | "HIGH";
  platformMode: DecisionMode;
  companyMode?: DecisionMode;
  effectiveMode: DecisionMode;
  ranThisWeek: number;
  handedThisWeek: number;
  costThisWeekGBP: number;
  isCapped: boolean;
};

const MODES: DecisionMode[] = ["OFF", "ASK_A_PERSON", "ACT"];

/**
 * The Decisions screen, mounted at two heights.
 *
 * Platform (`/admin/ai/decisions`): every Decision the platform can make,
 * its mode for everyone, and how it went this week. Company
 * (`/admin/companies/[id]/ai/decisions`): the same rows with the platform's
 * mode shown read-only and a second control for this company's own, whose
 * first option is to follow the platform — the Model Defaults shape.
 *
 * Anatomy copied from Self-Improvement: header, an explanation box, the
 * search box on the table, the table, its footer. The mode saves on change,
 * like a model default, because each row is its own setting; a single Save
 * for a table of independent settings is a promise the screen cannot keep
 * when one row fails and the rest succeed.
 *
 * docs/plans/active/decisions-typesafe-plan.md, Phase C.
 */
export function DecisionsScreen({
  companyId,
  nav,
}: {
  companyId?: Id<"companies">;
  /** The platform screen's AI tab strip; the company screen sits inside a DetailLayout and has none. */
  nav?: ReactNode;
}) {
  const t = useTranslations("admin.decisions");
  const tDecisions = useTranslations("decisions");
  const platformData = useQuery(api.decisions.listForPlatform, companyId ? "skip" : {});
  const companyData = useQuery(api.decisions.listForCompany, companyId ? { companyId } : "skip");
  const data = companyId ? companyData : platformData;
  const setPlatformMode = useMutation(api.decisions.setPlatformMode);
  const setCompanyMode = useMutation(api.decisions.setCompanyMode);
  const action = useAdminAction({ scope: companyId ? "admin-company-decisions" : "admin-decisions" });

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [saveError, setSaveError] = useState("");

  const rows: DecisionRow[] | undefined = data?.decisions;
  const nameOf = (row: DecisionRow) => tDecisions(`catalogue.${row.copyKey}.name`);
  const matching = (rows ?? []).filter((row) =>
    matchesSearchTerm(searchTerm, [
      nameOf(row),
      tDecisions(`catalogue.${row.copyKey}.description`),
      tDecisions(`usedIn.${row.usedIn}`),
    ]),
  );
  const paged = paginateItems(matching, page, TABLE_PAGE_SIZE);
  const detailHref = (row: DecisionRow) =>
    companyId
      ? `/admin/companies/${companyId}/ai/decisions/${encodeURIComponent(row.key)}`
      : `/admin/ai/decisions/${encodeURIComponent(row.key)}`;

  const changeMode = async (row: DecisionRow, value: string) => {
    setSaveError("");
    const outcome = await action.run(
      () =>
        companyId
          ? setCompanyMode({
              companyId,
              decisionKey: row.key,
              ...(value ? { mode: value as DecisionMode } : {}),
            })
          : setPlatformMode({ decisionKey: row.key, mode: value as DecisionMode }),
      { key: `mode:${row.key}`, suppressErrorToast: true, fallbackMessage: t("saveFailed") },
    );
    if (!outcome.ok && outcome.message) setSaveError(outcome.message);
  };

  const modeSelect = (row: DecisionRow) => {
    const isSaving = action.isBusy(`mode:${row.key}`);
    if (companyId) {
      return (
        <Select
          value={row.companyMode ?? ""}
          disabled={isSaving}
          aria-label={t("modeAria", { name: nameOf(row) })}
          onChange={(value) => changeMode(row, value)}
          className="w-full"
        >
          <option value="">{t("followPlatform", { mode: tDecisions(`modes.${row.platformMode}`) })}</option>
          {MODES.map((mode) => (
            <option key={mode} value={mode}>{tDecisions(`modes.${mode}`)}</option>
          ))}
        </Select>
      );
    }
    return (
      <Select
        value={row.platformMode}
        disabled={isSaving}
        aria-label={t("modeAria", { name: nameOf(row) })}
        onChange={(value) => changeMode(row, value)}
        className="w-full"
      >
        {MODES.map((mode) => (
          <option key={mode} value={mode}>{tDecisions(`modes.${mode}`)}</option>
        ))}
      </Select>
    );
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        divider={!companyId}
        icon={<Scale className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={companyId ? t("companySubtitle") : t("subtitle")}
      />

      {nav}

      <div className="flex items-start gap-4 p-4 bg-warning/5 border border-warning/30 rounded-[12px]">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-warning" />
        <p className="text-[12.5px] leading-relaxed text-secondary tracking-wide">{t("explainer")}</p>
      </div>

      {data && !data.provider.usable && (
        <p className="text-[12.5px] leading-relaxed text-warning">
          {t("usingSimpleRules")}{" "}
          <Link href="/admin/ai/models/defaults" className="underline underline-offset-2 hover:text-foreground">
            {t("openModelDefaults")}
          </Link>
        </p>
      )}

      <DataTable
        rows={rows === undefined ? undefined : paged.items}
        rowKey={(row) => row.key}
        minWidthClassName="min-w-[760px]"
        search={{
          value: searchTerm,
          onChange: (next) => {
            setSearchTerm(next);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Scale className="w-8 h-8 text-muted/30" />, label: t("empty") }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: rows === undefined,
          onPageChange: setPage,
          labels: {
            empty: t("empty"),
            showing: (_start, _end, total) => t("showing", { count: total }),
          },
        }}
        columns={[
          {
            key: "decision",
            header: t("columnDecision"),
            className: "w-[38%]",
            cell: (row) => (
              <>
                <Link href={detailHref(row)} className="text-[13px] font-semibold text-foreground transition-colors hover:text-brand">
                  {nameOf(row)}
                </Link>
                <div className="mt-0.5 text-[12px] leading-relaxed text-secondary">
                  {tDecisions(`catalogue.${row.copyKey}.description`)}
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted">
                  {tDecisions(`catalogue.${row.copyKey}.rule`)} {t(`stakes.${row.stakes}`)}
                </div>
              </>
            ),
          },
          {
            key: "usedIn",
            header: t("columnUsedIn"),
            className: "w-[12%]",
            cell: (row) => <span className="text-[13px] text-foreground">{tDecisions(`usedIn.${row.usedIn}`)}</span>,
          },
          {
            key: "thisWeek",
            header: t("columnThisWeek"),
            className: "w-[18%]",
            cell: (row) => (
              <>
                <div className="text-[13px] text-foreground">
                  {row.isCapped ? t("ranAtLeast", { count: row.ranThisWeek }) : t("ran", { count: row.ranThisWeek })}
                </div>
                {row.handedThisWeek > 0 && (
                  <div className="mt-0.5 text-[11px] text-warning">{t("handed", { count: row.handedThisWeek })}</div>
                )}
              </>
            ),
          },
          ...(companyId
            ? [
                {
                  key: "platformMode",
                  header: t("columnPlatformMode"),
                  className: "w-[12%]",
                  cell: (row: DecisionRow) => (
                    <span className="text-[13px] text-secondary">{tDecisions(`modes.${row.platformMode}`)}</span>
                  ),
                },
                {
                  key: "companyMode",
                  header: t("columnCompanyMode"),
                  className: "w-[20%]",
                  cell: (row: DecisionRow) => modeSelect(row),
                },
              ]
            : [
                {
                  key: "mode",
                  header: t("columnMode"),
                  className: "w-[22%]",
                  cell: (row: DecisionRow) => modeSelect(row),
                },
              ]),
        ]}
      />

      <div className="min-w-0">
        <SaveError>{saveError}</SaveError>
      </div>
    </div>
  );
}
