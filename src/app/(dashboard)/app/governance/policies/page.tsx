"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { ScrollText } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import {
  filterPolicies,
  sortPolicies,
  type PolicyPriority,
  type PolicyScope,
} from "@/convex/governancePolicyService";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Select } from "@/src/ui/components/screens/Select";
import { TABLE_PAGE_SIZE, paginateItems } from "@/src/ui/components/screens/pagination";

/**
 * The customer's own view of policies.
 *
 * The same screen as the platform one, reaching only this workspace. That
 * split is the product: the pitch is that customers demonstrate *their*
 * compliance, and a customer's compliance officer is not a platform
 * administrator and never will be. Scoping happens in the query, so this
 * cannot show another tenant's records by forgetting a filter here.
 *
 * **The same screen means the same controls.** This shipped without a search
 * box, without filters and without page numbers while the platform's version of
 * it had all three — so the person who has to demonstrate their compliance had
 * the worse of the two tools. Anthony, 2026-08-17, looking at them side by side.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const PRIORITIES: Array<PolicyPriority | "ALL"> = ["ALL", "CRITICAL", "HIGH", "NORMAL"];
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

      <DataTable
        rows={active === undefined ? undefined : paged.items}
        rowKey={(rule) => rule._id}
        minWidthClassName="min-w-[820px]"
        search={{
          value: search,
          onChange: (value) => narrow(() => setSearch(value)),
          placeholder: t("searchPlaceholder"),
        }}
        filters={
          <>
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
          </>
        }
        /* Nothing matched and nothing exists are different answers. */
        empty={{
          icon: <ScrollText className="w-5 h-5" />,
          label: filtering ? t("noMatches") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.totalItems,
          pageSize: paged.pageSize,
          isLoading: active === undefined,
          onPageChange: setPage,
          labels: {
            previous: t("pagination.previous"),
            next: t("pagination.next"),
            empty: filtering ? t("noMatches") : t("empty"),
            page: (current, total) => t("pagination.page", { page: current, total }),
            showing: (start, end, total) => t("pagination.showing", { start, end, total }),
          },
        }}
        columns={[
          {
            key: "name",
            header: t("table.name"),
            cell: (rule) => (
              <span className="text-[13px] font-medium text-foreground">
                {rule.name || t("table.unnamed")}
              </span>
            ),
          },
          {
            key: "applies",
            header: t("table.applies"),
            // Said in words rather than as a scope code, because the reader
            // here is not the person who set it up.
            cell: (rule) => (
              <span className="text-[13px] text-secondary">
                {rule.agentId
                  ? t("scope.agent")
                  : rule.companyId
                    ? t("scope.workspace")
                    : t("scope.everywhere")}
              </span>
            ),
          },
          {
            key: "priority",
            header: t("table.priority"),
            cell: (rule) => <span className="text-[13px] text-secondary">{rule.priority}</span>,
          },
          {
            key: "instruction",
            header: t("table.instruction"),
            className: "max-w-[380px]",
            cell: (rule) => (
              <span className="line-clamp-2 text-[13px] text-secondary">{rule.instruction}</span>
            ),
          },
        ]}
      />
    </div>
  );
}
