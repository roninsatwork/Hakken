"use client";

import dynamic from "next/dynamic";
import { useMutation, useQuery } from "convex/react";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { Field } from "@/src/ui/components/screens/Field";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useState } from "react";
import { Copy, KeyRound, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/src/ui/atoms/Button";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import {
} from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { SettingSwitch } from "@/src/ui/components/screens/SettingsCard";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useTranslations } from "next-intl";

type ApiKeyScope = "agent:run" | "workflow:run" | "run:read";

/**
 * What a key is allowed to do.
 *
 * `webhook:deliver` was offered here as "use future callback delivery
 * surfaces". No endpoint has ever checked it — it granted access to nothing —
 * so it is no longer offered. Keys that already carry it still read back
 * correctly; the scope simply cannot be given out any more.
 */
// Catalogue keys, relative to `admin.settings.apiKeys` — the screen says the words.
const API_KEY_SCOPES: Array<{ value: ApiKeyScope; labelKey: string; descriptionKey: string }> = [
  { value: "agent:run", labelKey: "scopes.agentRun", descriptionKey: "scopes.agentRunSub" },
  { value: "run:read", labelKey: "scopes.runRead", descriptionKey: "scopes.runReadSub" },
  { value: "workflow:run", labelKey: "scopes.workflowRun", descriptionKey: "scopes.workflowRunSub" },
];

const SCOPE_LABEL_KEYS: Record<string, string> = {
  "agent:run": "scopes.agentRun",
  "run:read": "scopes.runRead",
  "workflow:run": "scopes.workflowRun",
  "webhook:deliver": "scopes.webhookDeliver",
};

const DEFAULT_REQUESTS_PER_MINUTE = 60;

const loadApiKeyRevokeDialog = () =>
  import("./ApiKeyRevokeDialog").then((module) => module.ApiKeyRevokeDialog);
const ApiKeyRevokeDialog = dynamic(loadApiKeyRevokeDialog);

/** A year out. The field used to open empty, so the obvious key never expired. */
function defaultExpiry() {
  const inAYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${inAYear.getFullYear()}-${pad(inAYear.getMonth() + 1)}-${pad(inAYear.getDate())}T09:00`;
}

export default function ApiKeysPage() {
  const t = useTranslations("admin.settings.apiKeys");
  const { platformName } = useSystemSettings();
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

  const keys = useServerPagedTable(
    api.apiKeys.list,
    selectedCompanyId ? { companyId: selectedCompanyId } : {},
    TABLE_PAGE_SIZE,
  );
  const apiKeys = keys.rows;

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
      setValidationError(t("errorNoCompany"));
      return;
    }
    if (!name.trim()) {
      setValidationError(t("errorNoName"));
      return;
    }
    if (scopes.length === 0) {
      setValidationError(t("errorNoScopes"));
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
      { fallbackMessage: t("createFailed"), suppressErrorToast: true },
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
      { fallbackMessage: t("revokeFailed"), suppressErrorToast: true },
    );
    if (!outcome.ok) return;
    setRevokeTarget(null);
    setRevokeReason("");
  };

  const openRevokeDialog = (target: { id: Id<"apiKeys">; name: string }) => {
    void loadApiKeyRevokeDialog();
    setRevokeTarget(target);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      {/* The old description called this "future public API and webhook
          surfaces". The public API is live — four endpoints, every one checking
          the key and what it is allowed to do — so the screen that unlocks it
          was telling the reader it did not exist yet. */}
      <PageHeader
        divider
        icon={<KeyRound className="h-6 w-6 text-brand" />}
        title={t("headerTitle")}
        description={t("headerDescription")}
      />

      <section className="flex flex-col gap-4 rounded-[16px] border border-border-dim bg-card/40 p-6">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{t("newKey")}</h2>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="api-key-company" className="text-[12px] font-medium text-secondary">{t("companyLabel")}</label>
              <select
                id="api-key-company"
                value={selectedCompanyId}
                onChange={(event) => setSelectedCompanyId(event.target.value as Id<"companies"> | "")}
                className="h-[46px] w-full cursor-pointer rounded-[12px] border border-border-dim bg-black/20 px-4 text-[13px] text-foreground outline-none focus:border-brand/50"
              >
                {/* Was "All companies", which is not a thing a key can be: every
                    key belongs to exactly one. The form opened in a state that
                    could not be submitted. */}
                <option value="">{t("chooseCompany")}</option>
                {(companies ?? []).map((company) => (
                  <option key={company._id} value={company._id}>{company.name}</option>
                ))}
              </select>
            </div>

            <Field
              id="api-key-name"
              label={t("nameLabel")}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("namePlaceholder")}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                id="api-key-rate-limit"
                label={t("rateLabel")}
                type="number"
                min={1}
                max={600}
                value={requestsPerMinute}
                onChange={(event) => setRequestsPerMinute(Number(event.target.value))}
              />
              <Field
                id="api-key-expires-at"
                label={t("expiryLabel")}
                type="datetime-local"
                value={expiresAt}
                onChange={(event) => setExpiresAt(event.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-secondary">{t("scopesLabel")}</span>
            <div className="divide-y divide-border-dim/40 rounded-[12px] border border-border-dim bg-black/20 px-4">
              {API_KEY_SCOPES.map((scope) => (
                <SettingSwitch
                  key={scope.value}
                  label={t(scope.labelKey)}
                  description={t(scope.descriptionKey, { platformName })}
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

        <WriteButton
          type="button"
          onClick={handleCreate}
          disabled={createAction.isBusy()}
          className="inline-flex h-9 w-max items-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50"
        >
          {createAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          {t("createKey")}
        </WriteButton>

        {oneTimeKey ? (
          <div className="flex flex-col gap-3 rounded-[12px] border border-amber-500/20 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <p className="text-[13px] leading-relaxed text-amber-100">
                {t("copyNow", { platformName })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[8px] border border-border-dim bg-black/40 px-3 py-2 text-[12px] text-foreground">
                {oneTimeKey.apiKey}
              </code>
              <Button
                variant="quiet"
                onClick={() => {
                  void navigator.clipboard?.writeText(oneTimeKey.apiKey);
                  setCopied(true);
                }}
                className="inline-flex h-9 shrink-0 items-center gap-2 px-3 text-[13px] text-foreground bg-transparent hover:bg-foreground/5"
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? t("copied") : t("copy")}
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">{t("keysYouHave")}</h2>

        <DataTable
          rows={status === "LoadingFirstPage" ? undefined : apiKeys}
          rowKey={(apiKey) => apiKey._id}
          minWidthClassName="min-w-[900px]"
          empty={{
            icon: <KeyRound className="h-8 w-8 text-muted/30" />,
            label: t("emptyKeys"),
            action: (
              <span className="text-[13px] normal-case tracking-normal text-secondary">
                {t("emptyHint")}
              </span>
            ),
          }}
          /* The footer used to sit outside the shell, floating under the table
             as a separate bar rather than closing it. */
          footer={{
            mode: "paged",
            page: keys.page,
            totalPages: keys.totalPages,
            totalCount: keys.loadedCount,
            pageSize: TABLE_PAGE_SIZE,
            isLoading: keys.isBusy,
            onPageChange: keys.goToPage,
            labels: { empty: t("emptyKeys") },
          }}
          columns={[
            {
              key: "key",
              header: t("columnKey"),
              cell: (apiKey) => (
                <>
                  <div className="text-[13px] font-medium text-foreground">{apiKey.name}</div>
                  <div className="text-[12px] text-muted">{apiKey.keyPrefix}…</div>
                </>
              ),
            },
            {
              key: "company",
              header: t("columnCompany"),
              cell: (apiKey) => <span className="text-[13px] text-secondary">{apiKey.companyName}</span>,
            },
            {
              key: "scopes",
              header: t("columnScopes"),
              cell: (apiKey) => (
                <span className="text-[13px] leading-relaxed text-secondary">
                  {apiKey.scopes.map((scope: string) => (SCOPE_LABEL_KEYS[scope] ? t(SCOPE_LABEL_KEYS[scope], { platformName }) : scope)).join(", ")}
                </span>
              ),
            },
            {
              key: "limits",
              header: t("columnLimits"),
              cell: (apiKey) => (
                <div className="text-[13px] text-secondary">
                  <div>{t("perMinute", { count: apiKey.rateLimitPerMinute })}</div>
                  <div className="text-[12px] text-muted">
                    {apiKey.expiresAt ? t("stopsOn", { date: formatDateTime(apiKey.expiresAt) }) : t("neverStops")}
                  </div>
                </div>
              ),
            },
            {
              key: "status",
              header: t("columnStatus"),
              cell: (apiKey) => (
                <div className="text-[13px]">
                  <span className={apiKey.status === "ACTIVE" ? "text-[#10b981]" : "text-muted"}>
                    {apiKey.status === "ACTIVE" ? t("working") : t("turnedOff")}
                  </span>
                  {apiKey.revokedAt ? (
                    <div className="text-[12px] text-muted">{formatDateTime(apiKey.revokedAt)}</div>
                  ) : null}
                </div>
              ),
            },
            {
              key: "revoke",
              header: "",
              align: "right",
              cell: (apiKey) =>
                apiKey.status === "ACTIVE" ? (
                  <WriteButton
                    type="button"
                    onClick={() => openRevokeDialog({ id: apiKey._id, name: apiKey.name })}
                    aria-label={t("turnOffAria", { name: apiKey.name })}
                    className="rounded-[8px] p-1.5 text-rose-500/70 transition-colors hover:bg-rose-500/10 hover:text-rose-500"
                  >
                    <Trash2 className="h-4 w-4" />
                  </WriteButton>
                ) : null,
            },
          ]}
        />
      </section>

      {revokeTarget ? (
        <ApiKeyRevokeDialog
          body={t.rich("revokeBody", {
            name: revokeTarget.name,
            b: (chunks) => <span className="text-foreground">{chunks}</span>,
          })}
          busy={revokeAction.isBusy()}
          cancelLabel={t("keepIt")}
          confirmLabel={t("turnItOff")}
          error={revokeAction.error}
          onClose={() => setRevokeTarget(null)}
          onConfirm={handleRevoke}
          onReasonChange={setRevokeReason}
          reason={revokeReason}
          reasonLabel={t("reasonLabel")}
          reasonPlaceholder={t("reasonPlaceholder")}
          title={t("revokeTitle")}
        />
      ) : null}
    </div>
  );
}
