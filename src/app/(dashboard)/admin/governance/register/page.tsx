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
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminPaginationFooter,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { AdminSelect } from "@/src/app/(dashboard)/admin/_components/AdminSelect";
import { ADMIN_PAGE_SIZE, paginateAdminItems } from "@/src/app/(dashboard)/admin/_lib/pagination";
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

  const paged = paginateAdminItems(visible, page, ADMIN_PAGE_SIZE);
  const filtering = search.trim() !== "" || chip !== "total" || kind !== "ALL";


  /** A heading that reorders the list, with the one in force saying so. */
  const SortableHeader = ({ label, by }: { label: string; by: RegisterSort }) => (
    <AdminTableHeaderCell>
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
    </AdminTableHeaderCell>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        icon={<ClipboardList className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <div className="flex flex-col gap-3">
        <AdminSearchBar
          value={search}
          onChange={(value) => narrow(() => setSearch(value))}
          placeholder={t("searchPlaceholder")}
        />

        <div className="flex flex-wrap items-center gap-2">
          {/*
            The counts are the filters. Six boxes at the top and a separate
            filter row underneath were two controls doing one job, and the boxes
            were the half that could not be pressed.
          */}
          {chips.map((option) => {
            const active = chip === option.key;
            const flagged = option.needsAttention && (option.count ?? 0) > 0;

            return (
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
          <AdminSelect
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
          </AdminSelect>

          {filtering ? (
            <button
              type="button"
              onClick={() =>
                narrow(() => {
                  setSearch("");
                  setChip("total");
                  setKind("ALL");
                })
              }
              className="h-[34px] rounded-[10px] px-3 text-[13px] text-secondary transition-colors hover:text-foreground"
            >
              {t("filters.clear")}
            </button>
          ) : null}
        </div>
      </div>

      <AdminTableShell
        minWidthClassName="min-w-[900px]"
        footer={
          <AdminPaginationFooter
            page={paged.page}
            totalPages={paged.totalPages}
            totalCount={paged.totalItems}
            pageSize={paged.pageSize}
            isLoading={entries === undefined}
            onPageChange={setPage}
            labels={{
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              empty: filtering ? t("pagination.noMatches") : t("pagination.empty"),
              page: (current, total) => t("pagination.page", { page: current, total }),
              showing: (start, end, total) => t("pagination.showing", { start, end, total }),
            }}
          />
        }
      >
        <thead>
          <AdminTableHeaderRow>
            <SortableHeader label={t("table.system")} by="NAME" />
            <AdminTableHeaderCell>{t("table.kind")}</AdminTableHeaderCell>
            <SortableHeader label={t("table.risk")} by="RISK" />
            <AdminTableHeaderCell>{t("table.owner")}</AdminTableHeaderCell>
            <AdminTableHeaderCell>{t("table.oversight")}</AdminTableHeaderCell>
            <SortableHeader label={t("table.activity")} by="ACTIVITY" />
            <SortableHeader label={t("table.lastActive")} by="LAST_ACTIVE" />
          </AdminTableHeaderRow>
        </thead>
        <tbody>
          {entries === undefined ? (
            <AdminTableLoadingRow colSpan={7} />
          ) : paged.items.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={7}
              icon={<ClipboardList className="w-5 h-5" />}
              /* Nothing matched and nothing exists are different answers, and
                 only one of them means the filters are doing their job. */
              label={filtering ? t("noMatches") : t("empty")}
            />
          ) : (
            paged.items.map((entry) => (
              /*
                The ordinary admin row, and nothing else. This table used to
                wash whole rows in amber and stack three lines of prose in the
                first cell, which made it the only table on the platform that
                looked like this — Anthony, 2026-08-06: *"its not standard no
                other table in the platform does it."*

                Nothing was lost by stopping. What a row is missing already has
                its own columns saying so in words: no rating shows in Risk, and
                nobody accountable shows in Accountable. The tint was repeating
                what the cells were already telling you, in the one visual
                language a compliance screen should avoid leaning on.
              */
              <tr
                key={entry.id}
                onClick={() => setOpened(entry)}
                className="group cursor-pointer border-b border-border-dim/50 last:border-0 transition-colors hover:bg-foreground/[0.02]"
              >
                <td className="px-4 py-2.5 max-w-[340px]">
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
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                    {entry.facesPublic ? <Globe className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                    {t(`kind.${entry.kind}`)}
                  </span>
                  {entry.model ? (
                    <span className="mt-0.5 block truncate text-[11px] text-muted">{entry.model}</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5">
                  {/*
                    The platform's chip, with the amber kept for the ratings that
                    actually ask for something. A text label always — colour on
                    its own would be carrying meaning nobody can rely on.
                  */}
                  <span
                    className={`flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${
                      entry.risk === "HIGH" || entry.risk === "UNRATED"
                        ? "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#b45309] dark:text-[#fbbf24]"
                        : "border-border-dim bg-foreground/5 text-foreground/80"
                    }`}
                  >
                    {t(`risk.${entry.risk}`)}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[12px]">
                  {entry.ownerName ? (
                    <span className="text-secondary">{entry.ownerName}</span>
                  ) : (
                    <span className="text-[#b45309] dark:text-[#fbbf24]">{t("noOwner")}</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5 text-[12px] text-secondary">
                    {entry.humanApproves ? (
                      <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Bolt className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {entry.humanApproves ? t("oversight.human") : t("oversight.unattended")}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-[12px]">
                  {typeof entry.activity === "number" ? (
                    <span className={entry.activity > 0 ? "text-foreground" : "text-muted"}>
                      {t("table.runs", { count: entry.activity })}
                    </span>
                  ) : (
                    /* A widget is not run the way an assistant is, and printing
                       nought would claim it sat idle rather than that the idea
                       does not apply to it. */
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-[12px] text-secondary">
                  {entry.lastActiveAt ? formatDate(entry.lastActiveAt) : "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </AdminTableShell>

      <RegisterEntryPanel entry={opened} onClose={() => setOpened(null)} />
    </div>
  );
}
