"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import {
  filterPolicies,
  isUnnamed,
  scopeOf,
  sortPolicies,
  type PolicyPriority,
  type PolicyScope,
} from "@/convex/governancePolicyService";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import {
  PaginationFooter,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";

/**
 * Every rule currently governing what the AI may do, as a record.
 *
 * Read-only on purpose, and the duplication with the AI Instructions screen is
 * the point rather than an oversight. A compliance officer needs to see what is
 * in force; an AI administrator needs to change it. They are different people
 * asking different questions, and a single screen serving both ends up serving
 * neither — so this one lists and the other one edits.
 *
 * It listed and did nothing else: no way to search it, narrow it or page
 * through it, and a second table built inside the standard shell's own, which
 * is why it never matched the rest of the section. Now it is the same table
 * every other admin screen uses.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const PRIORITIES: Array<PolicyPriority | "ALL"> = ["ALL", "CRITICAL", "HIGH", "NORMAL", "LOW"];
const SCOPES: Array<PolicyScope | "ALL"> = ["ALL", "EVERYWHERE", "WORKSPACE", "AGENT"];

export default function GovernancePoliciesPage() {
  const t = useTranslations("admin.governance.policies");
  const rules = useQuery(api.aiRules.getRules, {});

  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState<PolicyPriority | "ALL">("ALL");
  const [scope, setScope] = useState<PolicyScope | "ALL">("ALL");
  const [page, setPage] = useState(1);

  const active = useMemo(() => rules?.filter((rule) => rule.isActive), [rules]);

  const visible = useMemo(
    () => (active ? sortPolicies(filterPolicies(active, { search, priority, scope })) : []),
    [active, search, priority, scope],
  );

  // Narrowing the list moves the reader back to the front of it.
  const narrow = <T,>(apply: () => T) => {
    setPage(1);
    return apply();
  };

  const paged = paginateItems(visible, page, TABLE_PAGE_SIZE);
  const filtering = search.trim() !== "" || priority !== "ALL" || scope !== "ALL";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<ScrollText className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[240px] flex-1">
          <SearchBar
            value={search}
            onChange={(value) => narrow(() => setSearch(value))}
            placeholder={t("searchPlaceholder")}
          />
        </div>

        <Select
          id="policy-priority"
          value={priority}
          onChange={(next) => narrow(() => setPriority(next as PolicyPriority | "ALL"))}
          aria-label={t("filters.priorityLabel")}
          className="w-[160px]"
        >
          {PRIORITIES.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? t("filters.allPriorities") : t(`priority.${option}`)}
            </option>
          ))}
        </Select>

        <Select
          id="policy-scope"
          value={scope}
          onChange={(next) => narrow(() => setScope(next as PolicyScope | "ALL"))}
          aria-label={t("filters.scopeLabel")}
          className="w-[190px]"
        >
          {SCOPES.map((option) => (
            <option key={option} value={option}>
              {option === "ALL" ? t("filters.allScopes") : t(`scope.${option}`)}
            </option>
          ))}
        </Select>

        {filtering ? (
          <button
            type="button"
            onClick={() =>
              narrow(() => {
                setSearch("");
                setPriority("ALL");
                setScope("ALL");
              })
            }
            className="h-[38px] rounded-[10px] px-3 text-[13px] text-secondary transition-colors hover:text-foreground"
          >
            {t("filters.clear")}
          </button>
        ) : null}
      </div>

      <TableShell
        minWidthClassName="min-w-[820px]"
        footer={
          <PaginationFooter
            page={paged.page}
            totalPages={paged.totalPages}
            totalCount={paged.totalItems}
            pageSize={paged.pageSize}
            isLoading={active === undefined}
            onPageChange={setPage}
            labels={{
              previous: t("pagination.previous"),
              next: t("pagination.next"),
              empty: filtering ? t("noMatches") : t("empty"),
              page: (current, total) => t("pagination.page", { page: current, total }),
              showing: (start, end, total) => t("pagination.showing", { start, end, total }),
            }}
          />
        }
      >
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("table.name")}</TableHeaderCell>
            <TableHeaderCell>{t("table.applies")}</TableHeaderCell>
            <TableHeaderCell>{t("table.priority")}</TableHeaderCell>
            <TableHeaderCell>{t("table.instruction")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {active === undefined ? (
            <TableLoadingRow colSpan={4} />
          ) : paged.items.length === 0 ? (
            <TableEmptyRow
              colSpan={4}
              icon={<ScrollText className="w-5 h-5" />}
              /* Nothing matched and nothing exists are different answers. */
              label={filtering ? t("noMatches") : t("empty")}
            />
          ) : (
            paged.items.map((rule) => (
              <tr
                key={rule._id}
                className="border-b border-border-dim/50 last:border-0 transition-colors hover:bg-foreground/[0.02]"
              >
                <td className="px-4 py-3 max-w-[240px]">
                  {isUnnamed(rule) ? (
                    /* An unnamed rule is not a display problem to paper over —
                       a critical rule governing everything that nobody has
                       named is a small governance gap of its own. */
                    <span className="block text-[13px] font-medium text-[#b45309] dark:text-[#fbbf24]">
                      {t("table.unnamed")}
                    </span>
                  ) : (
                    <span className="block text-[13px] font-medium text-foreground">{rule.name}</span>
                  )}
                  <span className="mt-0.5 block truncate text-[12px] text-muted">{rule.trigger}</span>
                </td>
                <td className="px-4 py-3 text-[12px] text-secondary">
                  {/* Said in words rather than as a scope code, because the
                      reader here is not the person who set it up. */}
                  {t(`scope.${scopeOf(rule)}`)}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`flex w-fit items-center rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                      rule.priority === "CRITICAL"
                        ? "border-[#fbbf24]/40 bg-[#fbbf24]/10 text-[#b45309] dark:text-[#fbbf24]"
                        : "border-border-dim bg-foreground/5 text-foreground/80"
                    }`}
                  >
                    {t(`priority.${rule.priority}`)}
                  </span>
                </td>
                <td className="max-w-[380px] px-4 py-3 text-[12px] text-secondary">
                  <span className="line-clamp-2">{rule.instruction}</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
