"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Activity,
  Plus,
  Search,
  Settings,
  Trash2,
  TerminalSquare,
  Globe,
  X,
  Zap
} from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";

export default function ConnectorsDashboard() {
  const t = useTranslations("admin.aiTools.marketplace");
  const deleteToolMutation = useMutation(api.aiTools.deleteTool);
  const installConnector = useMutation(api.aiTools.installConnector);
  const testConnectorConnection = useMutation(api.aiTools.testConnectorConnection);
  const marketplace = useQuery(api.aiTools.getConnectorMarketplace) || [];

  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<Id<"aiTools"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [installingKey, setInstallingKey] = useState<string | null>(null);
  const [testingConnectorId, setTestingConnectorId] = useState<Id<"toolConnectors"> | null>(null);
  const {
    results: tools,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.aiTools.getPaginatedTools,
    { searchTerm },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const handleDeleteTool = async (id: Id<"aiTools">) => {
    if (isDeleting) return;
    setIsDeleting(true);
    try {
      await deleteToolMutation({ id });
      setDeleteId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInstallConnector = async (key: string) => {
    if (installingKey) return;
    setInstallingKey(key);
    try {
      await installConnector({ key });
    } catch (e) {
      console.error(e);
    } finally {
      setInstallingKey(null);
    }
  };

  const handleTestConnector = async (connectorId: Id<"toolConnectors">) => {
    if (testingConnectorId) return;
    setTestingConnectorId(connectorId);
    try {
      await testConnectorConnection({ connectorId });
    } catch (e) {
      console.error(e);
    } finally {
      setTestingConnectorId(null);
    }
  };

  const getRoleColor = (role: string) => {
    if (role === "SUPER_ADMIN") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (role === "ADMIN") return "text-orange-500 bg-orange-500/10 border-orange-500/20";
    return "text-secondary bg-foreground/5 border-border-dim";
  };

  const getSideEffectColor = (sideEffectLevel?: string) => {
    if (sideEffectLevel === "EXTERNAL") return "text-indigo-500 bg-indigo-500/10 border-indigo-500/20";
    if (sideEffectLevel === "DESTRUCTIVE") return "text-rose-500 bg-rose-500/10 border-rose-500/20";
    if (sideEffectLevel === "WRITE") return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      {/* Header Area */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Globe className="w-6 h-6 text-brand" />
            Connectors
          </h1>
          <p className="text-[14px] text-secondary mt-1 tracking-wide max-w-xl">
            Allow Sonae agents to reference other apps and services for more context.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link 
            href="/admin/ai/tools/mcp/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full border border-indigo-500/50 bg-indigo-500/10 text-indigo-400 font-medium tracking-wide text-[13px] hover:bg-indigo-500 hover:text-white transition-all shadow-sm"
          >
            <Globe className="w-4 h-4" />
            <span>Add custom connector</span>
          </Link>

          <Link 
            href="/admin/ai/tools/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Sonae Action</span>
          </Link>
        </div>
      </header>

      <section className="w-full border border-border-dim bg-card/60 rounded-[8px] p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand" />
              {t("title")}
            </h2>
            <p className="text-[12px] text-secondary mt-1 max-w-2xl">
              {t("subtitle")}
            </p>
          </div>
          <span className="text-[11px] text-muted font-mono">
            {t("count", { count: marketplace.length })}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {marketplace.map((connector) => {
            const installation = connector.installation;
            const isInstalled = Boolean(installation);
            const isBusy = installingKey === connector.key;
            const isTesting = installation ? testingConnectorId === installation._id : false;

            return (
              <div key={connector.key} className="border border-border-dim bg-background/40 rounded-[8px] p-3 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-brand bg-brand/10 border border-brand/20 rounded-[6px] px-2 py-0.5">
                        {connector.category}
                      </span>
                      <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-muted bg-foreground/5 border border-border-dim rounded-[6px] px-2 py-0.5">
                        {connector.authMode}
                      </span>
                    </div>
                    <h3 className="text-[14px] font-semibold text-foreground mt-2 truncate">{connector.name}</h3>
                    <p className="text-[12px] text-muted mt-1 line-clamp-2">{connector.description}</p>
                  </div>
                  {installation && (
                    <div className="flex flex-col items-end gap-1 text-right">
                      <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-emerald-500">
                        {installation.installStatus}
                      </span>
                      <span className="text-[10px] text-muted">
                        {installation.testStatus || t("untested")}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {connector.requiredScopes.map((scope) => (
                    <span key={scope} className="text-[11px] font-mono text-secondary bg-foreground/5 rounded-[6px] px-2 py-1">
                      {scope}
                    </span>
                  ))}
                </div>

                <div className="flex items-center gap-2 mt-auto">
                  <button
                    type="button"
                    onClick={() => handleInstallConnector(connector.key)}
                    disabled={isBusy}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {isBusy ? t("installing") : isInstalled ? t("sync") : t("install")}
                  </button>
                  <button
                    type="button"
                    onClick={() => installation && handleTestConnector(installation._id)}
                    disabled={!installation || isTesting}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] border border-border-dim text-[12px] font-medium text-foreground hover:bg-foreground/5 disabled:opacity-50"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    {isTesting ? t("testing") : t("test")}
                  </button>
                  {installation && (
                    <Link
                      href={`/admin/ai/tools/connectors/${installation._id}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] border border-border-dim text-[12px] font-medium text-foreground hover:bg-foreground/5"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      {t("manage")}
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Control Bar */}
      <div className="w-full flex items-center justify-between p-2 bg-card/40 backdrop-blur-xl border border-border-dim rounded-[16px] shadow-sm">
        <div className="flex items-center gap-2 px-3 flex-1">
          <Search className="w-4 h-4 text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search connectors by name or description..."
            className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
          />
        </div>
      </div>

      {/* Listing Area */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          // Skeletons
          [1,2,3].map(i => (
             <div key={i} className="w-full h-[80px] bg-card/60 animate-pulse rounded-[14px] border border-border-dim/50" />
          ))
        ) : tools.length === 0 ? (
          <div className="w-full py-16 flex flex-col items-center justify-center gap-4 border border-dashed border-border-dim rounded-[14px]">
             <Globe className="w-8 h-8 text-muted/30" />
             <span className="text-muted text-[13px] font-medium tracking-widest uppercase">No Connectors Enabled</span>
          </div>
        ) : (
          tools.map((tool, idx) => (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              key={tool._id}
              className="flex items-start sm:items-center justify-between gap-4 p-5 rounded-[16px] border backdrop-blur-xl transition-all bg-card border-border-dim shadow-md dark:shadow-xl hover:border-brand/30 group"
            >
               {/* Metadata Tree */}
               <Link href={`/admin/ai/tools/${tool._id}`} className="flex flex-col gap-1.5 flex-1 min-w-0 cursor-pointer pr-4">
                 <div className="flex items-center gap-3">
                   <div className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border ${getRoleColor(tool.requiredRole)}`}>
                     {tool.requiredRole}
                   </div>
                   <div className={`px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border ${getSideEffectColor(tool.sideEffectLevel)}`}>
                     {tool.sideEffectLevel || "READ"}
                   </div>
                   {tool.isActive === false && (
                     <div className="px-2 py-0.5 rounded-[6px] text-[9px] font-bold tracking-[0.1em] uppercase border text-muted bg-foreground/5 border-border-dim">
                       Inactive
                     </div>
                   )}
                   <h3 className="text-[15px] font-semibold text-foreground truncate group-hover:text-brand transition-colors">
                     {tool.name}
                   </h3>
                 </div>
                 <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:items-center mt-1">
                   <p className="text-[12px] text-muted line-clamp-1 pr-6 tracking-wide group-hover:text-foreground/80 transition-colors">
                     {tool.description}
                   </p>
                   <div className="flex items-center gap-1.5 text-[11px] font-mono tracking-wide text-secondary/60 bg-foreground/5 px-2 py-1 rounded-[6px] w-max">
                     <TerminalSquare className="w-3 h-3" />
                     {tool.handlerMapping}
                   </div>
                 </div>
               </Link>

               <div className="flex items-center gap-4 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] text-brand font-medium">Connected</span>
                    <button className="px-4 py-1.5 border border-border-dim rounded-[8px] text-[12px] font-medium text-foreground hover:bg-white/5 transition-all">
                      Configure
                    </button>
                  </div>
                 <AnimatePresence mode="popLayout">
                   {deleteId === tool._id ? (
                     <motion.div 
                       initial={{ opacity: 0, scale: 0.8, x: 20 }}
                       animate={{ opacity: 1, scale: 1, x: 0 }}
                       exit={{ opacity: 0, scale: 0.8 }}
                       className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 rounded-[10px] p-1"
                     >
                        <span className="text-[11px] font-bold tracking-widest uppercase text-rose-500 pl-3 pr-2">Disconnect?</span>
                        <button 
                          onClick={() => setDeleteId(null)}
                          className="p-1.5 rounded-[8px] hover:bg-foreground/10 text-secondary hover:text-foreground transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => handleDeleteTool(tool._id)}
                          disabled={isDeleting}
                          className="p-1.5 rounded-[8px] bg-rose-500 hover:bg-rose-600 text-white transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                     </motion.div>
                   ) : (
                     <motion.button 
                       layoutId={`delete-${tool._id}`}
                       onClick={() => setDeleteId(tool._id)}
                       className="p-1.5 rounded-[10px] border border-transparent hover:bg-rose-500/10 hover:border-rose-500/20 text-rose-500/70 hover:text-rose-500 transition-colors"
                       title="Disconnect Tool"
                     >
                       <Trash2 className="w-4 h-4" />
                     </motion.button>
                   )}
                 </AnimatePresence>
               </div>
            </motion.div>
          ))
        )}
      </div>
      <AdminLoadMoreFooter
        visibleCount={tools.length}
        canLoadMore={canLoadMore}
        isLoading={isLoadingMore}
        onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
        labels={{
          empty: "No Connectors Enabled",
          showing: (count) => `Showing ${count} connectors`,
          loadMore: "Load more connectors",
          loading: "Loading connectors...",
        }}
      />
    </div>
  );
}
