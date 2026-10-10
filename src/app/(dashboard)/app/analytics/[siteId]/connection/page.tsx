"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { Plug, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { Field } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { formatDate, formatDateTime } from "@/src/lib/dates";
import { NEVER_TICKED } from "@/convex/utils/analyticsEvents";
import { SiteFacts } from "../../../sites/_components/SiteRecordParts";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { formatDay, formatNumber } from "../../../sites/_components/siteFormat";
import { AnalyticsConnectCard, useBeginAnalyticsConnect } from "../../_components/AnalyticsNotices";
import { currencySign, formatMoney } from "../../_components/analyticsFormat";
import { useEventName } from "../../_components/useEventName";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../_components/useAnalytics";

const PANEL = "rounded-2xl border border-border-dim bg-card/40 p-6";

/**
 * A website's connection to Google Analytics (§3; §11 boards 11 to 14):
 * where a sign-in comes back to and says how it went; the property, the
 * website's one shown for a yes when only one records it (GA22); what counts
 * as a conversion and what each is worth (GA5, GA3, GA6); and, once
 * connected, the property, address and account, how far the figures go, what
 * counts, and the way to disconnect. The company's admins act here; everyone
 * else reads it.
 */
export default function AnalyticsConnectionPage() {
  const t = useTranslations("googleAnalytics.connection");
  const status = useAnalyticsStatus();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Plug className="h-5 w-5 text-brand" />} title={t("title")} description={t("description", { host: status?.host ?? "" })} />
      {status ? <ConnectionBody status={status} /> : null}
    </div>
  );
}

function ConnectionBody({ status }: { status: AnalyticsStatus }) {
  const siteId = useAnalyticsSiteId();
  const connection = status.connection;
  const changing = useSearchParams().get("change") === "1";
  return (
    <>
      {connection?.attempt ? <AttemptNote status={status} /> : null}
      {!connection || connection.status === "CONNECTING" ? (
        <AnalyticsConnectCard status={status} siteId={siteId} />
      ) : connection.status === "CHOOSING" ? (
        <ChooseProperty status={status} />
      ) : connection.status === "COUNTING" || (changing && status.canManage && connection.status === "CONNECTED") ? (
        <ChooseWhatCounts status={status} changing={connection.status === "CONNECTED"} />
      ) : (
        <ConnectionDetails status={status} />
      )}
    </>
  );
}

/** Why the last sign-in did not connect, with the account it was tried with. */
function AttemptNote({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.connection");
  const { platformName } = useSystemSettings();
  const attempt = status.connection?.attempt;
  if (!attempt) return null;
  const account = attempt.account ?? t("someone");
  return (
    <Notice tone="warning">
      <span className="block font-medium text-foreground">{t(`attemptTitle.${attempt.outcome}`, { host: status.host, account })}</span>
      <span className="block">{t(`attempt.${attempt.outcome}`, { host: status.host, account, platformName })}</span>
    </Notice>
  );
}

/**
 * The property (§3, step 3): when exactly one of the account's properties has
 * a web stream for the website, it is shown for a yes, with "Not this one?
 * See all" (GA22); otherwise every property, the matching ones first.
 */
function ChooseProperty({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.connection");
  const siteId = useAnalyticsSiteId();
  const choose = useMutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty);
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-choose" });
  const { start, busy } = useBeginAnalyticsConnect(siteId);
  const { platformName } = useSystemSettings();
  const choices = status.connection?.choices ?? [];
  const matching = choices.filter((choice) => choice.stream !== null);
  const [seeAll, setSeeAll] = useState(matching.length !== 1);
  const [picked, setPicked] = useState(matching[0]?.property ?? choices[0]?.property ?? "");
  const account = status.connection?.googleAccount ?? t("someone");
  const use = (property: string) => void run(() => choose({ siteId, property }), { fallbackMessage: t("failed") });
  const addressLine = (choice: (typeof choices)[number]) => (choice.addresses.length > 0
    ? choice.others.length > 0
      ? t("addressesLine", { count: choice.addresses.length + choice.others.length, read: choice.addresses.join(", "), host: status.host, platformName })
      : t("addressLine", { read: choice.addresses.join(", "), platformName })
    : null);

  if (!seeAll && matching.length === 1) {
    const only = matching[0];
    return (
      <div className={`${PANEL} flex flex-col gap-4`}>
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-medium text-foreground">{t("oneTitle", { host: status.host })}</h2>
          <p className="text-[13px] text-secondary">{t("oneDescription", { account, count: choices.length, host: status.host })}</p>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-border-dim px-4 py-3">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] text-foreground">{only.displayName}</span>
            <span className="text-[12px] text-secondary">{t("propertyLine", { id: only.property.replace(/^properties\//, ""), stream: (only.stream ?? "").replace(/^https?:\/\//, "") })}</span>
          </span>
          <StatusLabel tone="success">{t("records", { host: status.host })}</StatusLabel>
        </div>
        {status.canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="brand" disabled={isBusy()} onClick={() => use(only.property)}>{t("useThis")}</Button>
            <Button variant="ghost" onClick={() => setSeeAll(true)}>{t("notThisOne", { count: choices.length })}</Button>
          </div>
        ) : null}
        {addressLine(only) ? <p className="text-[12px] text-muted">{addressLine(only)} {t("nextCounts")}</p> : null}
      </div>
    );
  }

  return (
    <div className={`${PANEL} flex flex-col gap-4`}>
      <div className="flex flex-col gap-1">
        <h2 className="text-[15px] font-medium text-foreground">{t("chooseTitle")}</h2>
        <p className="text-[13px] text-secondary">
          {matching.length === 0 ? t("noneMatching", { account, host: status.host }) : t("chooseDescription", { account, host: status.host })}
        </p>
      </div>
      <fieldset className="flex flex-col divide-y divide-border-dim/50 overflow-hidden rounded-xl border border-border-dim">
        <legend className="sr-only">{t("chooseTitle")}</legend>
        {choices.map((choice) => (
          <label key={choice.property} className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-hover">
            <input
              type="radio"
              name="google-analytics-property"
              value={choice.property}
              checked={picked === choice.property}
              disabled={!status.canManage}
              onChange={() => setPicked(choice.property)}
              className="accent-brand"
            />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] text-foreground">{choice.displayName}</span>
              <span className="text-[12px] text-secondary">
                {choice.stream
                  ? t("propertyLine", { id: choice.property.replace(/^properties\//, ""), stream: choice.stream.replace(/^https?:\/\//, "") })
                  : t("propertyAccount", { id: choice.property.replace(/^properties\//, ""), account: choice.accountName })}
              </span>
            </span>
            {choice.stream ? <StatusLabel tone="success">{t("records", { host: status.host })}</StatusLabel> : null}
          </label>
        ))}
      </fieldset>
      {status.canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="brand" disabled={!picked || isBusy()} onClick={() => use(picked)}>{t("use")}</Button>
          <Button variant="quiet" disabled={busy} onClick={() => void start()}>{t("another")}</Button>
        </div>
      ) : null}
    </div>
  );
}

type Draft = { counted: boolean; where: "HAKKEN" | "ANALYTICS"; value: string };

/**
 * What counts (§3, step 5; §11 board 13): the property's key events, the
 * likely ones ticked, a scroll never; for each ticked one its value from
 * Analytics, or the choice to set it in Hakken or in Google Analytics. Saving
 * connects the website and starts collecting at once (§10, Q15).
 */
function ChooseWhatCounts({ status, changing }: { status: AnalyticsStatus; changing: boolean }) {
  const t = useTranslations("googleAnalytics.counts");
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const nameOf = useEventName();
  const save = useMutation(api.googleAnalyticsConnect.saveWhatCounts);
  const reread = useMutation(api.googleAnalyticsConnect.changeWhatCounts);
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-counts" });
  const { platformName } = useSystemSettings();
  const connection = status.connection!;
  const events = connection.events;
  const sign = currencySign(connection.currency);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  // Changing what counts on a connected website reads the property's key events again, once.
  const asked = useRef(false);
  useEffect(() => {
    if (!changing || asked.current) return;
    asked.current = true;
    void reread({ siteId }).catch(() => undefined);
  }, [changing, reread, siteId]);

  if (!events) {
    return <Notice>{t("reading")}</Notice>;
  }
  const draftOf = (eventName: string): Draft => {
    const held = events.find((event) => event.eventName === eventName)!;
    return drafts[eventName] ?? { counted: held.counted, where: "HAKKEN", value: held.hakkenValue === null ? "" : String(held.hakkenValue) };
  };
  const set = (eventName: string, change: Partial<Draft>) => setDrafts((before) => ({ ...before, [eventName]: { ...draftOf(eventName), ...change } }));
  const counted = events.filter((event) => draftOf(event.eventName).counted).length;
  const invalid = events.some((event) => {
    const draft = draftOf(event.eventName);
    return draft.counted && draft.value.trim() !== "" && !(Number(draft.value) >= 0);
  });
  const others = connection.otherAddresses;

  return (
    <div className="flex flex-col gap-4">
      {others.length > 0 ? (
        <Notice>{t("addresses", { count: connection.addresses.length + others.length, property: connection.propertyName ?? "", host: status.host, read: connection.addresses.join(", "), others: others.join(", "), platformName })}</Notice>
      ) : null}
      <div className={`${PANEL} flex flex-col gap-4`}>
        <div className="flex flex-col gap-1">
          <h2 className="text-[15px] font-medium text-foreground">{t("title")}</h2>
          <p className="text-[13px] text-secondary">{t("description", { property: connection.propertyName ?? "", platformName })}</p>
        </div>
        {events.length === 0 ? <Notice tone="warning">{t("noKeyEvents")}</Notice> : null}
        <div className="flex flex-col divide-y divide-border-dim/50 overflow-hidden rounded-xl border border-border-dim">
          {events.map((event) => {
            const draft = draftOf(event.eventName);
            const name = nameOf(event.eventName);
            return (
              <div key={event.eventName} className="flex flex-col gap-3 px-4 py-3">
                <div className="flex items-start gap-3">
                  <Checkbox label={name} labelHidden checked={draft.counted} disabled={!status.canManage} onChange={(checked) => set(event.eventName, { counted: checked })} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[13px] text-foreground">{name}</span>
                    <span className="text-[12px] text-secondary">
                      <span className="font-mono">{event.eventName}</span> · {t("lastThirty", { count: formatNumber(event.lastThirtyDays) })}
                    </span>
                  </span>
                  <span className="text-[12px] text-secondary">
                    {event.analyticsValue !== null ? t("inAnalytics", { value: formatMoney(Math.round(event.analyticsValue * 100), connection.currency) }) : t("noValueInAnalytics")}
                  </span>
                </div>
                {NEVER_TICKED.has(event.eventName) && !draft.counted ? <p className="pl-7 text-[12px] text-muted">{t("neverTicked")}</p> : null}
                {draft.counted && event.analyticsValue === null ? (
                  <div className="flex flex-col items-start gap-3 pl-7">
                    <SiteViewSwitch
                      label={t("whereLabel")}
                      options={[{ value: "HAKKEN" as const, label: t("setInHakken", { platformName }) }, { value: "ANALYTICS" as const, label: t("setInAnalytics") }]}
                      value={draft.where}
                      onChange={(where) => set(event.eventName, { where })}
                    />
                    {draft.where === "HAKKEN" ? (
                      <Field
                        label={t("valueLabel", { sign })}
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        placeholder={t("valuePlaceholder")}
                        value={draft.value}
                        disabled={!status.canManage}
                        onChange={(input) => set(event.eventName, { value: input.target.value })}
                        wrapperClassName="max-w-[220px]"
                        hint={draft.value.trim() === "" ? t("noValueYet") : t("worth", { name: name.toLowerCase(), value: `${sign}${draft.value}` })}
                      />
                    ) : (
                      <ol className="max-w-2xl list-decimal pl-5 text-[12.5px] text-secondary">
                        {(["one", "two", "three", "four"] as const).map((step) => <li key={step}>{t(`analyticsSteps.${step}`, { event: event.eventName, platformName })}</li>)}
                      </ol>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className="text-[12px] text-muted">{t("appliesToHistory", { platformName })}</p>
        {status.canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="brand"
              disabled={invalid || isBusy()}
              onClick={async () => {
                const outcome = await run(() => save({
                  siteId,
                  events: events.map((event) => {
                    const draft = draftOf(event.eventName);
                    const value = draft.value.trim() === "" ? null : Number(draft.value);
                    return { eventName: event.eventName, counted: draft.counted, hakkenValue: value };
                  }),
                }), { fallbackMessage: t("failed") });
                if (outcome.ok) router.push(changing ? hrefFor("connection") : hrefFor(""));
              }}
            >
              {t("save", { count: counted })}
            </Button>
            {changing ? <Button variant="ghost" onClick={() => router.push(hrefFor("connection"))}>{t("back")}</Button> : null}
          </div>
        ) : null}
        {!changing ? <p className="text-[12px] text-muted">{t("startsAtOnce")}</p> : null}
      </div>
    </div>
  );
}

/** A website connected once: its property, address and account, how far its figures go, what counts, and the way to disconnect. */
function ConnectionDetails({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.connection");
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const nameOf = useEventName();
  const disconnect = useMutation(api.googleAnalyticsConnect.disconnectGoogleAnalytics);
  const { platformName } = useSystemSettings();
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-disconnect" });
  const [confirming, setConfirming] = useState(false);
  const connection = status.connection!;
  const account = connection.googleAccount ?? t("someone");
  const facts = [
    {
      key: "property",
      label: t("property"),
      value: <span>{connection.propertyName ?? "–"} <span className="font-mono">{(connection.property ?? "").replace(/^properties\//, "")}</span></span>,
    },
    {
      key: "address",
      label: t("address"),
      value: <span><span className="font-mono">{connection.addresses.join(", ") || "–"}</span>{connection.otherAddresses.length > 0 ? ` · ${t("othersLeftOut", { count: connection.otherAddresses.length })}` : ""}</span>,
    },
    { key: "account", label: t("account"), value: connection.sharedWithSearchConsole ? t("sameSignIn", { account }) : account },
    { key: "connected", label: t("connected"), value: connection.connectedAt ? formatDate(connection.connectedAt) : "–" },
    {
      key: "updated",
      label: t("lastUpdated"),
      value: connection.lastCollectedAt && connection.newestDay
        ? t("updatedDetail", { when: formatDateTime(connection.lastCollectedAt), day: formatDay(connection.newestDay) })
        : t("notYet"),
    },
    { key: "history", label: t("history"), value: connection.oldestDay ? t("historyKept", { day: formatDay(connection.oldestDay) }) : t("notYet") },
    { key: "collected", label: t("collected"), value: t("collectedDetail") },
  ];
  const counted = (connection.events ?? []).filter((event) => event.counted);

  return (
    <div className="flex flex-col gap-4">
      {connection.status === "CONNECTED" && connection.problem ? (
        <Notice tone="warning">{t(`problem.${connection.problem}`, { account, property: connection.propertyName ?? connection.property ?? "" })}</Notice>
      ) : null}
      <div className={PANEL}>
        <SiteFacts facts={facts} empty="–" />
      </div>
      <div className={`${PANEL} flex flex-col gap-3`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-medium text-foreground">{t("countsTitle")}</h2>
            <p className="text-[13px] text-secondary">{t("countsDescription", { host: status.host, platformName })}</p>
          </div>
          {status.canManage && connection.status === "CONNECTED" ? (
            <Button variant="quiet" className="px-3 py-2 text-[12px]" onClick={() => router.push(hrefFor("connection", { change: "1" }))}>{t("change")}</Button>
          ) : null}
        </div>
        <CompactList
          rows={counted}
          rowKey={(event) => event.eventName}
          empty={t("nothingCounted")}
          columns={[
            { key: "name", header: t("conversion"), cell: (event) => <span className="text-[13px] text-foreground">{nameOf(event.eventName)}</span> },
            { key: "event", header: t("inAnalyticsHeading"), cell: (event) => <span className="font-mono text-[12px] text-secondary">{event.eventName}</span> },
            {
              key: "each",
              header: t("valueEach"),
              align: "right",
              cell: (event) => (event.analyticsValue !== null
                ? <span className="font-mono text-[12px] text-secondary">{formatMoney(Math.round(event.analyticsValue * 100), connection.currency)}</span>
                : event.hakkenValue !== null
                  ? <span className="font-mono text-[12px] text-secondary">{formatMoney(Math.round(event.hakkenValue * 100), connection.currency)}</span>
                  : <span className="inline-flex items-center gap-1.5 text-[12px] text-secondary"><TriangleAlert className="h-3.5 w-3.5 text-warning" aria-hidden="true" />{t("noValue")}</span>),
            },
            { key: "setIn", header: t("setInHeading"), cell: (event) => <span className="text-[12px] text-secondary">{event.analyticsValue !== null ? t("setIn.ANALYTICS") : event.hakkenValue !== null ? t("setIn.HAKKEN", { platformName }) : "–"}</span> },
          ]}
        />
      </div>
      {status.canManage && connection.status === "CONNECTED" ? (
        <>
          <div className="flex flex-col items-start gap-2">
            <Button variant="outline" onClick={() => setConfirming(true)}>{t("disconnect")}</Button>
            <p className="text-[12px] text-muted">{t("disconnectHint")}</p>
          </div>
          {/* A yes or a no, so the kit's confirmation (AGENTS.md: a pop-up is only for a yes or a no). */}
          <ConfirmationModal
            isOpen={confirming}
            onClose={() => setConfirming(false)}
            title={t("disconnectTitle")}
            cancelLabel={t("keep")}
            confirmLabel={t("confirmDisconnect")}
            isSubmitting={isBusy()}
            onConfirm={async () => {
              const outcome = await run(() => disconnect({ siteId }), { fallbackMessage: t("failed") });
              if (outcome.ok) setConfirming(false);
            }}
          >
            {t("confirm")}
          </ConfirmationModal>
        </>
      ) : null}
    </div>
  );
}
