"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ArrowDown, Bolt, ClipboardList, Globe, UserCheck } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import {
  filterRegister,
  sortRegisterBy,
  type AiSystemEntry,
  type AiSystemKind,
  type RegisterSort,
} from "@/convex/governanceRegisterService";
import { RegisterEntryPanel } from "./RegisterEntryPanel";
import { Button } from "@/src/ui/atoms/Button";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Select } from "@/src/ui/components/screens/Select";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";
import { formatDate } from "@/src/lib/dates";

/**
 * Every AI system running here, in one list.
 *
 * Nothing on this screen is filed by hand — it reads what exists, so a widget
 * published this morning is on it this morning. Anything nobody has described
 * or taken responsibility for sorts to the top and says so in a sentence,
 * because an incomplete record is the only thing here that needs a person.
 *
 * Because the list builds itself it also grows on its own, and it first shipped
 * as one unbroken table with no way to search it, narrow it or page through it
 * — Anthony, 2026-08-06: *"the UX is not great."* It also nested a second table
 * inside the standard shell's own, which is why it never quite matched the
 * other admin screens. Both fixed: this is now the same table every other
 * screen in the section uses.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const KINDS: Array<AiSystemKind | "ALL"> = ["ALL", "ASSISTANT", "WIDGET", "WORKFLOW"];

/**
 * The counts, and what each one narrows the list to.
 *
 * The screen used to carry six count boxes across the top and a separate row of
 * filters underneath doing the same job, which spent a third of the page saying
 * everything twice. A count nobody can act on is decoration; a count that
 * filters the list is the fastest control on the screen.
 */
type CountChip = {
  key: string;
  count: number | undefined;
  /** Whether a figure above nought is a problem, and should read as one. */
  needsAttention?: boolean;
  narrows: (entry: AiSystemEntry) => boolean;
};

export default function AiRegisterPage() {
  const t = useTranslations("admin.governance.register");
  const register = useQuery(api.governanceRegister.getAiRegister);

  const [search, setSearch] = useState("");
  const [chip, setChip] = useState("total");
  const [kind, setKind] = useState<AiSystemKind | "ALL">("ALL");
  const [sort, setSort] = useState<RegisterSort>("ATTENTION");
  const [page, setPage] = useState(1);
  const [opened, setOpened] = useState<AiSystemEntry | null>(null);

  const entries = register?.entries;
  const summary = register?.summary;

  const chips: CountChip[] = [
    { key: "total", count: summary?.total, narrows: () => true },
    {
      key: "incomplete",
      count: summary?.incomplete,
      needsAttention: true,
      narrows: (entry) => entry.missing.length > 0,
    },
    {
      key: "unrated",
      count: summary?.unrated,
      needsAttention: true,
      narrows: (entry) => entry.risk === "UNRATED",
    },
    { key: "highRisk", count: summary?.highRisk, narrows: (entry) => entry.risk === "HIGH" },
    { key: "publicFacing", count: summary?.publicFacing, narrows: (entry) => entry.facesPublic },
    { key: "unattended", count: summary?.unattended, narrows: (entry) => !entry.humanApproves },
  ];

  const narrows = chips.find((option) => option.key === chip)?.narrows ?? (() => true);

  const visible = useMemo(() => {
    if (!entries) return [];

    const matched = filterRegister(entries, {
      search,
      risk: "ALL",
      kind,
      attentionOnly: false,
    }).filter(narrows);

    return sortRegisterBy(matched, sort);
    // `narrows` is derived from `chip`, which is what actually changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, search, kind, chip, sort]);

  // Narrowing the list moves the reader back to the front of it. Staying on
  // page four of a list that is now one page long shows an empty table over a
  // filter that plainly matched something.
  const narrow = <T,>(apply: () => T) => {
    setPage(1);
    return apply();
  };

  const paged = paginateItems(visible, page, TABLE_PAGE_SIZE);
  const filtering = search.trim() !== "" || chip !== "total" || kind !== "ALL";


  /** A heading that reorders the list, with the one in force saying so. */
  // Returns the button alone: DataTable owns the header cell around it.
  const SortableHeader = ({ label, by }: { label: string; by: RegisterSort }) => (
    // Stays raw: a bare sort-header text control inheriting the header cell's type — matches no variant.
    <button
        type="button"
        onClick={() => narrow(() => setSort(sort === by ? "ATTENTION" : by))}
        aria-pressed={sort === by}
        className={`flex items-center gap-1 uppercase tracking-[0.1em] transition-colors hover:text-foreground ${
          sort === by ? "text-foreground" : ""
        }`}
      >
      {label}
      {sort === by ? <ArrowDown className="h-3 w-3" aria-hidden="true" /> : null}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ClipboardList className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <DataTable
        rows={entries === undefined ? undefined : paged.items}
        rowKey={(entry) => entry.id}
        minWidthClassName="min-w-[900px]"
        onRowClick={(entry) => setOpened(entry)}
        search={{
          value: search,
          onChange: (value) => narrow(() => setSearch(value)),
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <>
            {/*
              The counts are the filters. Six boxes at the top and a separate
              filter row underneath were two controls doing one job, and the boxes
              were the half that could not be pressed.
            */}
            {chips.map((option) => {
              const active = chip === option.key;
              const flagged = option.needsAttention && (option.count ?? 0) > 0;

              return (
                // Stays raw: an aria-pressed summary chip with selection and attention colours — matches no variant.
                <button
                  key={option.key}
                  type="button"
                  onClick={() => narrow(() => setChip(option.key))}
                  aria-pressed={active}
                  className={`flex h-[34px] items-center gap-2 rounded-full border px-3.5 text-[12px] transition-colors ${
                    active
                      ? "border-foreground/40 text-foreground"
                      : flagged
                        ? "border-[#fbbf24]/40 text-[#b45309] hover:border-[#fbbf24]/70 dark:text-[#fbbf24]"
                        : "border-border-dim text-secondary hover:border-foreground/20"
                  }`}
                >
                  {t(`summary.${option.key}`)}
                  <span className="tabular-nums font-medium">{option.count ?? "—"}</span>
                </button>
              );
            })}

            <label className="sr-only" htmlFor="register-kind">
              {t("filters.kindLabel")}
            </label>
            <Select
              id="register-kind"
              value={kind}
              onChange={(next) => narrow(() => setKind(next as AiSystemKind | "ALL"))}
              className="w-[150px]"
            >
              {KINDS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? t("filters.allKinds") : t(`kind.${option}`)}
                </option>
              ))}
            </Select>

            {filtering ? (
              <Button
                variant="ghost"
                onClick={() =>
                  narrow(() => {
                    setSearch("");
                    setChip("total");
                    setKind("ALL");
                  })
                }
                className="h-[34px] rounded-[10px] px-3 py-0 font-normal hover:bg-transparent"
              >
                {t("filters.clear")}
              </Button>
            ) : null}
          </>
        }
        /* Nothing matched and nothing exists are different answers, and only one
           of them means the filters are doing their job. */
        empty={{
          icon: <ClipboardList className="w-5 h-5" />,
          label: filtering ? t("noMatches") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: entries === undefined,
          onPageChange: setPage,
          labels: {
            previous: t("pagination.previous"),
            next: t("pagination.next"),
            empty: filtering ? t("pagination.noMatches") : t("pagination.empty"),
            page: (current, total) => t("pagination.page", { page: current, total }),
            showing: (start, end, total) => t("pagination.showing", { start, end, total }),
          },
        }}
        columns={[
          {
            key: "system",
            header: <SortableHeader label={t("table.system")} by="NAME" />,
            className: "max-w-[340px]",
            cell: (entry) => (
              <>
                <span className="block text-[13px] font-medium leading-tight text-foreground">
                  {entry.name}
                </span>
                <span
                  className={`mt-0.5 block truncate text-[12px] ${
                    entry.purpose ? "text-secondary" : "text-[#b45309] dark:text-[#fbbf24]"
                  }`}
                >
                  {entry.purpose || t("noPurpose")}
                </span>
              </>
            ),
          },
          {
            key: "kind",
            header: t("table.kind"),
            cell: (entry) => (
              <>
                <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                  {entry.facesPublic ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                  {t(`kind.${entry.kind}`)}
                </span>
                {entry.model ? (
                  <span className="mt-0.5 block truncate text-[11px] text-muted">{entry.model}</span>
                ) : null}
              </>
            ),
          },
          {
            key: "risk",
            header: <SortableHeader label={t("table.risk")} by="RISK" />,
            /*
              The platform's chip, with the amber kept for the ratings that
              actually ask for something. A text label always — colour on its
              own would be carrying meaning nobody can rely on.
            */
            cell: (entry) => (
              <span
                className={`flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${
                  entry.risk === "HIGH" || entry.risk === "UNRATED"
                    ? "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#b45309] dark:text-[#fbbf24]"
                    : "border-border-dim bg-foreground/5 text-foreground/80"
                }`}
              >
                {t(`risk.${entry.risk}`)}
              </span>
            ),
          },
          {
            key: "owner",
            header: t("table.owner"),
            cell: (entry) =>
              entry.ownerName ? (
                <span className="text-[12px] text-secondary">{entry.ownerName}</span>
              ) : (
                <span className="text-[12px] text-[#b45309] dark:text-[#fbbf24]">{t("noOwner")}</span>
              ),
          },
          {
            key: "oversight",
            header: t("table.oversight"),
            cell: (entry) => (
              <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                {entry.humanApproves ? (
                  <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Bolt className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {entry.humanApproves ? t("oversight.human") : t("oversight.unattended")}
              </span>
            ),
          },
          {
            key: "activity",
            header: <SortableHeader label={t("table.activity")} by="ACTIVITY" />,
            cell: (entry) =>
              typeof entry.activity === "number" ? (
                <span className={`text-[12px] ${entry.activity > 0 ? "text-foreground" : "text-muted"}`}>
                  {t("table.runs", { count: entry.activity })}
                </span>
              ) : (
                /* A widget is not run the way an assistant is, and printing
                   nought would claim it sat idle rather than that the idea does
                   not apply to it. */
                <span className="text-[12px] text-muted">—</span>
              ),
          },
          {
            key: "lastActive",
            header: <SortableHeader label={t("table.lastActive")} by="LAST_ACTIVE" />,
            cell: (entry) => (
              <span className="text-[12px] text-secondary">
                {entry.lastActiveAt ? formatDate(entry.lastActiveAt) : "—"}
              </span>
            ),
          },
        ]}
      />

      <RegisterEntryPanel entry={opened} onClose={() => setOpened(null)} />
    </div>
  );
}
