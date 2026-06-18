"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, KeyRound, Loader2, Plus, ShieldCheck, XCircle } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import {
  AdminLoadMoreFooter,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";

type ApiKeyScope = "agent:run" | "workflow:run" | "run:read" | "webhook:deliver";

const API_KEY_SCOPES: Array<{ value: ApiKeyScope; label: string; description: string }> = [
  { value: "agent:run", label: "Agent runs", description: "Trigger governed agent runs." },
  { value: "workflow:run", label: "Workflow runs", description: "Trigger governed workflows." },
  { value: "run:read", label: "Run status", description: "Read run status and evidence." },
  { value: "webhook:deliver", label: "Webhook delivery", description: "Use future callback delivery surfaces." },
];

function getStatusColor(status: string) {
  if (status === "ACTIVE") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  return "text-red-400 bg-red-500/10 border-red-500/20";
}

export default function ApiKeysPage() {
  const companies = useQuery(api.companies.getCompanyOptions, { limit: 200 });
  const createApiKey = useMutation(api.apiKeys.create);
  const revokeApiKey = useMutation(api.apiKeys.revoke);
  const [selectedCompanyId, setSelectedCompanyId] = useState<Id<"companies"> | "">("");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["agent:run", "run:read"]);
  const [rateLimitPerMinute, setRateLimitPerMinute] = useState(60);
  const [expiresAt, setExpiresAt] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [oneTimeKey, setOneTimeKey] = useState<{ apiKey: string; keyPrefix: string } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ id: Id<"apiKeys">; name: string } | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState("");

  const {
    results: apiKeys,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.apiKeys.list,
    selectedCompanyId ? { companyId: selectedCompanyId } : {},
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const isLoading = status === "LoadingFirstPage";
  const isLoadingMore = status === "LoadingMore";
  const canLoadMore = status === "CanLoadMore";

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]);
  };

  const handleCreate = async () => {
    setCreateError("");
    setOneTimeKey(null);
    if (!selectedCompanyId) {
      setCreateError("Choose a company before creating a tenant-scoped API key.");
      return;
    }
    if (!name.trim()) {
      setCreateError("Name the API key before creating it.");
      return;
    }
    if (scopes.length === 0) {
      setCreateError("Select at least one scope.");
      return;
    }

    setIsCreating(true);
    try {
      const result = await createApiKey({
        companyId: selectedCompanyId,
        name: name.trim(),
        scopes,
        rateLimitPerMinute,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).getTime() } : {}),
      });
      setOneTimeKey({ apiKey: result.apiKey, keyPrefix: result.record.keyPrefix });
      setName("");
      setExpiresAt("");
      setRateLimitPerMinute(60);
      setScopes(["agent:run", "run:read"]);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Failed to create API key.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    setRevokeError("");
    try {
      await revokeApiKey({
        apiKeyId: revokeTarget.id,
        ...(revokeReason.trim() ? { reason: revokeReason.trim() } : {}),
      });
      setRevokeTarget(null);
      setRevokeReason("");
    } catch (error) {
      setRevokeError(error instanceof Error ? error.message : "Failed to revoke API key.");
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <KeyRound className="w-6 h-6 text-brand" />
            API Keys
          </h1>
          <p className="text-[13px] text-secondary mt-1">
            Create revocable tenant-scoped keys for future public API and webhook surfaces.
          </p>
        </div>
        <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-3 py-2 flex items-center gap-2 text-[12px] text-secondary">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          Raw secrets are returned once, then only a digest and prefix are stored.
        </div>
      </div>

      <div className="rounded-[8px] border border-border-dim bg-sidebar/30 px-4 py-4 grid grid-cols-1 xl:grid-cols-[1.1fr_1fr] gap-4">
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="api-key-company" className="block text-[11px] uppercase tracking-widest font-mono text-muted mb-2">Company</label>
            <select
              id="api-key-company"
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value as Id<"companies"> | "")}
              className="h-10 w-full rounded-[8px] border border-border-dim bg-background px-3 text-[13px] text-foreground focus:outline-none focus:border-brand"
            >
              <option value="">All companies</option>
              {(companies ?? []).map((company) => (
                <option key={company._id} value={company._id}>{company.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_160px_190px] gap-3">
            <div>
              <label htmlFor="api-key-name" className="block text-[11px] uppercase tracking-widest font-mono text-muted mb-2">Name</label>
              <input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production agent trigger"
                className="h-10 w-full rounded-[8px] border border-border-dim bg-background px-3 text-[13px] text-foreground focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label htmlFor="api-key-rate-limit" className="block text-[11px] uppercase tracking-widest font-mono text-muted mb-2">Rate/min</label>
              <input
                id="api-key-rate-limit"
                type="number"
                min={1}
                max={600}
                value={rateLimitPerMinute}
                onChange={(event) => setRateLimitPerMinute(Number(event.target.value))}
                className="h-10 w-full rounded-[8px] border border-border-dim bg-background px-3 text-[13px] text-foreground focus:outline-none focus:border-brand"
              />
            </div>
            <div>
              <label htmlFor="api-key-expires-at" className="block text-[11px] uppercase tracking-widest font-mono text-muted mb-2">Expires</label>
              <input
                id="api-key-expires-at"
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
                className="h-10 w-full rounded-[8px] border border-border-dim bg-background px-3 text-[13px] text-foreground focus:outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {API_KEY_SCOPES.map((scope) => (
              <label key={scope.value} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={scopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-[13px] font-semibold text-foreground">{scope.label}</span>
                  <span className="block text-[11px] text-secondary">{scope.description}</span>
                </span>
              </label>
            ))}
          </div>

          {createError && (
            <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[13px] text-red-400">
              {createError}
            </div>
          )}

          <button
            type="button"
            onClick={handleCreate}
            disabled={isCreating}
            className="w-fit inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-foreground text-background text-[13px] font-semibold disabled:opacity-50"
          >
            {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create API key
          </button>
        </div>

        <div className="rounded-[8px] border border-border-dim bg-black/20 px-4 py-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-foreground">
            <AlertTriangle className="w-4 h-4 text-amber-300" />
            <h2 className="text-[13px] font-semibold">One-time secret</h2>
          </div>
          {oneTimeKey ? (
            <>
              <p className="text-[12px] text-secondary">
                Store this key now. It will not be shown again after you leave this page.
              </p>
              <pre className="rounded-[8px] border border-border-dim bg-background px-3 py-3 text-[12px] text-foreground overflow-auto whitespace-pre-wrap break-all">
                {oneTimeKey.apiKey}
              </pre>
              <div className="text-[11px] font-mono text-muted">prefix: {oneTimeKey.keyPrefix}</div>
            </>
          ) : (
            <p className="text-[12px] text-secondary">
              Create a key to reveal its secret once. Existing keys only display their prefix, scopes, status, and audit metadata.
            </p>
          )}
        </div>
      </div>

      <AdminTableShell
        footer={
          <AdminLoadMoreFooter
            visibleCount={apiKeys.length}
            canLoadMore={canLoadMore}
            isLoading={isLoadingMore}
            onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
            labels={{
              empty: "No API keys created",
              showing: (count) => `Showing ${count} API keys`,
              loadMore: "Load more API keys",
              loading: "Loading API keys...",
            }}
          />
        }
        minWidthClassName="min-w-[980px]"
      >
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Key</th>
            <th className="px-4 py-3 font-medium">Company</th>
            <th className="px-4 py-3 font-medium">Scopes</th>
            <th className="px-4 py-3 font-medium">Limits</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <AdminTableLoadingRow colSpan={6} />
          ) : apiKeys.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={6}
              icon={<KeyRound className="w-8 h-8 text-muted/30" />}
              label="No API keys created"
            />
          ) : apiKeys.map((apiKey) => (
            <tr key={apiKey._id} className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors">
              <td className="px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">{apiKey.name}</div>
                <div className="text-[11px] font-mono text-muted">{apiKey.keyPrefix}</div>
                <div className="text-[11px] text-muted">Created {formatDateTime(apiKey.createdAt)}</div>
              </td>
              <td className="px-4 py-3 text-[13px] text-secondary">{apiKey.companyName}</td>
              <td className="px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {apiKey.scopes.map((scope) => (
                    <span key={scope} className="px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-[11px] font-mono text-secondary">
                      {scope}
                    </span>
                  ))}
                </div>
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">
                <div>{apiKey.rateLimitPerMinute}/min</div>
                <div>{apiKey.expiresAt ? `Expires ${formatDateTime(apiKey.expiresAt)}` : "No expiration"}</div>
              </td>
              <td className="px-4 py-3">
                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-mono ${getStatusColor(apiKey.status)}`}>
                  {apiKey.status === "ACTIVE" ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  {apiKey.status}
                </span>
                {apiKey.revokedAt && (
                  <div className="text-[11px] text-muted mt-1">Revoked {formatDateTime(apiKey.revokedAt)}</div>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  onClick={() => {
                    setRevokeTarget({ id: apiKey._id, name: apiKey.name });
                    setRevokeReason("");
                    setRevokeError("");
                  }}
                  disabled={apiKey.status === "REVOKED"}
                  className="px-3 py-1.5 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-400 text-[12px] font-semibold disabled:opacity-40"
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>

      <SonaeModal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke API key"
      >
        <div className="flex flex-col gap-3">
          {revokeTarget && (
            <p className="text-[13px] text-secondary">
              Revoke {revokeTarget.name}. Future public API requests using this key will be rejected once endpoints are enabled.
            </p>
          )}
          <label className="text-[12px] font-semibold text-secondary">Reason</label>
          <textarea
            value={revokeReason}
            onChange={(event) => setRevokeReason(event.target.value)}
            rows={3}
            placeholder="Rotated, leaked, no longer needed..."
            className="w-full rounded-[8px] border border-border-dim bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:border-brand"
          />
          {revokeError && <div className="text-[13px] text-red-400">{revokeError}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setRevokeTarget(null)}
              className="px-3 py-2 rounded-[8px] border border-border-dim text-[13px] text-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleRevoke}
              disabled={isRevoking}
              className="px-3 py-2 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-400 text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2"
            >
              {isRevoking && <Loader2 className="w-4 h-4 animate-spin" />}
              Revoke key
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
