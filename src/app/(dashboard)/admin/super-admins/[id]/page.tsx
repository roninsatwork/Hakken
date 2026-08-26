"use client";

import { useQuery, usePaginatedQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import type { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, User, ShieldCheck, ShieldAlert, Loader2, MessageSquare, MonitorSmartphone, MapPin } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { describeDevice } from "@/src/lib/devices";
import { useTranslations } from "next-intl";
import { IncompleteFiguresNotice } from "@/src/ui/components/screens/IncompleteFiguresNotice";

export default function UserProfilePage() {
  const t = useTranslations("admin.superAdmins.profile");
  const params = useParams();
  const userId = params.id as Id<"users">;

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"logins" | "costs">("costs");

  const { results: logins, status, loadMore } = usePaginatedQuery(
    api.users.getUserLogins,
    activeTab === "logins" ? { userId, searchTerm } : "skip",
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  const pagedLogins = usePagedRows(logins, {
    canLoadMore: status === "CanLoadMore",
    loadMore,
    resetKey: searchTerm,
  });

  // Assume user exists for the deep link
  const user = useQuery(api.users.getUserById, { id: userId });

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-t-2 border-brand animate-spin" />
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <ShieldAlert className="w-12 h-12 text-red-500/50" />
        <h2 className="text-xl font-medium text-foreground">{t("notFound")}</h2>
        <Link href="/admin/users" className="text-sm text-secondary hover:text-foreground">
          &larr; {t("returnToDirectory")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-8 relative z-10">
      
      {/* Header Section */}
      <PageHeader
        icon={<User className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
        action={
          <div className="flex items-center gap-4">
            <Link
              href="/admin/users"
              className="px-5 py-2 rounded-[10px] bg-foreground/5 text-foreground font-medium hover:bg-foreground/10 transition-all text-[13px] flex items-center gap-2 border border-border-dim/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("backToDirectory")}
            </Link>
          </div>
        }
      />

      {/* Profile Info Grid */}
      <div className="w-full mt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-x-12 gap-y-8 w-full">
          
          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t("fullName")}</label>
            <div className="text-[15px] font-medium text-foreground flex items-center">
              {user.name || t("unnamedUser")}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[11px] font-medium text-secondary uppercase tracking-widest flex items-center justify-between">
              <span>{t("email")}</span>
              <span className="text-[9px] bg-foreground/10 px-2 py-0.5 rounded-sm text-foreground/70 tracking-normal">{t("verified")}</span>
            </label>
            <div className="text-[15px] text-foreground flex items-center">
              {user.email || t("noEmail")}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t("systemRole")}</label>
            <div className="flex items-center gap-2 text-foreground">
              {user.role === 'ADMIN' ? <ShieldCheck className="w-4 h-4 text-brand" /> : <User className="w-4 h-4 text-foreground/70" />}
              <span className="text-[13px] font-mono font-medium tracking-wide">{user.role || 'USER'}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 w-full">
            <label className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t("profilePhoto")}</label>
            <div className="flex items-center gap-4 w-full h-full">
              {user.image ? (
                <Image
                  src={user.image}
                  alt={user.name ?? user.email ?? "User avatar"}
                  width={44}
                  height={44}
                  unoptimized
                  className="w-11 h-11 rounded-full object-cover border border-border-dim shrink-0 shadow-sm"
                />
              ) : (
                <div className="w-11 h-11 rounded-full border border-dashed border-border-dim flex items-center justify-center bg-foreground/5 shrink-0">
                  <User className="w-5 h-5 text-muted" />
                </div>
              )}
              <div className="flex flex-col items-start gap-1">
                <span className="text-[13px] font-medium text-foreground">{t("currentAvatar")}</span>
                <p className="text-[11px] text-secondary">{t("avatarSource")}</p>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Advanced Details tabs */}
      <div className="w-full flex gap-6 border-b border-border-dim/50 pb-3 mt-6 relative z-10">
        {/* This pair stays raw: underline tabs that turn brand when active — matches no variant. */}
        <button
          onClick={() => setActiveTab("logins")}
          className={`text-[13px] font-medium transition-colors relative ${activeTab === "logins" ? "text-brand" : "text-secondary hover:text-foreground"}`}
        >
          {t("tabLogins")}
          {activeTab === "logins" && <div className="absolute -bottom-[14px] left-0 right-0 h-0.5 bg-brand" />}
        </button>
        <button 
          onClick={() => setActiveTab("costs")}
          className={`text-[13px] font-medium transition-colors relative ${activeTab === "costs" ? "text-brand" : "text-secondary hover:text-foreground"}`}
        >
          {t("tabCosts")}
          {activeTab === "costs" && <div className="absolute -bottom-[14px] left-0 right-0 h-0.5 bg-brand" />}
        </button>
      </div>

      {activeTab === "logins" && (
        <div className="w-full flex flex-col gap-4 mt-4">
          {/* Recent Login Activity */}
          <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-[15px] font-medium text-foreground tracking-wide">{t("loginActivity")}</h3>
              <p className="text-[12px] text-secondary mt-0.5">{t("loginActivitySub")}</p>
            </div>
            
            <div className="w-full sm:w-[260px] flex">
              <TableSearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder={t("searchLogins")}
                clearLabel={t("clearSearch")}
              />
            </div>
          </div>

          <DataTable
            rows={status === "LoadingFirstPage" ? undefined : pagedLogins.pageRows}
            rowKey={(login) => login._id}
            variant="panel"
            headerVariant="strip"
            empty={{
              icon: <MonitorSmartphone className="w-8 h-8 text-muted/30" />,
              label: t("noLogins"),
            }}
            footer={{
              mode: "paged",
              page: pagedLogins.page,
              totalPages: pagedLogins.totalPages,
              totalCount: pagedLogins.loadedCount,
              pageSize: pagedLogins.pageSize,
              isLoading: status === "LoadingMore" || status === "LoadingFirstPage",
              onPageChange: pagedLogins.goToPage,
              labels: { empty: t("noLogins") },
            }}
            columns={[
              {
                key: "device",
                header: t("columnDevice"),
                cell: (login) => (
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-foreground/5 border border-border-dim flex items-center justify-center">
                      <MonitorSmartphone className="w-4 h-4 text-foreground/70" />
                    </div>
                    {/* The raw browser string stays in the tooltip as evidence;
                        the row shows what a person can read. */}
                    <span
                      className="text-[13px] font-medium text-foreground tracking-wide"
                      title={login.device}
                    >
                      {describeDevice(login.device)}
                    </span>
                  </div>
                ),
              },
              {
                key: "location",
                header: t("columnLocation"),
                cell: (login) => (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-secondary" />
                    <div className="flex flex-col">
                      <span className="text-[13px] text-foreground">{login.location}</span>
                      <span className="text-[11px] font-mono text-muted">{login.ip}</span>
                    </div>
                  </div>
                ),
              },
              {
                key: "status",
                header: t("columnStatus"),
                cell: (login) => (
                  <div className="flex items-center gap-1.5">
                    {/* Blue for a sign-in that worked, amber for one that did
                        not. Green against red is the one pairing this platform
                        does not use, and the word beside it carries the answer
                        regardless. */}
                    <div className={`w-1.5 h-1.5 rounded-full ${login.status === 'SUCCESS' ? 'bg-info' : 'bg-warning'}`} />
                    <span className="text-[12px] text-secondary font-medium tracking-wide">
                      {login.status}
                    </span>
                  </div>
                ),
              },
              {
                key: "timestamp",
                header: t("columnTimestamp"),
                align: "right",
                cell: (login) => (
                  <span className="text-[12px] text-secondary tracking-wide">
                    {formatDateTime(login.timestamp, {
                      options: { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
                    })}
                  </span>
                ),
              },
            ]}
          />
        </div>
        </div>
      )}

      {activeTab === "costs" && (
        <AIUserCosts userId={userId} />
      )}

    </div>
  );
}

function AIUserCosts({ userId }: { userId: Id<"users"> }) {
  const t = useTranslations("admin.superAdmins.profile");
  const [searchTerm, setSearchTerm] = useState("");

  const costs = useQuery(api.analytics.getUserCostOverview, { userId });
  const { results: costThreads, status: costThreadStatus, loadMore: loadMoreCostThreads } = usePaginatedQuery(
    api.analytics.getUserCostThreads,
    { userId },
    { initialNumItems: TABLE_PAGE_SIZE }
  );

  // Above the early return: a hook cannot sit behind a condition, or React
  // loses track of which state belongs to which call between renders.
  const pagedThreads = usePagedRows(
    costThreads.filter((t) => t.title.toLowerCase().includes(searchTerm.toLowerCase())),
    {
      canLoadMore: costThreadStatus === "CanLoadMore",
      loadMore: loadMoreCostThreads,
      resetKey: searchTerm,
    }
  );

  if (costs === undefined || costThreadStatus === "LoadingFirstPage") {
    return (
      <div className="flex justify-center p-8 w-full mt-4">
        <Loader2 className="w-5 h-5 animate-spin text-secondary opacity-50" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 mt-4 w-full">
      <IncompleteFiguresNotice coverage={costs?.coverage} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 border border-border-dim/50 rounded-[12px] bg-background/30 flex flex-col gap-2">
          <span className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t("grossCost")}</span>
          <span className="text-2xl font-medium text-foreground">${costs.totalCostGBP.toFixed(4)}</span>
        </div>
        <div className="p-5 border border-border-dim/50 rounded-[12px] bg-background/30 flex flex-col gap-2">
          <span className="text-[11px] font-medium text-secondary uppercase tracking-widest">{t("totalTokens")}</span>
          <span className="text-2xl font-medium text-foreground">{costs.totalTokens.toLocaleString()}</span>
        </div>
      </div>

      <DataTable
        rows={pagedThreads.pageRows}
        rowKey={(thread) => thread.threadId}
        variant="panel"
        headerVariant="strip"
        className="mt-2"
        cardHeader={
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border-dim/50 bg-background/50">
            <div>
              <h3 className="text-[14px] font-medium text-foreground tracking-wide">{t("usageLog")}</h3>
              <p className="text-[12px] text-secondary mt-0.5">{t("usageLogSub")}</p>
            </div>

            <div className="w-full sm:w-[260px] flex">
              <TableSearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder={t("searchConversations")}
                clearLabel={t("clearSearch")}
              />
            </div>
          </div>
        }
        empty={{
          icon: <MessageSquare className="w-8 h-8 text-muted/30" />,
          label: costThreads.length === 0
            ? t("noConversations")
            : t("noConversationsMatch"),
        }}
        footer={{
          mode: "paged",
          page: pagedThreads.page,
          totalPages: pagedThreads.totalPages,
          totalCount: pagedThreads.loadedCount,
          pageSize: pagedThreads.pageSize,
          isLoading: costThreadStatus === "LoadingMore",
          onPageChange: pagedThreads.goToPage,
        }}
        columns={[
          {
            key: "conversation",
            header: t("columnConversation"),
            cell: (thread) => (
              <span className="text-[13px] font-medium text-foreground">{thread.title}</span>
            ),
          },
          {
            key: "date",
            header: t("columnDateStarted"),
            cell: (thread) => (
              <span className="text-[13px] text-secondary">
                {formatDate(thread.createdAt, { options: { month: 'short', day: 'numeric', year: 'numeric' } })}
              </span>
            ),
          },
          {
            key: "messages",
            header: t("columnMessages"),
            cell: (thread) => <span className="text-[13px] text-secondary">{thread.messageCount}</span>,
          },
          {
            key: "tokens",
            header: t("columnTokens"),
            cell: (thread) => (
              <span className="text-[13px] text-secondary">{thread.threadTokens.toLocaleString()}</span>
            ),
          },
          {
            key: "cost",
            header: t("columnCost"),
            align: "right",
            cell: (thread) => (
              <span className="text-[13px] font-medium text-brand">${thread.costGBP.toFixed(4)}</span>
            ),
          },
        ]}
      />
    </div>
  );
}
