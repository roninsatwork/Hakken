"use client";

import { use, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useToast } from "@/src/context/ToastContext";
import { Activity, ArrowLeft, CheckCircle2, KeyRound, Loader2, Save, ShieldCheck, SlidersHorizontal, XCircle } from "lucide-react";

type ConnectorDraft = {
  configuredSecretRefs: string;
  enabledToolMappings: string[];
  isActive: boolean;
  tenantAvailability: "GLOBAL" | "TENANT_RESTRICTED";
  companyId: string;
};

function createDraft(details: {
  connector: {
    configuredSecretRefs?: string[];
    enabledToolMappings?: string[];
    isActive: boolean;
    tenantAvailability: "GLOBAL" | "TENANT_RESTRICTED";
    companyId?: Id<"companies">;
  };
}) {
  return {
    configuredSecretRefs: (details.connector.configuredSecretRefs ?? []).join(", "),
    enabledToolMappings: details.connector.enabledToolMappings ?? [],
    isActive: details.connector.isActive,
    tenantAvailability: details.connector.tenantAvailability,
    companyId: details.connector.companyId ?? "",
  };
}

function parseSecretRefs(value: string) {
  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
}

function parseDiagnosticDetails(value?: string) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function formatDiagnosticValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "-";
  if (value === undefined || value === null || value === "") return "-";
  return String(value);
}

export default function ConnectorInstallPage({ params }: { params: Promise<{ id: Id<"toolConnectors"> }> }) {
  const t = useTranslations("admin.aiTools.connectorDetails");
  const { showErrorToast } = useToast();
  const { id } = use(params);
  const details = useQuery(api.aiTools.getConnectorInstallDetails, { connectorId: id });
  const companyOptions = useQuery(api.companies.getCompanyOptions, details?.canManageTenantScope ? {} : "skip") || [];
  const updateConnectorInstall = useMutation(api.aiTools.updateConnectorInstall);
  const validateConnectorConfiguration = useMutation(api.aiTools.validateConnectorConfiguration);
  const beginConnectorOAuth = useMutation(api.aiTools.beginConnectorOAuth);
  const completeConnectorOAuth = useMutation(api.aiTools.completeConnectorOAuth);
  const disconnectConnectorOAuth = useMutation(api.aiTools.disconnectConnectorOAuth);

  const [draft, setDraft] = useState<ConnectorDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isCompletingOAuth, setIsCompletingOAuth] = useState(false);
  const [oauthState, setOauthState] = useState("");
  const [oauthAccountRef, setOauthAccountRef] = useState("");
  const [oauthTokenRef, setOauthTokenRef] = useState("");

  if (details === undefined) {
    return (
      <div className="flex-1 w-full h-full flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  if (!details) return null;

  const form = draft ?? createDraft(details);
  const definition = details.definition;
  const configuredSecretRefs = parseSecretRefs(form.configuredSecretRefs);
  const missingRequiredRefs = (details.connector.requiredSecretRefs ?? []).filter((secretRef) => !configuredSecretRefs.includes(secretRef));

  const updateDraft = (updates: Partial<ConnectorDraft>) => {
    setDraft((current) => ({ ...(current ?? createDraft(details)), ...updates }));
  };

  const toggleToolMapping = (handlerMapping: string) => {
    const enabled = new Set(form.enabledToolMappings);
    if (enabled.has(handlerMapping)) {
      enabled.delete(handlerMapping);
    } else {
      enabled.add(handlerMapping);
    }
    updateDraft({ enabledToolMappings: Array.from(enabled) });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await updateConnectorInstall({
        connectorId: id,
        configuredSecretRefs,
        enabledToolMappings: form.enabledToolMappings,
        isActive: form.isActive,
        ...(details.canManageTenantScope ? {
          tenantAvailability: form.tenantAvailability,
          companyId: form.companyId ? form.companyId as Id<"companies"> : undefined,
        } : {}),
      });
      setDraft(null);
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (isTesting) return;
    setIsTesting(true);
    try {
      await validateConnectorConfiguration({ connectorId: id });
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleBeginOAuth = async () => {
    if (isAuthorizing) return;
    setIsAuthorizing(true);
    try {
      const result = await beginConnectorOAuth({ connectorId: id });
      setOauthState(result.state);
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
    } finally {
      setIsAuthorizing(false);
    }
  };

  const handleCompleteOAuth = async () => {
    if (isCompletingOAuth || !oauthState.trim() || !oauthAccountRef.trim() || !oauthTokenRef.trim()) return;
    setIsCompletingOAuth(true);
    try {
      await completeConnectorOAuth({
        connectorId: id,
        state: oauthState.trim(),
        accountRef: oauthAccountRef.trim(),
        tokenRef: oauthTokenRef.trim(),
      });
      setOauthState("");
      setOauthAccountRef("");
      setOauthTokenRef("");
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
    } finally {
      setIsCompletingOAuth(false);
    }
  };

  const handleDisconnectOAuth = async () => {
    if (isAuthorizing) return;
    setIsAuthorizing(true);
    try {
      await disconnectConnectorOAuth({ connectorId: id });
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
    } finally {
      setIsAuthorizing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <header className="flex flex-col gap-1">
        <Link
          href="/admin/ai/tools"
          className="flex items-center gap-2 text-[12px] text-muted hover:text-foreground transition-colors mb-2 w-max"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{t("back")}</span>
        </Link>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <SlidersHorizontal className="w-6 h-6 text-brand" />
              {details.connector.name}
            </h1>
            <p className="text-[13px] text-secondary tracking-wide max-w-3xl mt-1">
              {details.connector.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-[6px] border border-border-dim bg-foreground/5 text-[10px] font-bold tracking-[0.1em] uppercase text-muted">
              {details.connector.installStatus}
            </span>
            <span className="px-2 py-1 rounded-[6px] border border-border-dim bg-foreground/5 text-[10px] font-bold tracking-[0.1em] uppercase text-muted">
              {details.connector.testStatus ?? t("untested")}
            </span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <form onSubmit={handleSave} className="flex flex-col gap-5">
          <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
            <h2 className="text-[15px] font-semibold text-foreground">{t("sections.connection")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
              <div className="rounded-[8px] border border-border-dim bg-background/40 p-3">
                <span className="block text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.authMode")}</span>
                <span className="block text-[13px] font-semibold text-foreground mt-1">{details.connector.authMode}</span>
              </div>
              <div className="rounded-[8px] border border-border-dim bg-background/40 p-3">
                <span className="block text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.availability")}</span>
                <span className="block text-[13px] font-semibold text-foreground mt-1">{details.connector.tenantAvailability}</span>
              </div>
              <label className="rounded-[8px] border border-border-dim bg-background/40 p-3 flex items-center justify-between gap-3">
                <span>
                  <span className="block text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.active")}</span>
                  <span className="block text-[13px] font-semibold text-foreground mt-1">{form.isActive ? t("active") : t("disabled")}</span>
                </span>
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => updateDraft({ isActive: event.target.checked })}
                />
              </label>
            </div>

            {details.canManageTenantScope && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.scope")}</span>
                  <select
                    value={form.tenantAvailability}
                    onChange={(event) => updateDraft({
                      tenantAvailability: event.target.value as "GLOBAL" | "TENANT_RESTRICTED",
                      companyId: event.target.value === "GLOBAL" ? "" : form.companyId,
                    })}
                    className="w-full bg-transparent border border-border-dim rounded-[8px] p-3 text-[13px] text-foreground outline-none focus:border-brand/40"
                  >
                    <option value="GLOBAL">{t("scope.global")}</option>
                    <option value="TENANT_RESTRICTED">{t("scope.tenant")}</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.tenant")}</span>
                  <select
                    value={form.companyId}
                    onChange={(event) => updateDraft({
                      companyId: event.target.value,
                      tenantAvailability: event.target.value ? "TENANT_RESTRICTED" : form.tenantAvailability,
                    })}
                    disabled={form.tenantAvailability === "GLOBAL"}
                    className="w-full bg-transparent border border-border-dim rounded-[8px] p-3 text-[13px] text-foreground outline-none focus:border-brand/40 disabled:opacity-50"
                  >
                    <option value="">{t("scope.noTenant")}</option>
                    {companyOptions.map((company) => (
                      <option key={company._id} value={company._id}>{company.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              <label className="text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.secretRefs")}</label>
              <input
                value={form.configuredSecretRefs}
                onChange={(event) => updateDraft({ configuredSecretRefs: event.target.value })}
                placeholder={t("placeholders.secretRefs")}
                className="w-full bg-transparent border border-border-dim rounded-[8px] p-3 text-[13px] text-foreground placeholder:text-muted/40 outline-none focus:border-brand/40"
              />
              <div className="flex flex-wrap gap-2">
                {(details.connector.requiredSecretRefs ?? []).map((secretRef) => (
                  <span
                    key={secretRef}
                    className={`text-[11px] font-mono rounded-[6px] px-2 py-1 ${missingRequiredRefs.includes(secretRef) ? "bg-rose-500/10 text-rose-500" : "bg-emerald-500/10 text-emerald-500"}`}
                  >
                    {secretRef}
                  </span>
                ))}
                {(details.connector.requiredSecretRefs ?? []).length === 0 && (
                  <span className="text-[12px] text-muted">{t("noSecrets")}</span>
                )}
              </div>
            </div>
          </section>

          <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
            <h2 className="text-[15px] font-semibold text-foreground">{t("sections.tools")}</h2>
            <div className="flex flex-col gap-3 mt-4">
              {definition?.toolDefinitions.length ? (
                definition.toolDefinitions.map((tool) => (
                  <label key={tool.handlerMapping} className="flex items-start gap-3 border border-border-dim bg-background/40 rounded-[8px] p-3">
                    <input
                      type="checkbox"
                      checked={form.enabledToolMappings.includes(tool.handlerMapping)}
                      onChange={() => toggleToolMapping(tool.handlerMapping)}
                      className="mt-1"
                    />
                    <span className="min-w-0">
                      <span className="block text-[13px] font-semibold text-foreground">{tool.name}</span>
                      <span className="block text-[12px] text-muted mt-1">{tool.description}</span>
                      <span className="inline-flex mt-2 text-[11px] font-mono text-secondary bg-foreground/5 rounded-[6px] px-2 py-1">
                        {tool.handlerMapping}
                      </span>
                    </span>
                  </label>
                ))
              ) : (
                <div className="border border-dashed border-border-dim rounded-[8px] p-6 text-[13px] text-muted">
                  {t("noTools")}
                </div>
              )}
            </div>
          </section>

          {details.connector.authMode === "OAUTH" && (
            <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
              <h2 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-brand" />
                {t("sections.oauth")}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <div className="rounded-[8px] border border-border-dim bg-background/40 p-3">
                  <span className="block text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.oauthStatus")}</span>
                  <span className="block text-[13px] font-semibold text-foreground mt-1">{details.connector.authConnectionStatus ?? t("oauth.notConnected")}</span>
                </div>
                <div className="rounded-[8px] border border-border-dim bg-background/40 p-3">
                  <span className="block text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.oauthAccount")}</span>
                  <span className="block text-[13px] font-semibold text-foreground mt-1 truncate">{details.connector.authAccountRef ?? t("oauth.noAccount")}</span>
                </div>
                <div className="rounded-[8px] border border-border-dim bg-background/40 p-3">
                  <span className="block text-[10px] font-mono tracking-[0.18em] text-muted uppercase">{t("fields.oauthScopes")}</span>
                  <span className="block text-[13px] font-semibold text-foreground mt-1">{(details.connector.oauthScopes ?? details.connector.requiredScopes ?? []).length}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <input
                  value={oauthState}
                  onChange={(event) => setOauthState(event.target.value)}
                  placeholder={t("placeholders.oauthState")}
                  className="w-full bg-transparent border border-border-dim rounded-[8px] p-3 text-[13px] text-foreground placeholder:text-muted/40 outline-none focus:border-brand/40"
                />
                <input
                  value={oauthAccountRef}
                  onChange={(event) => setOauthAccountRef(event.target.value)}
                  placeholder={t("placeholders.oauthAccountRef")}
                  className="w-full bg-transparent border border-border-dim rounded-[8px] p-3 text-[13px] text-foreground placeholder:text-muted/40 outline-none focus:border-brand/40"
                />
                <input
                  value={oauthTokenRef}
                  onChange={(event) => setOauthTokenRef(event.target.value)}
                  placeholder={t("placeholders.oauthTokenRef")}
                  className="w-full bg-transparent border border-border-dim rounded-[8px] p-3 text-[13px] text-foreground placeholder:text-muted/40 outline-none focus:border-brand/40"
                />
              </div>
              <div className="flex flex-wrap gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleBeginOAuth}
                  disabled={isAuthorizing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] border border-border-dim text-[13px] font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
                >
                  <KeyRound className="w-4 h-4" />
                  {isAuthorizing ? t("oauth.starting") : t("oauth.start")}
                </button>
                <button
                  type="button"
                  onClick={handleCompleteOAuth}
                  disabled={isCompletingOAuth || !oauthState.trim() || !oauthAccountRef.trim() || !oauthTokenRef.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isCompletingOAuth ? t("oauth.completing") : t("oauth.complete")}
                </button>
                <button
                  type="button"
                  onClick={handleDisconnectOAuth}
                  disabled={isAuthorizing}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] border border-rose-500/30 text-[13px] font-medium text-rose-500 hover:bg-rose-500/10 disabled:opacity-60"
                >
                  <XCircle className="w-4 h-4" />
                  {t("oauth.disconnect")}
                </button>
              </div>
              {details.oauthConnection && (
                <p className="text-[12px] text-muted mt-3">
                  {t("oauth.latest", { status: details.oauthConnection.status, provider: details.oauthConnection.provider })}
                </p>
              )}
            </section>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
            >
              <Save className="w-4 h-4" />
              {isSaving ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={isTesting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[8px] border border-border-dim text-[13px] font-medium text-foreground hover:bg-foreground/5 disabled:opacity-60"
            >
              <Activity className="w-4 h-4" />
              {isTesting ? t("testing") : t("test")}
            </button>
          </div>
        </form>

        <aside className="flex flex-col gap-4">
          <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
            <h2 className="text-[15px] font-semibold text-foreground flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand" />
              {t("sections.generatedTools")}
            </h2>
            <div className="flex flex-col gap-2 mt-4">
              {details.tools.length ? (
                details.tools.map((tool) => (
                  <Link
                    key={tool._id}
                    href={`/admin/ai/tools/${tool._id}`}
                    className="border border-border-dim bg-background/40 rounded-[8px] p-3 hover:border-brand/30"
                  >
                    <span className="block text-[13px] font-semibold text-foreground">{tool.name}</span>
                    <span className="block text-[11px] font-mono text-muted mt-1">{tool.handlerMapping}</span>
                    <span className="block text-[11px] text-secondary mt-1">{tool.isActive === false ? t("disabled") : t("active")}</span>
                  </Link>
                ))
              ) : (
                <p className="text-[12px] text-muted">{t("noGeneratedTools")}</p>
              )}
            </div>
          </section>

          <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
            <h2 className="text-[15px] font-semibold text-foreground">{t("sections.secretRegistry")}</h2>
            <div className="flex flex-col gap-2 mt-4">
              {details.secretRefs.length ? (
                details.secretRefs.map((secretRef) => (
                  <div key={secretRef._id} className="border border-border-dim bg-background/40 rounded-[8px] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[12px] font-mono text-foreground">{secretRef.key}</span>
                      <span className={`text-[10px] font-bold tracking-[0.1em] uppercase ${secretRef.status === "CONFIGURED" ? "text-emerald-500" : "text-rose-500"}`}>
                        {secretRef.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted mt-2">{secretRef.required ? t("required") : t("optional")}</p>
                  </div>
                ))
              ) : (
                <p className="text-[12px] text-muted">{t("noSecretRegistry")}</p>
              )}
            </div>
          </section>

          <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
            <h2 className="text-[15px] font-semibold text-foreground">{t("sections.testHistory")}</h2>
            <div className="flex flex-col gap-2 mt-4">
              {details.testLogs.length ? (
                details.testLogs.map((log) => {
                  const diagnosticDetails = parseDiagnosticDetails(log.diagnosticDetailsJson);

                  return (
                    <div key={log._id} className="border border-border-dim bg-background/40 rounded-[8px] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          {log.status === "SUCCESS" ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-500" />
                          )}
                          <span className="text-[12px] font-semibold text-foreground">{log.status}</span>
                        </div>
                        {log.diagnosticCode && (
                          <span className="text-[10px] font-mono text-secondary bg-foreground/5 border border-border-dim rounded-[6px] px-2 py-1">
                            {log.diagnosticCode}
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-muted mt-2">{log.message}</p>
                      {diagnosticDetails && (
                        <dl className="grid grid-cols-1 gap-1 mt-3 rounded-[8px] bg-foreground/5 p-2">
                          {["authMode", "installStatus", "authConnectionStatus", "missingSecretRefs"].map((key) => (
                            <div key={key} className="flex items-start justify-between gap-3">
                              <dt className="text-[10px] font-mono text-muted">{t(`diagnostics.${key}`)}</dt>
                              <dd className="text-[10px] text-secondary text-right break-all">
                                {formatDiagnosticValue(diagnosticDetails[key])}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      <span className="block text-[10px] text-secondary mt-2">{new Date(log.testedAt).toLocaleString()}</span>
                    </div>
                  );
                })
              ) : (
                <p className="text-[12px] text-muted">{t("noTestLogs")}</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
