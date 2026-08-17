"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { Filter, Inbox, Loader2, MailCheck, Search, ShieldCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  PaginationFooter,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TABLE_PAGE_SIZE, matchesSearchTerm, paginateItems } from "@/src/ui/components/screens/pagination";
import { formatDateTime } from "@/src/lib/dates";

type AuthDiagnosticsEvent = {
  _id: Id<"authEvents">;
  email: string;
  eventType: string;
  timestamp: number;
  companyId?: Id<"companies">;
  companyName: string | null;
  userId?: Id<"users">;
  inviteId?: Id<"invitations">;
  provider?: string;
  reasonCode?: string;
};

const authEventTypes = [
  "MAGIC_LINK_REQUESTED",
  "MAGIC_LINK_STARTED",
  "INVITE_FOUND",
  "INVITE_MISSING",
  "INVITE_EXPIRED",
  "INVITE_REVOKED",
  "INVITE_STALE_ACCEPTED_RECOVERED",
  "USER_FOUND",
  "EMAIL_DISPATCH_SIMULATED",
  "EMAIL_DISPATCH_STARTED",
  "EMAIL_DISPATCH_FAILED",
  "MAGIC_LINK_VERIFIED",
  "OAUTH_VERIFIED",
];

function formatCode(value: string | null | undefined) {
  if (!value) return "N/A";
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getTimeFilterCutoff(filter: string) {
  if (filter === "24h") return Date.now() - 24 * 60 * 60 * 1000;
  if (filter === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
  if (filter === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000;
  return 0;
}

export function AuthDiagnosticsPage() {
  const t = useTranslations("admin.authDiagnostics");
  const common = useTranslations("common");
  const currentUser = useQuery(api.users.getMe);
  const canReadDiagnostics = currentUser?.role === "ADMIN" || currentUser?.role === "SUPER_ADMIN";
  const events = useQuery(api.authEvents.getRecentAuthEvents, canReadDiagnostics ? {} : "skip") as
    | AuthDiagnosticsEvent[]
    | undefined;

  const [searchTerm, setSearchTerm] = useState("");
  const [eventType, setEventType] = useState("all");
  const [companyId, setCompanyId] = useState("all");
  const [timeFilter, setTimeFilter] = useState("7d");
  const [page, setPage] = useState(1);

  const companyOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const event of events ?? []) {
      if (event.companyId) {
        options.set(event.companyId, event.companyName ?? event.companyId);
      }
    }
    return Array.from(options, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  const filteredEvents = useMemo(() => {
    const cutoff = getTimeFilterCutoff(timeFilter);

    return (events ?? []).filter((event) => {
      if (event.timestamp < cutoff) return false;
      if (eventType !== "all" && event.eventType !== eventType) return false;
      if (companyId !== "all" && event.companyId !== companyId) return false;
      return matchesSearchTerm(searchTerm, [
        event.email,
        event.eventType,
        event.reasonCode,
        event.provider,
        event.companyName,
        event.userId,
        event.inviteId,
      ]);
    });
  }, [companyId, eventType, events, searchTerm, timeFilter]);

  const paginated = paginateItems(filteredEvents, page, TABLE_PAGE_SIZE);
  const isLoading = currentUser === undefined || (canReadDiagnostics && events === undefined);

  if (currentUser !== undefined && !canReadDiagnostics) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <ShieldCheck className="h-8 w-8 text-muted" />
          <h1 className="text-lg font-semibold text-foreground">{t("restrictedTitle")}</h1>
          <p className="text-[13px] leading-relaxed text-secondary">{t("restrictedDescription")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-5 pb-12">
      <PageHeader
        icon={<MailCheck className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("description")}
      />

      <div className="grid grid-cols-1 gap-3 rounded-[16px] border border-border-dim bg-sidebar/40 p-3 backdrop-blur-xl lg:grid-cols-[minmax(240px,1fr)_180px_180px_180px]">
        <div className="flex items-center gap-3 rounded-[10px] border border-border-dim bg-background px-3 py-2 text-secondary focus-within:border-brand/50 focus-within:text-foreground">
          <Search className="h-[18px] w-[18px]" />
          <input
            type="text"
            placeholder={t("filters.searchPlaceholder")}
            value={searchTerm}
            onChange={(event) => {
              setSearchTerm(event.target.value);
              setPage(1);
            }}
            className="w-full border-none bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted"
          />
        </div>

        <label className="flex items-center gap-2 rounded-[10px] border border-border-dim bg-background px-3 py-2 text-secondary">
          <Filter className="h-4 w-4" />
          <select
            value={eventType}
            onChange={(event) => {
              setEventType(event.target.value);
              setPage(1);
            }}
            className="w-full appearance-none border-none bg-transparent text-[13px] text-foreground outline-none"
            aria-label={t("filters.eventType")}
          >
            <option value="all">{t("filters.allEvents")}</option>
            {authEventTypes.map((type) => (
              <option key={type} value={type}>
                {formatCode(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 rounded-[10px] border border-border-dim bg-background px-3 py-2 text-secondary">
          <Filter className="h-4 w-4" />
          <select
            value={timeFilter}
            onChange={(event) => {
              setTimeFilter(event.target.value);
              setPage(1);
            }}
            className="w-full appearance-none border-none bg-transparent text-[13px] text-foreground outline-none"
            aria-label={t("filters.time")}
          >
            <option value="24h">{t("filters.last24h")}</option>
            <option value="7d">{t("filters.last7d")}</option>
            <option value="30d">{t("filters.last30d")}</option>
            <option value="all">{t("filters.allTime")}</option>
          </select>
        </label>

        {currentUser?.role === "SUPER_ADMIN" ? (
          <label className="flex items-center gap-2 rounded-[10px] border border-border-dim bg-background px-3 py-2 text-secondary">
            <Filter className="h-4 w-4" />
            <select
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setPage(1);
              }}
              className="w-full appearance-none border-none bg-transparent text-[13px] text-foreground outline-none"
              aria-label={t("filters.company")}
            >
              <option value="all">{t("filters.allCompanies")}</option>
              {companyOptions.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <TableShell
        minWidthClassName="min-w-[1120px]"
        footer={
          <PaginationFooter
            page={paginated.page}
            totalPages={paginated.totalPages}
            totalCount={paginated.totalItems}
            pageSize={paginated.pageSize}
            isLoading={isLoading}
            onPageChange={setPage}
            labels={{
              previous: common("pagination.previous"),
              next: common("pagination.next"),
              empty: t("table.empty"),
              showing: (start, end, total) => t("pagination.showing", { start, end, total }),
              page: (current, total) => t("pagination.page", { current, total }),
            }}
          />
        }
      >
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>{t("table.event")}</TableHeaderCell>
            <TableHeaderCell>{t("table.email")}</TableHeaderCell>
            <TableHeaderCell>{t("table.company")}</TableHeaderCell>
            <TableHeaderCell>{t("table.reason")}</TableHeaderCell>
            <TableHeaderCell>{t("table.provider")}</TableHeaderCell>
            <TableHeaderCell align="right">{t("table.timestamp")}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={6} className="px-5 py-16 text-center text-secondary">
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-brand opacity-80" />
              </td>
            </tr>
          ) : paginated.items.length === 0 ? (
            <TableEmptyRow
              colSpan={6}
              icon={<Inbox className="h-8 w-8 text-muted" />}
              label={filteredEvents.length === 0 && (events?.length ?? 0) > 0 ? t("table.noMatches") : t("table.empty")}
            />
          ) : (
            paginated.items.map((event) => (
              <tr key={event._id} className="border-b border-border-dim/50 transition-colors hover:bg-foreground/[0.02]">
                <td className="px-4 py-3">
                  <span className="rounded-[4px] border border-border-dim bg-foreground/5 px-2 py-1 text-[10px] font-medium uppercase tracking-widest text-foreground">
                    {formatCode(event.eventType)}
                  </span>
                </td>
                <td className="px-4 py-3 text-[13px] font-medium text-foreground">{event.email}</td>
                <td className="px-4 py-3 text-[12px] text-secondary">{event.companyName ?? t("table.unscoped")}</td>
                <td className="px-4 py-3 text-[12px] text-secondary">{formatCode(event.reasonCode)}</td>
                <td className="px-4 py-3 text-[12px] text-secondary">{event.provider ?? t("table.unknownProvider")}</td>
                <td className="px-4 py-3 text-right text-[12px] text-secondary">
                  {formatDateTime(event.timestamp, {
                    options: { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" },
                  })}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </TableShell>
    </div>
  );
}
