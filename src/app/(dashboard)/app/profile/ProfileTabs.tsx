"use client";

import React, { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { PaginationFooter, TableShell, TableHeaderRow, TableHeaderCell } from "@/src/ui/components/screens/Table";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";
import { api } from "@/convex/_generated/api";
import { Loader2, MonitorSmartphone, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { describeDevice } from "@/src/lib/devices";
import { Button } from "@/src/ui/components/screens/Button";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { toneForStatus } from "@/src/ui/components/screens/statusTone";
import { AssistantNoteTab } from "./AssistantNoteTab";
import { CommunicationTab } from "./CommunicationTab";
import { IntegrationsTab } from "./IntegrationsTab";
import { PreferencesTab } from "./PreferencesTab";
import { useSearchParams } from "next/navigation";

export default function ProfileTabs() {
  const t = useTranslations('user.logins');
  const tCommon = useTranslations('common');
  const tNote = useTranslations('user.assistantNote');
  const tCommunication = useTranslations('user.preferences.communication');
  const tIntegrations = useTranslations('user.preferences.integrations');
  const user = useQuery(api.users.getMe);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [mounted, setMounted] = useState(false);
  // A tab can be opened by its address: Telegram's page comes back to Integrations (outbox-and-preferences-plan.md, C2).
  const askedTab = useSearchParams().get("tab");
  const [activeTab, setActiveTab] = useState(askedTab === "communication" || askedTab === "integrations" ? askedTab : "preferences");
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const { results, status, loadMore } = usePaginatedQuery(
    api.users.getLogins,
    { searchTerm },
    { initialNumItems: 15 }
  );

  const loginCount = useQuery(api.users.getMyLoginsCount, { searchTerm }) || 0;
  const totalItems = Math.max(results.length, loginCount);
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

  const paginatedItems = results.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  /**
   * One handler for both directions, because the shared footer asks for a page
   * rather than a step. The same pair was written out on four screens; this is
   * the shape the kit's footer expects.
   */
  const handlePageChange = (nextPage: number) => {
    const target = Math.min(Math.max(nextPage, 1), totalPages);
    setCurrentPage(target);
    if (target * itemsPerPage > results.length && status === "CanLoadMore") {
      loadMore(15);
    }
  };

  React.useEffect(() => {
     setCurrentPage(1);
  }, [searchTerm]);

  // The theme is only known in the browser, so Preferences waits for it.
  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="w-full mt-2 flex flex-col gap-5">

      {/* Tab Navigation */}
      <div className="flex items-center gap-6 border-b border-border-dim/50 px-2">
        <button
          onClick={() => setActiveTab("preferences")}
          className={`pb-3 text-[13px] font-medium transition-all relative ${activeTab === "preferences" ? "text-foreground" : "text-secondary hover:text-foreground"}`}
        >
          {t('tabs.preferences')}
          {activeTab === "preferences" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full shadow-[0_-2px_10px_rgba(var(--brand),0.5)]" />
          )}
        </button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab("communication")}
          className={`px-0 pt-0 pb-3 rounded-none hover:bg-transparent relative ${activeTab === "communication" ? "text-foreground" : ""}`}
        >
          {tCommunication('tab')}
          {activeTab === "communication" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full shadow-[0_-2px_10px_rgba(var(--brand),0.5)]" />
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab("integrations")}
          className={`px-0 pt-0 pb-3 rounded-none hover:bg-transparent relative ${activeTab === "integrations" ? "text-foreground" : ""}`}
        >
          {tIntegrations('tab')}
          {activeTab === "integrations" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full shadow-[0_-2px_10px_rgba(var(--brand),0.5)]" />
          )}
        </Button>
        <Button
          variant="ghost"
          onClick={() => setActiveTab("assistantNote")}
          className={`px-0 pt-0 pb-3 rounded-none hover:bg-transparent relative ${activeTab === "assistantNote" ? "text-foreground" : ""}`}
        >
          {tNote('tab')}
          {activeTab === "assistantNote" && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full shadow-[0_-2px_10px_rgba(var(--brand),0.5)]" />
          )}
        </Button>
        {isSuperAdmin && (
          <button
            onClick={() => setActiveTab("logins")}
            className={`pb-3 text-[13px] font-medium transition-all relative ${activeTab === "logins" ? "text-foreground" : "text-secondary hover:text-foreground"}`}
          >
            {t('tabs.security')}
            {activeTab === "logins" && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand rounded-t-full shadow-[0_-2px_10px_rgba(var(--brand),0.5)]" />
            )}
          </button>
        )}
      </div>

      {/* Tab Content: Preferences — theme and language (PreferencesTab) */}
      {activeTab === "preferences" && mounted && <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300"><PreferencesTab /></div>}

      {/* Tab Content: the emails a person may choose, and the apps they can link (outbox-and-preferences-plan.md, C2) */}
      {activeTab === "communication" && <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300"><CommunicationTab /></div>}
      {activeTab === "integrations" && <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-2 duration-300"><IntegrationsTab /></div>}

      {/* Tab Content: What the assistant knows about me */}
      {activeTab === "assistantNote" && <AssistantNoteTab />}

      {/* Tab Content: Logins */}
      {activeTab === "logins" && isSuperAdmin && (
        <div className="flex flex-col gap-4">

          {/* Header & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-[15px] font-medium text-foreground tracking-wide">{t('header.title')}</h3>
              <p className="text-[12px] text-secondary mt-0.5">{t('header.description')}</p>
            </div>

            <div className="w-full sm:w-[260px] flex">
              <TableSearchInput
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder={t('searchPlaceholder')}
                clearLabel={tCommon('clearSearch')}
              />
            </div>
          </div>

          {/* Table Container */}
          <TableShell
            variant="panel"
            footer={
              <PaginationFooter
                page={currentPage}
                totalPages={totalPages}
                totalCount={totalItems}
                pageSize={itemsPerPage}
                isLoading={status === "LoadingMore"}
                onPageChange={handlePageChange}
                labels={{ showing: (start, end, total) => t('pagination.showing', { start, end, total }) }}
              />
            }
          >
                <thead>
                  <TableHeaderRow variant="strip">
                    <TableHeaderCell>{t('table.device')}</TableHeaderCell>
                    <TableHeaderCell>{t('table.location')}</TableHeaderCell>
                    <TableHeaderCell>{t('table.status')}</TableHeaderCell>
                    <TableHeaderCell align="right">{t('table.timestamp')}</TableHeaderCell>
                  </TableHeaderRow>
                </thead>
                <tbody>
                  {(status === "LoadingFirstPage" || status === "LoadingMore") && paginatedItems.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-secondary">
                        <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
                      </td>
                    </tr>
                  )}

                  {/* The condition used to be `status === "CanLoadMore"` — the
                      message only appeared when there was more to load, which is
                      the one case where the list is not empty. Anyone with no
                      sign-ins recorded got a table of headings and nothing else,
                      with no way to tell it apart from a screen that broke. */}
                  {paginatedItems.length === 0 && status !== "LoadingFirstPage" && status !== "LoadingMore" && (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-secondary text-[13px]">
                        {t('table.empty')}
                      </td>
                    </tr>
                  )}

                  {paginatedItems.map((login) => (
                    <tr key={login._id} className="group border-b border-border-dim/50 last:border-b-0 hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-foreground/5 border border-white/5 flex items-center justify-center">
                            <MonitorSmartphone className="w-4 h-4 text-foreground/70" />
                          </div>
                          {/* One line, not two. The second was the raw browser
                              string wrapped over three lines of machine text;
                              it stays in the tooltip, where it is evidence
                              rather than noise. Location has its own column. */}
                          <span
                            className="text-[13px] font-medium text-foreground tracking-wide"
                            title={login.device}
                          >
                            {describeDevice(login.device)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-secondary" />
                          <div className="flex flex-col">
                            <span className="text-[13px] text-foreground">{login.location}</span>
                            <span className="text-[11px] font-mono text-muted">{login.ip}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusLabel tone={toneForStatus(login.status)}>{login.status}</StatusLabel>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[12px] text-secondary tracking-wide">
                          {new Date(login.timestamp).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
          </TableShell>
        </div>
      )}
    </div>
  );
}
