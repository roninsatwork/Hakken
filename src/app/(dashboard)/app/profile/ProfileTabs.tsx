"use client";

import React, { useState } from "react";
import { usePaginatedQuery, useQuery } from "convex/react";
import { PaginationFooter, TableShell, TableHeaderRow, TableHeaderCell } from "@/src/ui/components/screens/Table";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";
import { api } from "@/convex/_generated/api";
import { Loader2, MonitorSmartphone, MapPin, Palette, Check, Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";

export default function ProfileTabs() {
  const t = useTranslations('user.logins');
  const tCommon = useTranslations('common');
  const tPrefs = useTranslations('user.preferences');
  const { theme, setTheme } = useTheme();
  const user = useQuery(api.users.getMe);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("preferences");
  const [locale, setLocale] = useState("en");
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

  React.useEffect(() => {
    setMounted(true);
    const cookieLocale = document.cookie
      .split("; ")
      .find((row) => row.startsWith("locale="))
      ?.split("=")[1];
    if (cookieLocale) {
      setLocale(cookieLocale);
    }
  }, []);

  const handleLanguageChange = (newLocale: string) => {
    document.cookie = `locale=${newLocale}; path=/; max-age=31536000`;
    setLocale(newLocale);
    window.location.reload();
  };

  const parseUserAgent = (ua: string) => {
    if (ua.includes("Mac OS")) return t('devices.macos');
    if (ua.includes("Windows")) return t('devices.windows');
    if (ua.includes("iPhone")) return t('devices.iphone');
    if (ua.includes("Android")) return t('devices.android');
    return t('devices.unknown');
  };

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

      {/* Tab Content: Preferences */}
      {activeTab === "preferences" && mounted && (
        <div className="flex flex-col gap-6 w-full max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            <h3 className="text-[15px] font-medium text-foreground tracking-wide">{tPrefs('title')}</h3>
            <p className="text-[12px] text-secondary mt-0.5">{tPrefs('description')}</p>
          </div>

          {/* Theme Selector */}
          <div className="flex flex-col gap-3">
            <div>
              <h4 className="text-[13px] font-medium text-foreground tracking-wide flex items-center gap-2">
                <Palette className="w-4 h-4 text-brand" />
                {tPrefs('theme.title')}
              </h4>
              <p className="text-[11px] text-secondary mt-0.5">{tPrefs('theme.description')}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mt-1 max-w-[480px]">
              {/* Light Mode Card */}
              <div
                onClick={() => setTheme("light")}
                className={`bg-sidebar/30 border rounded-[16px] p-3 flex flex-col gap-2.5 cursor-pointer transition-all hover:bg-foreground/5 hover:border-brand/40 group relative overflow-hidden ${
                  theme === "light" 
                    ? "border-brand/80 bg-brand/5 shadow-[0_0_15px_rgba(var(--brand),0.04)]" 
                    : "border-border-dim/50"
                }`}
              >
                {/* Light preview layout */}
                <div className="w-full aspect-[16/10] bg-[#f6f6f7] border border-[#e3e3e5] rounded-[8px] p-1 flex gap-0.5 relative overflow-hidden shadow-inner">
                  <div className="w-[10px] h-full bg-[#e3e3e5] rounded-[2px] shrink-0" />
                  <div className="flex-1 h-full flex flex-col gap-0.5">
                    <div className="w-full h-1.5 bg-[#e3e3e5] rounded-[1px]" />
                    <div className="flex-1 w-full bg-white border border-[#e3e3e5]/50 rounded-[3px] p-0.5 flex flex-col gap-0.5">
                      <div className="h-0.5 w-3/4 bg-[#f0f0f2] rounded-full" />
                      <div className="h-0.5 w-1/2 bg-[#f0f0f2] rounded-full" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-medium text-foreground tracking-wide">{tPrefs('theme.light')}</span>
                  {theme === "light" && <Check className="w-3 h-3 text-brand" />}
                </div>
              </div>

              {/* Dark Mode Card */}
              <div
                onClick={() => setTheme("dark")}
                className={`bg-sidebar/30 border rounded-[16px] p-3 flex flex-col gap-2.5 cursor-pointer transition-all hover:bg-foreground/5 hover:border-brand/40 group relative overflow-hidden ${
                  theme === "dark" 
                    ? "border-brand/80 bg-brand/5 shadow-[0_0_15px_rgba(var(--brand),0.04)]" 
                    : "border-border-dim/50"
                }`}
              >
                {/* Dark preview layout */}
                <div className="w-full aspect-[16/10] bg-[#1e1e20] border border-[#2f2f32] rounded-[8px] p-1 flex gap-0.5 relative overflow-hidden shadow-inner">
                  <div className="w-[10px] h-full bg-[#2f2f32] rounded-[2px] shrink-0" />
                  <div className="flex-1 h-full flex flex-col gap-0.5">
                    <div className="w-full h-1.5 bg-[#2f2f32] rounded-[1px]" />
                    <div className="flex-1 w-full bg-[#161618] border border-[#2f2f32]/50 rounded-[3px] p-0.5 flex flex-col gap-0.5">
                      <div className="h-0.5 w-3/4 bg-[#2a2a2e] rounded-full" />
                      <div className="h-0.5 w-1/2 bg-[#2a2a2e] rounded-full" />
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-medium text-foreground tracking-wide">{tPrefs('theme.dark')}</span>
                  {theme === "dark" && <Check className="w-3 h-3 text-brand" />}
                </div>
              </div>

              {/* System Default Card */}
              <div
                onClick={() => setTheme("system")}
                className={`bg-sidebar/30 border rounded-[16px] p-3 flex flex-col gap-2.5 cursor-pointer transition-all hover:bg-foreground/5 hover:border-brand/40 group relative overflow-hidden ${
                  theme === "system" 
                    ? "border-brand/80 bg-brand/5 shadow-[0_0_15px_rgba(var(--brand),0.04)]" 
                    : "border-border-dim/50"
                }`}
              >
                {/* System Split preview layout */}
                <div className="w-full aspect-[16/10] bg-background border border-border-dim/40 rounded-[8px] relative overflow-hidden flex shadow-inner">
                  <div className="absolute inset-y-0 left-0 w-1/2 bg-[#f6f6f7] flex gap-0.5 p-1 overflow-hidden">
                    <div className="w-[10px] h-full bg-[#e3e3e5] rounded-[2px] shrink-0" />
                    <div className="flex-1 h-full flex flex-col gap-0.5">
                      <div className="w-full h-1.5 bg-[#e3e3e5] rounded-[1px]" />
                      <div className="flex-1 w-full bg-white border border-[#e3e3e5]/50 rounded-[3px] p-0.5 flex flex-col gap-0.5">
                        <div className="h-0.5 w-3/4 bg-[#f0f0f2] rounded-full" />
                        <div className="h-0.5 w-1/2 bg-[#f0f0f2] rounded-full" />
                      </div>
                    </div>
                  </div>
                  <div className="absolute inset-y-0 right-0 w-1/2 bg-[#1e1e20] flex gap-0.5 p-1 overflow-hidden justify-end">
                    <div className="flex-1 h-full flex flex-col gap-0.5">
                      <div className="w-full h-1.5 bg-[#2f2f32] rounded-[1px]" />
                      <div className="flex-1 w-full bg-[#161618] border border-[#2f2f32]/50 rounded-[3px] p-0.5 flex flex-col gap-0.5">
                        <div className="h-0.5 w-3/4 bg-[#2a2a2e] rounded-full" />
                        <div className="h-0.5 w-1/2 bg-[#2a2a2e] rounded-full" />
                      </div>
                    </div>
                  </div>
                  <div className="absolute top-0 bottom-0 left-1/2 -ml-[0.5px] w-[1px] bg-border-dim/80 z-20" />
                </div>
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[11px] font-medium text-foreground tracking-wide">{tPrefs('theme.system')}</span>
                  {theme === "system" && <Check className="w-3 h-3 text-brand" />}
                </div>
              </div>
            </div>
          </div>

          <div className="h-px bg-border-dim/30 my-2" />

          {/* Language Selector */}
          <div className="flex flex-col gap-3">
            <div>
              <h4 className="text-[13px] font-medium text-foreground tracking-wide flex items-center gap-2">
                <Globe className="w-4 h-4 text-brand" />
                {tPrefs('language.title')}
              </h4>
              <p className="text-[11px] text-secondary mt-0.5">{tPrefs('language.description')}</p>
            </div>

            <div className="flex flex-col gap-2 mt-1">
              <label className="text-[11px] font-semibold text-secondary/80 uppercase tracking-widest">{tPrefs('language.label')}</label>
              
              <div className="grid grid-cols-2 gap-3.5 max-w-[320px]">
                {/* English UK Card */}
                <div
                  onClick={() => handleLanguageChange("en")}
                  className={`bg-sidebar/30 border rounded-[16px] p-3 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all hover:bg-foreground/5 hover:border-brand/40 group relative overflow-hidden ${
                    locale === "en" 
                      ? "border-brand/80 bg-brand/5 shadow-[0_0_15px_rgba(var(--brand),0.04)]" 
                      : "border-border-dim/50"
                  }`}
                >
                  {/* UK Flag SVG (Union Jack) */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 30" className="w-12 h-8 rounded-[6px] border border-border-dim/30 overflow-hidden shadow-sm shrink-0">
                    <rect width="60" height="30" fill="#012169"/>
                    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6"/>
                    <path d="M0,0 L60,30 M60,0 L0,30" stroke="#da291c" strokeWidth="4"/>
                    <path d="M30,0 L30,30 M0,15 L60,15" stroke="#fff" strokeWidth="10"/>
                    <path d="M30,0 L30,30 M0,15 L60,15" stroke="#da291c" strokeWidth="6"/>
                  </svg>
                  
                  <div className="flex items-center justify-between w-full px-0.5">
                    <span className="text-[11px] font-medium text-foreground tracking-wide">{tPrefs('language.en')}</span>
                    {locale === "en" && <Check className="w-3 h-3 text-brand" />}
                  </div>
                </div>

                {/* Italian Card */}
                <div
                  onClick={() => handleLanguageChange("it")}
                  className={`bg-sidebar/30 border rounded-[16px] p-3 flex flex-col items-center justify-center gap-2.5 cursor-pointer transition-all hover:bg-foreground/5 hover:border-brand/40 group relative overflow-hidden ${
                    locale === "it" 
                      ? "border-brand/80 bg-brand/5 shadow-[0_0_15px_rgba(var(--brand),0.04)]" 
                      : "border-border-dim/50"
                  }`}
                >
                  {/* Italian Flag SVG */}
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3 2" className="w-12 h-8 rounded-[6px] border border-border-dim/30 overflow-hidden shadow-sm shrink-0">
                    <rect width="1" height="2" fill="#008d46"/>
                    <rect x="1" width="1" height="2" fill="#f4f5f0"/>
                    <rect x="2" width="1" height="2" fill="#d22630"/>
                  </svg>
                  
                  <div className="flex items-center justify-between w-full px-0.5">
                    <span className="text-[11px] font-medium text-foreground tracking-wide">{tPrefs('language.it')}</span>
                    {locale === "it" && <Check className="w-3 h-3 text-brand" />}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
                labels={{ showing: (start, end, total) => `Showing ${start} to ${end} of ${total} logins` }}
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
                          <div className="flex flex-col">
                            <span className="text-[13px] font-medium text-foreground tracking-wide">{parseUserAgent(login.device)}</span>
                            <span className="text-[11px] text-muted truncate max-w-[200px]" title={login.device}>{login.device}</span>
                          </div>
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
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${login.status === 'SUCCESS' ? 'bg-[#10b981]' : 'bg-red-500'}`} />
                          <span className="text-[12px] text-secondary font-medium tracking-wide">
                            {login.status}
                          </span>
                        </div>
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
