"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useToast } from "@/src/context/ToastContext";
import { ArrowLeft, CheckCircle2, Loader2, Mail, XCircle } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "@/src/ui/atoms/Button";
import { formatDateTime } from "@/src/lib/dates";
import { SaveAction } from "@/src/ui/components/screens/SaveControls";
import { Field } from "@/src/ui/components/screens/Field";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useTranslations } from "next-intl";

type ConnectorDraft = {
  configuredSecretRefs: string;
  enabledToolMappings: string[];
  isActive: boolean;
  tenantAvailability: "GLOBAL" | "TENANT_RESTRICTED";
  companyId: string;
  authAccountRef: string;
};

function parseSecretRefs(value: string) {
  return Array.from(new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean)));
}

/** A yes/no setting, stated once, with a sentence saying what the state does. */
function SettingSwitch({ label, description, checked, onChange }: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-[13px] font-medium text-foreground">{label}</span>
        <p className="text-[12px] leading-relaxed text-muted">{description}</p>
      </div>
      {/* Stays raw: an on/off switch drawn as its own control — matches no variant. */}
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-card/40 p-6">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</h2>
      {children}
    </section>
  );
}

/**
 * One tool's setup, in plain words.
 *
 * The screen this replaces led with three read-only boxes reading AUTH MODE /
 * NONE, AVAILABILITY / GLOBAL and ACTIVE — two facts nobody can act on beside
 * one setting that can. Beside it sat three panels called Generated Tools,
 * Secret Reference Registry and Validation History, two of which normally said
 * "No … yet". What is left is the three things a reader can actually change,
 * and one plain answer to "does it work".
 */
export default function ConnectorSetupPage() {
  const t = useTranslations("admin.aiTools.connector");
  const { platformName } = useSystemSettings();
  const { showErrorToast } = useToast();
  const params = useParams();
  const id = params.id as Id<"toolConnectors">;

  const searchParams = useSearchParams();

  const details = useQuery(api.aiTools.getConnectorInstallDetails, { connectorId: id });
  const companyOptions = useQuery(api.companies.getCompanyOptions, details?.canManageTenantScope ? {} : "skip") || [];
  const updateConnectorInstall = useMutation(api.aiTools.updateConnectorInstall);
  const validateConnectorConfiguration = useMutation(api.aiTools.validateConnectorConfiguration);
  const beginConnectorOAuth = useMutation(api.aiTools.beginConnectorOAuth);
  const disconnectConnectorOAuth = useMutation(api.aiTools.disconnectConnectorOAuth);

  const [draft, setDraft] = useState<ConnectorDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // The callback route lands the admin back here with the outcome in the URL.
  const oauthCallbackError = searchParams.get("oauthError");

  if (details === undefined) {
    return <div className="p-8 text-secondary">{t("loading")}</div>;
  }
  if (!details?.connector) {
    return <div className="p-8 text-secondary">{t("notFound")}</div>;
  }

  const { connector, definition } = details;
  const tools = details.tools ?? [];
  const testLogs = details.testLogs ?? [];
  // The definition, not the copy frozen into the install row. Renaming a tool
  // used to leave every existing install showing its old name for ever.
  const name = definition?.name ?? connector.name;
  const description = definition?.description ?? connector.description;
  const requiredSecretRefs = definition?.requiredSecretRefs ?? [];
  const toolDefinitions = definition?.toolDefinitions ?? [];

  const form: ConnectorDraft = draft ?? {
    configuredSecretRefs: (connector.configuredSecretRefs ?? []).join(", "),
    enabledToolMappings: connector.enabledToolMappings ?? [],
    isActive: connector.isActive,
    tenantAvailability: connector.tenantAvailability,
    companyId: connector.companyId ?? "",
    authAccountRef: connector.authAccountRef ?? "",
  };
  // The bound account — a phone number, say. Only where the definition asks
  // for one; an OAuth connector's account belongs to the consent flow.
  const accountRefLabel = connector.authMode !== "OAUTH" ? definition?.accountRefLabel : undefined;
  const updateDraft = (patch: Partial<ConnectorDraft>) => setDraft({ ...form, ...patch });

  const latestCheck = testLogs[0];
  const missingRefs = requiredSecretRefs.filter((ref) => !parseSecretRefs(form.configuredSecretRefs).includes(ref));

  const toggleTool = (handlerMapping: string) => {
    const enabled = new Set(form.enabledToolMappings);
    if (enabled.has(handlerMapping)) enabled.delete(handlerMapping);
    else enabled.add(handlerMapping);
    updateDraft({ enabledToolMappings: Array.from(enabled) });
  };

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (isSaving) return;
    setIsSaving(true);
    try {
      await updateConnectorInstall({
        connectorId: id,
        configuredSecretRefs: parseSecretRefs(form.configuredSecretRefs),
        enabledToolMappings: form.enabledToolMappings,
        isActive: form.isActive,
        ...(accountRefLabel ? { authAccountRef: form.authAccountRef } : {}),
        ...(details.canManageTenantScope ? {
          tenantAvailability: form.tenantAvailability,
          companyId: form.companyId ? form.companyId as Id<"companies"> : undefined,
        } : {}),
      });
      setDraft(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCheck = async () => {
    if (isChecking) return;
    setIsChecking(true);
    try {
      await validateConnectorConfiguration({ connectorId: id });
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
    } finally {
      setIsChecking(false);
    }
  };

  const handleConnect = async () => {
    if (isConnecting) return;
    setIsConnecting(true);
    try {
      // Begin stores the pending connection; the browser then carries only
      // its single-use state to the consent screen and back.
      const { authorizationUrl } = await beginConnectorOAuth({ connectorId: id });
      window.location.href = authorizationUrl;
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      await disconnectConnectorOAuth({ connectorId: id });
    } catch (error) {
      showErrorToast(error, { scope: "admin-connector-detail" });
    } finally {
      setIsDisconnecting(false);
    }
  };

  const isOAuthConnector = (definition?.authMode ?? connector.authMode) === "OAUTH";
  const connectionStatus = connector.authConnectionStatus ?? "NOT_CONNECTED";

  return (
    <div className="flex w-full flex-col gap-6 pb-12 animate-in fade-in slide-in-from-bottom-2">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/ai/tools"
          className="flex w-max items-center gap-2 text-[12px] text-muted transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("back")}
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{name}</h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">{description}</p>
          </div>
          <SaveAction
            isSaving={isSaving}
            label={t("save")}
            savingLabel={t("saving")}
            successLabel={t("saved")}
            showSuccess={saveSuccess}
            onClick={handleSave}
          />
        </div>
      </header>

      <form onSubmit={handleSave} className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-6">
          <Card title={t("settingsTitle")}>
            <div className="divide-y divide-border-dim/40">
              <SettingSwitch
                label={definition?.category === "VOICE" ? t("takingCalls") : t("availableToAgents")}
                description={definition?.category === "VOICE"
                  ? (form.isActive ? t("voiceOn") : t("voiceOff"))
                  : (form.isActive ? t("agentsOn") : t("agentsOff"))}
                checked={form.isActive}
                onChange={(next) => updateDraft({ isActive: next })}
              />
              {details.canManageTenantScope && (
                <div className="flex flex-col gap-2 py-4">
                  <span className="text-[13px] font-medium text-foreground">{t("whoCanUse")}</span>
                  <select
                    aria-label={t("whoCanUse")}
                    value={form.tenantAvailability}
                    onChange={(event) => updateDraft({
                      tenantAvailability: event.target.value as "GLOBAL" | "TENANT_RESTRICTED",
                      companyId: event.target.value === "GLOBAL" ? "" : form.companyId,
                    })}
                    className="h-[46px] w-full max-w-sm cursor-pointer rounded-[12px] border border-border-dim bg-black/20 px-4 text-[13px] text-foreground outline-none focus:border-brand/50"
                  >
                    <option value="GLOBAL">{t("everyCompany")}</option>
                    <option value="TENANT_RESTRICTED">{t("oneCompany")}</option>
                  </select>
                  {form.tenantAvailability === "TENANT_RESTRICTED" && (
                    <select
                      aria-label={t("company")}
                      value={form.companyId}
                      onChange={(event) => updateDraft({ companyId: event.target.value })}
                      className="h-[46px] w-full max-w-sm cursor-pointer rounded-[12px] border border-border-dim bg-black/20 px-4 text-[13px] text-foreground outline-none focus:border-brand/50"
                    >
                      <option value="">{t("chooseCompany")}</option>
                      {companyOptions.map((company: { _id: string; name: string }) => (
                        <option key={company._id} value={company._id}>{company.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              )}
              {accountRefLabel && (
                <div className="flex flex-col gap-2 py-4">
                  <Field
                    id="connector-account-ref"
                    label={accountRefLabel}
                    hint={t("accountRefHint")}
                    value={form.authAccountRef}
                    onChange={(event) => updateDraft({ authAccountRef: event.target.value })}
                    placeholder="+44..."
                    className="max-w-sm"
                  />
                </div>
              )}
              {/* Only shown when this tool genuinely needs one. The old screen
                  drew the box on every connector, including the ones that
                  answered "No secret references are required" directly beneath it. */}
              {requiredSecretRefs.length > 0 && (
                <div className="flex flex-col gap-2 py-4">
                  <Field
                    id="connector-secrets"
                    label={t("keysLabel")}
                    hint={t("keysHint", { refs: requiredSecretRefs.join(" and "), platformName })}
                    value={form.configuredSecretRefs}
                    onChange={(event) => updateDraft({ configuredSecretRefs: event.target.value })}
                    placeholder={requiredSecretRefs.join(", ")}
                    className="max-w-sm"
                  />
                  {missingRefs.length > 0 && (
                    <p className="text-[12px] leading-relaxed text-amber-400">
                      {t("stillMissing", { refs: missingRefs.join(", ") })}
                    </p>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card title={t("whatItCanDo")}>
            {toolDefinitions.length === 0 ? (
              <p className="text-[13px] text-secondary">{t("nothingToSwitch")}</p>
            ) : (
              <div className="divide-y divide-border-dim/40">
                {toolDefinitions.map((tool) => (
                  <SettingSwitch
                    key={tool.handlerMapping}
                    label={tool.name}
                    description={tool.description}
                    checked={form.enabledToolMappings.includes(tool.handlerMapping)}
                    onChange={() => toggleTool(tool.handlerMapping)}
                  />
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6">
          {/* The consent connection: the account this tool acts as. Only for
              OAuth connectors — everything else authenticates with keys. */}
          {isOAuthConnector && (
            <Card title={t("connectedAccount")}>
              {connectionStatus === "CONNECTED" ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[#10b981]" />
                    <div className="min-w-0">
                      <p className="text-[13px] leading-relaxed text-foreground">
                        {t.rich("connectedAs", {
                          account: connector.authAccountRef ?? "",
                          b: (chunks) => <span className="font-medium">{chunks}</span>,
                        })}
                      </p>
                      {connector.oauthConnectedAt ? (
                        <p className="mt-1 text-[12px] text-muted">
                          {t("since", { date: formatDateTime(connector.oauthConnectedAt) })}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Button
                    variant="quiet"
                    onClick={handleDisconnect}
                    disabled={isDisconnecting}
                    className="inline-flex h-9 w-max items-center gap-2 px-4 text-[13px] text-foreground bg-transparent hover:bg-foreground/5"
                  >
                    {isDisconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {isDisconnecting ? t("disconnecting") : t("disconnect")}
                  </Button>
                  <p className="text-[12px] leading-relaxed text-muted">
                    {t("disconnectNote")}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] leading-relaxed text-secondary">
                    {connectionStatus === "ERROR"
                      ? connector.lastTestMessage ?? t("connectionFailed")
                      : t("notConnectedExplain")}
                  </p>
                  {oauthCallbackError ? (
                    <p className="text-[12px] leading-relaxed text-amber-400" role="alert">{oauthCallbackError}</p>
                  ) : null}
                  <Button
                    variant="brand"
                    onClick={handleConnect}
                    disabled={isConnecting}
                    className="inline-flex h-9 w-max items-center gap-2 rounded-[8px] disabled:opacity-50"
                  >
                    {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                    {isConnecting ? t("openingGoogle") : t("connectMailbox")}
                  </Button>
                </div>
              )}
            </Card>
          )}

          <Card title={t("doesItWork")}>
            {latestCheck ? (
              <div className="flex items-start gap-3">
                {latestCheck.status === "SUCCESS"
                  ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#10b981]" />
                  : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />}
                <div className="min-w-0">
                  <p className="text-[13px] leading-relaxed text-foreground">
                    {latestCheck.status === "SUCCESS" ? t("working") : latestCheck.message}
                  </p>
                  <p className="mt-1 text-[12px] text-muted">
                    {t("lastChecked", { date: formatDateTime(latestCheck.testedAt) })}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-secondary">
                {t("notCheckedYet")}
              </p>
            )}
            <Button
              variant="quiet"
              onClick={handleCheck}
              disabled={isChecking}
              className="mt-1 inline-flex h-9 w-max items-center gap-2 px-4 text-[13px] text-foreground bg-transparent hover:bg-foreground/5"
            >
              {isChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {isChecking ? t("checking") : t("checkNow")}
            </Button>
          </Card>

          {/* Only when there is something to show. Two of the three panels here
              used to be permanent, and normally read "No … yet". */}
          {tools.length > 0 && (
            <Card title={t("toolsCreated")}>
              <ul className="flex flex-col gap-2">
                {tools.map((tool: { _id: string; name: string; isActive?: boolean }) => (
                  <li key={tool._id} className="flex items-center justify-between gap-3 text-[13px]">
                    <Link href={`/admin/ai/tools/${tool._id}`} className="text-foreground transition-colors hover:text-brand">
                      {tool.name}
                    </Link>
                    {tool.isActive === false ? <span className="text-[12px] text-muted">{t("off")}</span> : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </form>
    </div>
  );
}
