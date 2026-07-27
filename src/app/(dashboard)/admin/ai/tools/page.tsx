"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2, Plus, Trash2, Wrench, X } from "lucide-react";
import Link from "next/link";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminLoadMoreFooter,
  AdminSearchBar,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "System admins",
  ADMIN: "Admins",
  USER: "Anyone",
};

const EFFECT_LABELS: Record<string, string> = {
  READ: "Reads only",
  WRITE: "Writes",
  DESTRUCTIVE: "Deletes",
  EXTERNAL: "Reaches outside",
};

/**
 * The tool catalogue, saying only what is true.
 *
 * Nothing in the product linked here, so the one screen that decides what an
 * agent can actually do was reachable only by typing the URL. It also offered
 * twenty-one connectors when four had an implementation — with a live Install
 * button on every one, so an admin could install Salesforce, attach it to an
 * agent, and find out from a run log that it did nothing. The seventeen are
 * gone rather than badged.
 */
export default function ToolsPage() {
  const deleteToolMutation = useMutation(api.aiTools.deleteTool);
  const installConnector = useMutation(api.aiTools.installConnector);
  const marketplace = useQuery(api.aiTools.getConnectorMarketplace);

  const [searchTerm, setSearchTerm] = useState("");
  const [deleteId, setDeleteId] = useState<Id<"aiTools"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { results: tools, status, loadMore } = usePaginatedQuery(
    api.aiTools.getPaginatedTools,
    { searchTerm },
    { initialNumItems: ADMIN_PAGE_SIZE },
  );

  const handleAddConnector = async (key: string) => {
    if (addingKey) return;
    setAddingKey(key);
    setError("");
    try {
      await installConnector({ key });
    } catch {
      setError("That could not be added. Try again.");
    } finally {
      setAddingKey(null);
    }
  };

  const handleDeleteTool = async (id: Id<"aiTools">) => {
    if (isDeleting) return;
    setIsDeleting(true);
    setError("");
    try {
      await deleteToolMutation({ id });
      setDeleteId(null);
    } catch {
      setError("That could not be removed. Try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-8 pb-12 animate-in fade-in slide-in-from-bottom-2">
      <AdminPageHeader
        icon={<Wrench className="h-6 w-6 text-brand" />}
        title="Tools"
        description="What your agents can actually do. A tool is set up once here, then switched on for the agents that need it."
        action={
          <Link
            href="/admin/ai/tools/new"
            className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            Build a tool
          </Link>
        }
      />

      {error ? (
        <p className="rounded-[10px] border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-[13px] text-rose-300">
          {error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Ready to use</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
            Built into Sonae and ready to add. Some need a little setup — an address, or a key — before an agent can use them.
          </p>
        </div>

        <AdminTableShell minWidthClassName="min-w-[720px]">
          <thead>
            <AdminTableHeaderRow>
              <AdminTableHeaderCell>Tool</AdminTableHeaderCell>
              <AdminTableHeaderCell>What it does</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right">{""}</AdminTableHeaderCell>
            </AdminTableHeaderRow>
          </thead>
          <tbody>
            {marketplace === undefined ? (
              <AdminTableLoadingRow colSpan={3} />
            ) : marketplace.length === 0 ? (
              <AdminTableEmptyRow
                colSpan={3}
                icon={<Wrench className="h-8 w-8 text-muted/30" />}
                label="Nothing built in on this deployment"
              />
            ) : (
              marketplace.map((connector) => {
                const installation = connector.installation;
                const isBusy = addingKey === connector.key;
                return (
                  <tr key={connector.key} className="border-b border-border-dim/50">
                    <td className="px-4 py-3 align-top text-[13px] font-medium text-foreground">
                      {connector.name}
                    </td>
                    <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-secondary">
                      {connector.description}
                    </td>
                    <td className="px-4 py-3 align-top text-right">
                      {installation ? (
                        <Link
                          href={`/admin/ai/tools/connectors/${installation._id}`}
                          className="inline-flex h-8 items-center rounded-[8px] border border-border-dim px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-foreground/5"
                        >
                          Set up
                        </Link>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddConnector(connector.key)}
                          disabled={isBusy}
                          className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border-dim px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Add
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </AdminTableShell>
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">Your tools</h2>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
            Everything an agent can be given. Switch them on per agent from that agent&apos;s Interfaces screen.
          </p>
        </div>

        <AdminSearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search tools by name or description"
        />

        <AdminTableShell minWidthClassName="min-w-[820px]">
          <thead>
            <AdminTableHeaderRow>
              <AdminTableHeaderCell>Tool</AdminTableHeaderCell>
              <AdminTableHeaderCell>What it does</AdminTableHeaderCell>
              <AdminTableHeaderCell>Who can use it</AdminTableHeaderCell>
              <AdminTableHeaderCell>Reach</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right">{""}</AdminTableHeaderCell>
            </AdminTableHeaderRow>
          </thead>
          <tbody>
            {status === "LoadingFirstPage" ? (
              <AdminTableLoadingRow colSpan={5} />
            ) : tools.length === 0 ? (
              <AdminTableEmptyRow
                colSpan={5}
                icon={<Wrench className="h-8 w-8 text-muted/30" />}
                label="No tools yet"
                action={
                  <span className="text-[13px] normal-case tracking-normal text-secondary">
                    Add one from the list above, or build your own.
                  </span>
                }
              />
            ) : (
              tools.map((tool) => (
                <tr key={tool._id} className="border-b border-border-dim/50">
                  <td className="px-4 py-3 align-top">
                    <Link
                      href={`/admin/ai/tools/${tool._id}`}
                      className="text-[13px] font-medium text-foreground transition-colors hover:text-brand"
                    >
                      {tool.name}
                    </Link>
                    {tool.isActive === false ? (
                      <span className="ml-2 text-[12px] text-muted">Off</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-secondary">
                    {tool.description}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">
                    {ROLE_LABELS[tool.requiredRole] ?? tool.requiredRole}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">
                    {EFFECT_LABELS[tool.sideEffectLevel ?? "READ"] ?? tool.sideEffectLevel}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    {deleteId === tool._id ? (
                      <span className="inline-flex items-center gap-2">
                        <span className="text-[12px] text-secondary">Remove it?</span>
                        <button
                          type="button"
                          onClick={() => setDeleteId(null)}
                          aria-label="Keep"
                          className="rounded-[8px] p-1.5 text-secondary transition-colors hover:bg-foreground/10 hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteTool(tool._id)}
                          disabled={isDeleting}
                          aria-label="Remove"
                          className="rounded-[8px] bg-rose-500 p-1.5 text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setDeleteId(tool._id)}
                        aria-label={`Remove ${tool.name}`}
                        className="rounded-[8px] p-1.5 text-rose-500/70 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </AdminTableShell>

        <AdminLoadMoreFooter
          visibleCount={tools.length}
          canLoadMore={status === "CanLoadMore"}
          isLoading={status === "LoadingMore"}
          onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
          labels={{
            empty: "No tools yet",
            showing: (count) => `Showing ${count} tool${count === 1 ? "" : "s"}`,
            loadMore: "Show more",
            loading: "Loading...",
          }}
        />
      </section>
    </div>
  );
}
