"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Coins } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { CreditKind } from "@/convex/creditKinds";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Field } from "@/src/ui/components/screens/Field";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { recentMonths } from "../../../app/usage/_components/usageWords";

/**
 * Admin → Settings → Credit prices (docs/plans/active/usage-credits-plan.md,
 * step 2, board AdminCreditPrices): what each kind of work really cost us
 * this month, every company together, against the credits it charged — and
 * the price each would need, from one setting: what a credit covers.
 *
 * Suggestions never change a price by themselves: "Use" puts one in, Save
 * makes it the price from each company's next run. Nothing charges anyone
 * yet; the prices are what the record counts while costs are watched.
 */

type Report = FunctionReturnType<typeof api.creditPricesAdmin.creditPriceReport>;
type Line = Report["lines"][number];

/** What one unit of a kind of work costs standing alone — what was paid and what sharing saved — in dollars. */
const costPerUnit = (line: Line) => (line.units > 0 ? (line.realCostUsd + line.reusedValueUsd) / line.units : null);
/** Credits for every `per` units that would cover that cost, rounded up and never below one. */
const suggestion = (line: Line, cover: number) => {
  const cost = costPerUnit(line);
  return cost === null ? null : Math.max(1, Math.ceil((cost * line.per) / cover - 1e-9));
};
/** What a credit charged this month cost us, in dollars. */
const perCredit = (line: Line) => (line.charged > 0 ? line.realCostUsd / line.charged : null);

export default function CreditPricesPage() {
  const t = useTranslations("admin.creditPrices");
  const tUsage = useTranslations("usage");
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const [month, setMonth] = useState("");
  // When the page opened: the months it offers, and how far into this one the figures run.
  const [openedAt] = useState(() => Date.now());
  const months = recentMonths(openedAt);
  const report = useQuery(api.creditPricesAdmin.creditPriceReport, month ? { month } : {});
  const save = useMutation(api.creditPricesAdmin.saveCreditPrices);
  const action = useAdminAction({ scope: "admin-credit-prices" });

  const [cover, setCover] = useState<string | null>(null);
  // Credits a month every company's plan gives where its plan sets none (finish-off-plan.md, item 3a).
  const [plan, setPlan] = useState<string | null>(null);
  const [pending, setPending] = useState<Partial<Record<CreditKind, number>>>({});
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const coverText = cover ?? (report ? String(report.settings.creditCoversUsd) : "");
  const coverValue = Number(coverText) > 0 ? Number(coverText) : report?.settings.creditCoversUsd ?? 0.05;
  const planText = plan ?? (report ? String(report.settings.planCredits) : "");

  const number = (value: number) => value.toLocaleString(locale);
  const dollars = (value: number, digits = 2) => `$${value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  const cents = (value: number) => `${(value * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}¢`;
  const kindName = (kind: CreditKind) => tUsage(`kinds.${kind}`, { platformName });
  const covered = (line: Line) => {
    const cost = perCredit(line);
    return cost === null ? null : cost <= coverValue + 1e-12;
  };

  const lines = report?.lines;
  const charged = lines?.reduce((sum, line) => sum + line.charged, 0) ?? 0;
  const real = lines?.reduce((sum, line) => sum + line.realCostUsd, 0) ?? 0;
  const notCovered = lines?.filter((line) => covered(line) === false) ?? [];
  const shown = lines?.filter((line) =>
    (!status || (status === "covered" ? covered(line) === true : status === "notCovered" ? covered(line) === false : covered(line) === null))
    && matchesSearchTerm(search, [kindName(line.kind)]));
  const paged = paginateItems(shown ?? [], page);
  const changed = Object.keys(pending).length > 0 || cover !== null || plan !== null;
  const lastDay = report ? report.endsAt - 1 : 0;

  const onSave = async () => {
    if (!report) return;
    const outcome = await action.run(
      () => save({
        prices: report.lines.map((line) => ({ kind: line.kind, credits: pending[line.kind] ?? line.credits })),
        creditCoversUsd: coverValue,
        // Sent as typed: the server refuses anything but a whole number, and says so.
        ...(plan !== null ? { planCredits: Number(plan.replace(/[,\s]/g, "")) } : {}),
      }),
      { successMessage: t("saved"), fallbackMessage: t("saveFailed"), suppressErrorToast: true },
    );
    if (outcome.ok) {
      setPending({});
      setCover(null);
      setPlan(null);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader divider icon={<Coins className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      <Notice>{t("notice")}</Notice>
      <div className="flex flex-wrap items-center gap-3">
        <Select value={month} onChange={(next) => setMonth(next)} chip={{ label: month ? t("month") : t("thisMonth"), choice: month ? monthName(month, locale) : null }} aria-label={t("month")}>
          <option value="">{t("thisMonth")}</option>
          {months.slice(1).map((value) => <option key={value} value={value}>{monthName(value, locale)}</option>)}
        </Select>
      </div>

      <SettingsCard title={t("settings.title")}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label={t("settings.cover")} hint={t("settings.coverHint")} inputMode="decimal" value={coverText} onChange={(event) => setCover(event.target.value)} />
          <Field label={t("settings.planCredits")} hint={t("settings.planCreditsHint")} inputMode="numeric" value={planText} onChange={(event) => setPlan(event.target.value)} />
        </div>
        <FieldHint>{t("settings.plans")}</FieldHint>
      </SettingsCard>

      <FigureRow>
        <Figure label={t("figures.charged")} value={report ? number(charged) : "…"} detail={report ? t("figures.chargedDetail", { date: new Date(Math.min(openedAt, lastDay)).toLocaleDateString(locale) }) : null} />
        <Figure label={t("figures.real")} value={report ? dollars(real) : "…"} detail={t("figures.realDetail")} />
        <Figure
          label={t("figures.perCredit")}
          value={report && charged > 0 ? cents(real / charged) : "–"}
          detail={report && charged > 0 ? t(real / charged <= coverValue ? "figures.under" : "figures.over", { cover: cents(coverValue) }) : t("figures.nothingYet")}
        />
        <Figure emphasis label={t("figures.notCovered")} value={report ? number(notCovered.length) : "…"} detail={report ? (notCovered.length ? notCovered.map((line) => kindName(line.kind)).join(", ") : t("figures.allCovered")) : null} />
      </FigureRow>

      <DataTable
        rows={shown === undefined ? undefined : paged.items}
        rowKey={(line) => line.kind}
        search={{ value: search, onChange: (next) => { setSearch(next); setPage(1); }, placeholder: t("search") }}
        filters={(
          <Select value={status} onChange={(next) => { setStatus(next); setPage(1); }} chip={{ label: t("status.label"), choice: status ? t(`status.${status}`) : null }}>
            <option value="">{t("status.every")}</option>
            <option value="covered">{t("status.covered")}</option>
            <option value="notCovered">{t("status.notCovered")}</option>
            <option value="none">{t("status.none")}</option>
          </Select>
        )}
        empty={{ icon: <Coins className="h-8 w-8 text-muted/30" />, label: t("noMatch") }}
        cardHeader={(
          <TableBar footer={{ isLoading: report === undefined, totalCount: shown?.length ?? 0 }} noun="kinds">
            <span className="text-[13px] text-secondary">{t("totals", { notCovered: notCovered.length })}</span>
          </TableBar>
        )}
        footer={{ mode: "paged", page: paged.page, totalPages: paged.totalPages, totalCount: paged.totalItems, pageSize: paged.pageSize, isLoading: report === undefined, onPageChange: setPage }}
        columns={[
          {
            key: "work",
            header: t("columns.work"),
            cell: (line) => (
              <span className="flex flex-col">
                <span className="text-[13px] text-foreground">{kindName(line.kind)}</span>
                <span className="text-[12px] text-secondary">{t(`units.${line.kind}`, { per: line.per })}</span>
              </span>
            ),
          },
          { key: "cost", header: t("columns.cost"), align: "right", cell: (line) => <span className="font-mono text-[12px] tabular-nums text-secondary">{costPerUnit(line) === null ? "–" : dollars(costPerUnit(line) ?? 0, 4)}</span> },
          { key: "suggested", header: t("columns.suggested"), align: "right", cell: (line) => <span className="font-mono text-[13px] text-foreground">{suggestion(line, coverValue) ?? "–"}</span> },
          {
            key: "inUse",
            header: t("columns.inUse"),
            align: "right",
            cell: (line) => (
              <span className="flex flex-col items-end">
                <span className="font-mono text-[13px] text-foreground">{number(pending[line.kind] ?? line.credits)}</span>
                {pending[line.kind] !== undefined ? <span className="whitespace-nowrap text-[12px] text-secondary">{t("was", { credits: number(line.credits) })}</span> : null}
              </span>
            ),
          },
          { key: "charged", header: t("columns.charged"), align: "right", cell: (line) => <span className="font-mono text-[12px] tabular-nums">{number(line.charged)}</span> },
          { key: "real", header: t("columns.real"), align: "right", cell: (line) => <span className="font-mono text-[12px] tabular-nums text-secondary">{dollars(line.realCostUsd)}</span> },
          {
            key: "perCredit",
            header: t("columns.perCredit"),
            cell: (line) => {
              const cost = perCredit(line);
              if (cost === null) return <TagLabel>{t("status.none")}</TagLabel>;
              return covered(line)
                ? <StatusLabel tone="success">{t("coveredAt", { cost: cents(cost) })}</StatusLabel>
                : <StatusLabel tone="warning">{t("notCoveredAt", { cost: cents(cost) })}</StatusLabel>;
            },
          },
          {
            key: "use",
            hiddenHeader: t("columns.use"),
            align: "right",
            cell: (line) => {
              const suggested = suggestion(line, coverValue);
              if (suggested === null || suggested === (pending[line.kind] ?? line.credits)) return null;
              return <Button variant="quiet" className="whitespace-nowrap text-[12px]" onClick={() => setPending((before) => ({ ...before, [line.kind]: suggested }))}>{t("use", { credits: number(suggested) })}</Button>;
            },
          },
        ]}
      />

      <SaveError>{action.error}</SaveError>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {changed ? <span className="text-[12px] text-secondary">{t("notSaved")}</span> : null}
        <Button variant="ghost" disabled={!changed} onClick={() => { setPending({}); setCover(null); setPlan(null); }}>{t("discard")}</Button>
        <SaveAction isSaving={action.isBusy()} disabled={!changed || !report} label={t("save")} savingLabel={t("saving")} onClick={() => void onSave()} />
      </div>
    </div>
  );
}

function monthName(month: string, locale: string) {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
}
