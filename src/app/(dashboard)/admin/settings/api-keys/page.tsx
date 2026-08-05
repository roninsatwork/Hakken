"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { Copy, KeyRound, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import {
  AdminLoadMoreFooter,
  AdminTableEmptyRow,
  AdminTableHeaderCell,
  AdminTableHeaderRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { cn } from "@/src/ui/lib/utils";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";

type ApiKeyScope = "agent:run" | "workflow:run" | "run:read";

/**
 * What a key is allowed to do.
 *
 * `webhook:deliver` was offered here as "use future callback delivery
 * surfaces". No endpoint has ever checked it — it granted access to nothing —
 * so it is no longer offered. Keys that already carry it still read back
 * correctly; the scope simply cannot be given out any more.
 */
const API_KEY_SCOPES: Array<{ value: ApiKeyScope; label: string; description: string }> = [
  { value: "agent:run", label: "Start an agent", description: "Ask an agent to do something." },
  { value: "run:read", label: "Check on a run", description: "See whether a run finished, and what it did." },
  { value: "workflow:run", label: "Start a workflow", description: "Kick off a workflow from outside Sonae." },
];

const SCOPE_LABELS: Record<string, string> = {
  "agent:run": "Start an agent",
  "run:read": "Check on a run",
  "workflow:run": "Start a workflow",
  "webhook:deliver": "Webhook delivery (no longer used)",
};

const DEFAULT_REQUESTS_PER_MINUTE = 60;

/** A year out. The field used to open empty, so the obvious key never expired. */
function defaultExpiry() {
  const inAYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${inAYear.getFullYear()}-${pad(inAYear.getMonth() + 1)}-${pad(inAYear.getDate())}T09:00`;
}

function SettingSwitch({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <p className="text-[12px] leading-relaxed text-muted">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="mt-0.5 shrink-0"
      >
        <span className={cn("relative block h-5 w-9 rounded-full transition-colors", checked ? "bg-brand" : "bg-foreground/15")}>
          <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", checked ? "left-[18px]" : "left-0.5")} />
        </span>
      </button>
    </div>
  );
}

export default function ApiKeysPage() {
  const companies = useQuery(api.companies.getCompanyOptions, { limit: 200 });
  const createApiKey = useMutation(api.apiKeys.create);
  const revokeApiKey = useMutation(api.apiKeys.revoke);

  const [selectedCompanyId, setSelectedCompanyId] = useState<Id<"companies"> | "">("");
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["agent:run", "run:read"]);
  const [requestsPerMinute, setRequestsPerMinute] = useState(DEFAULT_REQUESTS_PER_MINUTE);
  const [expiresAt, setExpiresAt] = useState(defaultExpiry);
  const [validationError, setValidationError] = useState("");
  const [oneTimeKey, setOneTimeKey] = useState<{ apiKey: string; keyPrefix: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<{ id: Id<"apiKeys">; name: string } | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  // Two runners rather than one: the create form and the revoke modal each show
  // their failure inline, and a single shared `error` would leak the form's
  // failure into the modal.
  const createAction = useAdminAction({ scope: "admin-api-keys-create" });
  const revokeAction = useAdminAction({ scope: "admin-api-keys-revoke" });

  const { results: apiKeys, status, loadMore } = usePaginatedQuery(
    api.apiKeys.list,
    selectedCompanyId ? { companyId: selectedCompanyId } : {},
    { initialNumItems: ADMIN_PAGE_SIZE },
  );

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((current) => current.includes(scope)
      ? current.filter((item) => item !== scope)
      : [...current, scope]);
  };

  const handleCreate = async () => {
    setValidationError("");
    setOneTimeKey(null);
    setCopied(false);
    if (!selectedCompanyId) {
      setValidationError("Choose which company this key is for.");
      return;
    }
    if (!name.trim()) {
      setValidationError("Give the key a name, so you know what it is later.");
      return;
    }
    if (scopes.length === 0) {
      setValidationError("Choose at least one thing the key is allowed to do.");
      return;
    }

    const outcome = await createAction.run(
      () => createApiKey({
        companyId: selectedCompanyId,
        name: name.trim(),
        scopes,
        rateLimitPerMinute: requestsPerMinute,
        ...(expiresAt ? { expiresAt: new Date(expiresAt).getTime() } : {}),
      }),
      { fallbackMessage: "That key could not be created. Try again.", suppressErrorToast: true },
    );
    if (!outcome.ok) return;

    setOneTimeKey({ apiKey: outcome.data.apiKey, keyPrefix: outcome.data.record.keyPrefix });
    setName("");
    setExpiresAt(defaultExpiry());
    setRequestsPerMinute(DEFAULT_REQUESTS_PER_MINUTE);
    setScopes(["agent:run", "run:read"]);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const outcome = await revokeAction.run(
      () => revokeApiKey({
        apiKeyId: revokeTarget.id,
        ...(revokeReason.trim() ? { reason: revokeReason.trim() } : {}),
      }),
      { fallbackMessage: "That key could not be turned off. Try again.", suppressErrorToast: true },
    );
    if (!outcome.ok) return;
    setRevokeTarget(null);
    setRevokeReason("");
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      {/* The old description called this "future public API and webhook
          surfaces". The public API is live — four endpoints, every one checking
          the key and what it is allowed to do — so the screen that unlocks it
          was telling the reader it did not exist yet. */}
      <AdminPageHeader
        icon={<KeyRound className="h-6 w-6 text-brand" />}
        title="API Keys"
        description="Let another system start your agents and check on runs. A key belongs to one company, and you can turn it off at any time."
      />

      <section className="flex flex-col gap-4 rounded-[16px] border border-border-dim bg-card/40 p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">New key</h2>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="api-key-company" className="text-[12px] font-medium text-secondary">Which company is it for?</label>
              <select
                id="api-key-company"
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value as Id<"companies"> | "")}
                className="h-[46px] w-full cursor-pointer rounded-[12px] border border-border-dim bg-black/20 px-4 text-[13px] text-foreground outline-none focus:border-brand/50"
              >
                {/* Was "All companies", which is not a thing a key can be: every
                    key belongs to exactly one. The form opened in a state that
                    could not be submitted. */}
                <option value="">Choose a company</option>
                {(companies ?? []).map((company) => (
                  <option key={company._id} value={company._id}>{company.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="api-key-name" className="text-[12px] font-medium text-secondary">What is it for?</label>
              <input
                id="api-key-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Website contact form"
                className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[13px] text-foreground outline-none placeholder:text-muted focus:border-brand/50"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label htmlFor="api-key-rate-limit" className="text-[12px] font-medium text-secondary">Requests a minute</label>
                <input
                  id="api-key-rate-limit"
                  type="number"
                  min={1}
                  max={600}
                  value={requestsPerMinute}
                  onChange={(event) => setRequestsPerMinute(Number(event.target.value))}
                  className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[13px] text-foreground outline-none focus:border-brand/50"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="api-key-expires-at" className="text-[12px] font-medium text-secondary">Stops working on</label>
                <input
                  id="api-key-expires-at"
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(event) => setExpiresAt(event.target.value)}
                  className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[13px] text-foreground outline-none focus:border-brand/50"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-secondary">What is it allowed to do?</span>
            <div className="divide-y divide-border-dim/40 rounded-[12px] border border-border-dim bg-black/20 px-4">
              {API_KEY_SCOPES.map((scope) => (
                <SettingSwitch
                  key={scope.value}
                  label={scope.label}
                  description={scope.description}
                  checked={scopes.includes(scope.value)}
                  onChange={() => toggleScope(scope.value)}
                />
              ))}
            </div>
          </div>
        </div>

        {validationError || createAction.error ? (
          <p className="text-[13px] text-rose-300">{validationError || createAction.error}</p>
        ) : null}

        <AdminWriteButton
          type="button"
          onClick={handleCreate}
          disabled={createAction.isBusy()}
          className="inline-flex h-9 w-max items-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {createAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create key
        </AdminWriteButton>

        {oneTimeKey ? (
          <div className="flex flex-col gap-3 rounded-[12px] border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-[13px] leading-relaxed text-amber-100">
                Copy this now. It is the only time it will be shown — Sonae keeps only enough to recognise it, never the key itself.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[8px] border border-border-dim bg-black/40 px-3 py-2 text-[12px] text-foreground">
                {oneTimeKey.apiKey}
              </code>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(oneTimeKey.apiKey);
                  setCopied(true);
                }}
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-[8px] border border-border-dim px-3 text-[13px] font-medium text-foreground transition-colors hover:bg-foreground/5"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">Keys you have</h2>

        <AdminTableShell minWidthClassName="min-w-[900px]">
          <thead>
            <AdminTableHeaderRow>
              <AdminTableHeaderCell>Key</AdminTableHeaderCell>
              <AdminTableHeaderCell>Company</AdminTableHeaderCell>
              <AdminTableHeaderCell>Allowed to</AdminTableHeaderCell>
              <AdminTableHeaderCell>Limits</AdminTableHeaderCell>
              <AdminTableHeaderCell>Status</AdminTableHeaderCell>
              <AdminTableHeaderCell align="right">{""}</AdminTableHeaderCell>
            </AdminTableHeaderRow>
          </thead>
          <tbody>
            {status === "LoadingFirstPage" ? (
              <AdminTableLoadingRow colSpan={6} />
            ) : apiKeys.length === 0 ? (
              <AdminTableEmptyRow
                colSpan={6}
                icon={<KeyRound className="h-8 w-8 text-muted/30" />}
                label="No keys yet"
                action={
                  <span className="text-[13px] normal-case tracking-normal text-secondary">
                    Create one above to let another system start your agents.
                  </span>
                }
              />
            ) : (
              apiKeys.map((apiKey) => (
                <tr key={apiKey._id} className="border-b border-border-dim/50">
                  <td className="px-4 py-3 align-top">
                    <div className="text-[13px] font-medium text-foreground">{apiKey.name}</div>
                    <div className="text-[12px] text-muted">{apiKey.keyPrefix}…</div>
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">{apiKey.companyName}</td>
                  <td className="px-4 py-3 align-top text-[13px] leading-relaxed text-secondary">
                    {apiKey.scopes.map((scope: string) => SCOPE_LABELS[scope] ?? scope).join(", ")}
                  </td>
                  <td className="px-4 py-3 align-top text-[13px] text-secondary">
                    <div>{apiKey.rateLimitPerMinute} a minute</div>
                    <div className="text-[12px] text-muted">
                      {apiKey.expiresAt ? `Stops ${formatDateTime(apiKey.expiresAt)}` : "Never stops"}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-[13px]">
                    <span className={apiKey.status === "ACTIVE" ? "text-[#10b981]" : "text-muted"}>
                      {apiKey.status === "ACTIVE" ? "Working" : "Turned off"}
                    </span>
                    {apiKey.revokedAt ? (
                      <div className="text-[12px] text-muted">{formatDateTime(apiKey.revokedAt)}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    {apiKey.status === "ACTIVE" ? (
                      <AdminWriteButton
                        type="button"
                        onClick={() => setRevokeTarget({ id: apiKey._id, name: apiKey.name })}
                        aria-label={`Turn off ${apiKey.name}`}
                        className="rounded-[8px] p-1.5 text-rose-500/70 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </AdminWriteButton>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </AdminTableShell>

        <AdminLoadMoreFooter
          visibleCount={apiKeys.length}
          canLoadMore={status === "CanLoadMore"}
          isLoading={status === "LoadingMore"}
          onLoadMore={() => loadMore(ADMIN_PAGE_SIZE)}
          labels={{
            empty: "No keys yet",
            showing: (count) => `Showing ${count} key${count === 1 ? "" : "s"}`,
            loadMore: "Show more",
            loading: "Loading...",
          }}
        />
      </section>

      <SonaeModal
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title="Turn off this key"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-[13px] leading-relaxed text-secondary">
            Anything using <span className="text-foreground">{revokeTarget?.name}</span> stops working straight away. This cannot be undone — you would need to create a new key.
          </p>
          <div className="flex flex-col gap-2">
            <label htmlFor="api-key-revoke-reason" className="text-[12px] font-medium text-secondary">Why? (optional)</label>
            <input
              id="api-key-revoke-reason"
              value={revokeReason}
              onChange={(event) => setRevokeReason(event.target.value)}
              placeholder="No longer needed"
              className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[13px] text-foreground outline-none placeholder:text-muted focus:border-brand/50"
            />
          </div>
          {revokeAction.error ? <p className="text-[13px] text-rose-300">{revokeAction.error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRevokeTarget(null)}
              className="inline-flex h-9 items-center rounded-[8px] border border-border-dim px-4 text-[13px] font-medium text-foreground transition-colors hover:bg-foreground/5"
            >
              Keep it
            </button>
            <AdminWriteButton
              type="button"
              onClick={handleRevoke}
              disabled={revokeAction.isBusy()}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-rose-500 px-4 text-[13px] font-semibold text-white transition-colors hover:bg-rose-600 disabled:opacity-50"
            >
              {revokeAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Turn it off
            </AdminWriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
