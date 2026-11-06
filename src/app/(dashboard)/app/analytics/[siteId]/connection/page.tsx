"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "convex/react";
import { Plug } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { Field } from "@/src/ui/components/screens/Field";
import { ListTable } from "@/src/ui/components/screens/ListTable";
import { Meter } from "@/src/ui/components/screens/Meter";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { formatDateTime, formatLongDate, formatTime } from "@/src/lib/dates";
import { isCopyAddress } from "@/convex/utils/analyticsAddresses";
import { NEVER_TICKED, PURCHASE_EVENT } from "@/convex/utils/analyticsEvents";
import { eventsWithAddresses } from "@/convex/utils/analyticsAddresses";
import { EVENT_KINDS, eventKind, type EventKind } from "@/convex/utils/conversionSteps";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { formatDay, formatNumber } from "../../../sites/_components/siteFormat";
import { ListDownload } from "../../../sites/_components/SiteDownloads";
import { AnalyticsConnectCard, useBeginAnalyticsConnect } from "../../_components/AnalyticsNotices";
import { currencySign, formatMoney } from "../../_components/analyticsFormat";
import { useEventName } from "../../_components/useEventName";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../_components/useAnalytics";

type Connection = NonNullable<AnalyticsStatus["connection"]>;
type HeldEvent = NonNullable<Connection["events"]>[number];
type HeldAddress = Connection["addressesRead"][number];

/**
 * A website's connection to Google Analytics (overview-new-page-plan-2026-11-06.md,
 * step 16; his Way 3): where a sign-in comes back to and says how it went; the
 * property, the website's one shown for a yes when only one records it; then
 * plain sentences saying how the figures get here, and the website's events and
 * addresses with their ticks where they are. Pressing Change looks in Google
 * Analytics for new events and turns the ticks on. The company's admins act here;
 * everyone else reads it. A connection page has no What Hakken sees of its own.
 */
export default function AnalyticsConnectionPage() {
  const t = useTranslations("googleAnalytics.connection");
  const status = useAnalyticsStatus();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Plug className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? <ConnectionBody status={status} /> : null}
    </div>
  );
}

function ConnectionBody({ status }: { status: AnalyticsStatus }) {
  const siteId = useAnalyticsSiteId();
  const connection = status.connection;
  return (
    <>
      {connection?.attempt ? <AttemptNote status={status} /> : null}
      {!connection || connection.status === "CONNECTING" ? (
        <AnalyticsConnectCard status={status} siteId={siteId} />
      ) : connection.status === "CHOOSING" ? (
        <ChooseProperty status={status} />
      ) : (
        <ConnectedPage status={status} />
      )}
    </>
  );
}

/** Why the last sign-in did not connect, with the account it was tried with. */
function AttemptNote({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.connection");
  const attempt = status.connection?.attempt;
  if (!attempt) return null;
  const account = attempt.account ?? t("someone");
  return (
    <Notice tone="warning">
      <span className="block font-medium text-foreground">{t(`attemptTitle.${attempt.outcome}`, { host: status.host, account })}</span>
      <span className="block">{t(`attempt.${attempt.outcome}`, { host: status.host, account })}</span>
    </Notice>
  );
}

/**
 * The property: when exactly one of the account's properties has a web stream
 * for the website, it is shown for a yes, with a way to see them all; otherwise
 * every property, the matching ones first.
 */
function ChooseProperty({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.connection");
  const siteId = useAnalyticsSiteId();
  const choose = useMutation(api.googleAnalyticsConnect.chooseGoogleAnalyticsProperty);
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-choose" });
  const { start, busy } = useBeginAnalyticsConnect(siteId);
  const choices = status.connection?.choices ?? [];
  const matching = choices.filter((choice) => choice.stream !== null);
  const [seeAll, setSeeAll] = useState(matching.length !== 1);
  const [picked, setPicked] = useState(matching[0]?.property ?? choices[0]?.property ?? "");
  const account = status.connection?.googleAccount ?? t("someone");
  const use = (property: string) => void run(() => choose({ siteId, property }), { fallbackMessage: t("failed") });
  const numberOf = (property: string) => t("propertyNumber", { id: property.replace(/^properties\//, "") });
  const records = <StatusLabel tone="success">{t("records", { host: status.host })}</StatusLabel>;
  const named = (name: string, line: string) => <span className="flex min-w-0 flex-col gap-0.5"><span className="truncate text-[13px] text-foreground">{name}</span><span className="text-[12.5px] text-secondary">{line}</span></span>;

  if (!seeAll && matching.length === 1) {
    const only = matching[0];
    return (
      <>
        <Heading title={t("oneTitle")} description={t("oneDescription", { account, host: status.host })} />
        <CompactList
          rows={[only]}
          rowKey={(choice) => choice.property}
          empty="–"
          columns={[
            { key: "name", cell: (choice) => named(choice.displayName, numberOf(choice.property)) },
            { key: "records", align: "right", className: "whitespace-nowrap", cell: () => records },
          ]}
        />
        {status.canManage ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="brand" disabled={isBusy()} onClick={() => use(only.property)}>{t("use")}</Button>
            <Button variant="ghost" onClick={() => setSeeAll(true)}>{t("notThisOne")}</Button>
          </div>
        ) : null}
        <p className="text-[12px] text-muted">{t("nextCounts")}</p>
      </>
    );
  }

  return (
    <>
      <Heading title={t("chooseTitle")} description={matching.length === 0 ? t("noneMatching", { account, host: status.host }) : t("chooseDescription", { account, host: status.host })} />
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
            <span className="min-w-0 flex-1">{named(choice.displayName, choice.stream ? numberOf(choice.property) : t("propertyAccount", { id: choice.property.replace(/^properties\//, ""), account: choice.accountName }))}</span>
            {choice.stream ? records : null}
          </label>
        ))}
      </fieldset>
      {status.canManage ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="brand" disabled={!picked || isBusy()} onClick={() => use(picked)}>{t("use")}</Button>
          <Button variant="quiet" disabled={busy} onClick={() => void start()}>{t("another")}</Button>
        </div>
      ) : null}
    </>
  );
}

function Heading({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-[15px] font-medium text-foreground">{title}</h2>
      <p className="text-[13px] text-secondary">{description}</p>
    </div>
  );
}

/**
 * A website with a property chosen: choosing its events the first time, or,
 * once connected, how its figures get here and its events and addresses. The
 * address's `change=1` is Change pressed, so a check's own screen can open it.
 */
function ConnectedPage({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.counts");
  const siteId = useAnalyticsSiteId();
  const connection = status.connection!;
  const changing = useSearchParams().get("change") === "1" && status.canManage && connection.status === "CONNECTED";
  const first = connection.status === "COUNTING";
  const reread = useMutation(api.googleAnalyticsConnect.changeWhatCounts);
  // Pressing Change looks in Google Analytics for new events, once: about 5 small asks. It's the only time that happens by itself.
  const asked = useRef(false);
  useEffect(() => {
    if (!changing || asked.current) return;
    asked.current = true;
    void reread({ siteId }).catch(() => undefined);
  }, [changing, reread, siteId]);

  return (
    <>
      {first ? <Notice>{t("firstNotice")}</Notice> : <HowItWorks status={status} />}
      <EventsAndAddresses key={changing || first ? "editing" : "reading"} status={status} editing={first || changing} first={first} />
      {!first && !changing ? <Disconnect status={status} /> : null}
    </>
  );
}

/** How the figures get here, as a person would say it, under one line saying if it's working. */
function HowItWorks({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.connection");
  const connection = status.connection!;
  const account = connection.googleAccount ?? t("someone");
  const working = connection.status === "CONNECTED" && !connection.problem;
  const since = connection.connectedAt ? formatLongDate(connection.connectedAt) : "";
  const updated = connection.lastCollectedAt && connection.newestDay
    ? new Date(connection.lastCollectedAt).toDateString() === new Date().toDateString()
      ? t("lines.lastToday", { time: formatTime(connection.lastCollectedAt, { options: { hour: "2-digit", minute: "2-digit" } }), day: formatDay(connection.newestDay) })
      : t("lines.lastOn", { when: formatDateTime(connection.lastCollectedAt), day: formatDay(connection.newestDay) })
    : t("lines.lastNone");
  const converting = connection.addressesRead.filter((address) => address.counted).map((address) => address.host);
  const read = [...connection.addresses, ...converting];
  const leftOut = new Set([...connection.otherAddresses.map((host) => host.toLowerCase()), ...connection.addressesRead.map((address) => address.host)].filter((host) => !converting.includes(host))).size;
  const lines = [
    t("lines.source"),
    updated,
    ...(connection.oldestDay ? [t("lines.history", { day: formatDay(connection.oldestDay) })] : []),
    connection.sharedWithSearchConsole ? t("lines.accountShared", { account }) : t("lines.account", { account }),
    `${t("lines.counted", { read: read.join(" and "), count: read.length })}${leftOut > 0 ? ` ${t("lines.leftOut", { count: leftOut })}` : ""}`,
  ];
  return (
    <>
      {connection.status === "CONNECTED" && connection.problem ? (
        <Notice tone="warning">{t(`problem.${connection.problem}`, { account, property: connection.propertyName ?? connection.property ?? "" })}</Notice>
      ) : null}
      <div className="flex flex-col gap-1.5">
        {working ? <StatusLabel tone="success" size="md">{t("status.working", { day: since })}</StatusLabel> : <StatusLabel tone="warning" size="md">{t("status.notUpdating")}</StatusLabel>}
      </div>
      <CompactList rows={lines} rowKey={(line) => line} empty="–" columns={[{ key: "line", className: "text-[13px] text-foreground", cell: (line) => line }]} />
    </>
  );
}

type Draft = { counted: boolean; value: string };
type EventRow = { event: HeldEvent; name: string; kind: EventKind; times: number; note: string | null };
type AddressRow = { host: string; held: HeldAddress | null; own: boolean; why: "OWN" | "SAME_DOMAIN" | "REACHED" | "NOT_REACHED" | "COPY" | "OTHER"; events: number };

const EVENT_SORTS: SiteSortColumns<EventRow, "name" | "kind" | "times"> = {
  name: { value: (row) => row.name, first: "asc" },
  kind: { value: (row) => EVENT_KINDS.indexOf(row.kind), first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
};

/** Why an address's events count or not, in the words beside it. */
function whyOf(address: HeldAddress): AddressRow["why"] {
  if (address.kind === "OTHER_DOMAIN") return address.reached ? "REACHED" : "NOT_REACHED";
  return address.kind;
}

/**
 * The website's events and addresses, each with its tick. Reading, the ticks are
 * off and a Change button turns them on. Changing, each event without a value
 * from Google Analytics has a box for one, and Save and Cancel sit under the
 * tables. Saving the first time starts collecting, and it applies to all history.
 */
function EventsAndAddresses({ status, editing, first }: { status: AnalyticsStatus; editing: boolean; first: boolean }) {
  const t = useTranslations("googleAnalytics.counts");
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const nameOf = useEventName();
  const save = useMutation(api.googleAnalyticsConnect.saveWhatCounts);
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-counts" });
  const connection = status.connection!;
  const events = connection.events;
  const sign = currencySign(connection.currency);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [kind, setKind] = useSiteParam<EventKind | "all">("kind", "all", ["all", ...EVENT_KINDS]);
  const [text, setText, term] = useSiteSearch();
  const [addressText, setAddressText, addressTerm] = useSiteSearch("q", "addresses");

  const held = connection.addressesRead;
  const tickOf = (address: HeldAddress) => ticks[address.host] ?? address.counted;
  const draftOf = (event: HeldEvent): Draft => drafts[event.eventName] ?? { counted: event.counted, value: event.hakkenValue === null ? "" : String(event.hakkenValue) };
  const set = (event: HeldEvent, change: Partial<Draft>) => setDrafts((before) => ({ ...before, [event.eventName]: { ...draftOf(event), ...change } }));

  // Each event's last 30 days on the website's own address and every other address ticked now.
  const shown = new Map(eventsWithAddresses(events ?? [], held, tickOf).map((event) => [event.eventName, event.lastThirtyDays]));
  const never = connection.health?.checks.find((check) => check.check === "NEVER_HAPPENS" && !check.passing);
  const quiet = new Set(never?.names ?? []);
  const noteOf = (event: HeldEvent): string | null => {
    const copy = connection.copies.find((pair) => pair.eventName === event.eventName || pair.of === event.eventName);
    if (copy) {
      const other = copy.eventName === event.eventName ? copy.of : copy.eventName;
      return NEVER_TICKED.has(other) ? t("notes.isReally", { other: nameOf(other) }) : t("notes.same", { other: nameOf(other) });
    }
    if (quiet.has(event.eventName)) return never?.count === 365 ? t("notes.quietYear") : t("notes.quiet");
    if (NEVER_TICKED.has(event.eventName) && !draftOf(event).counted) return t("notes.neverTicked");
    if (event.keyEvent === false) return t("notes.notKeyEvent");
    return null;
  };
  const allRows: EventRow[] = (events ?? []).map((event) => ({
    event,
    name: nameOf(event.eventName),
    kind: eventKind(event.eventName, quiet.has(event.eventName)),
    times: shown.get(event.eventName) ?? event.lastThirtyDays,
    note: noteOf(event),
  }));
  const search = term.toLowerCase();
  const chosen = allRows.filter((row) => (kind === "all" || row.kind === kind) && (!search || `${row.name} ${row.event.eventName}`.toLowerCase().includes(search)));
  const { rows: sorted, tableSort } = useSiteSortedList(chosen, EVENT_SORTS, { opening: "kind", name: (row) => row.name, group: (row) => EVENT_KINDS.indexOf(row.kind) });
  const pager = useSitePager(sorted, { isLoading: false });
  const most = allRows.reduce((sum, row) => sum + row.times, 0);

  // The website's own addresses, always counted; those read for events, each with its tick; the rest, with none to count.
  const listed = new Set(held.map((address) => address.host));
  const hostEvents = new Map((connection.hostConversions ?? []).map((one) => [one.host, one.conversions]));
  const addressRows: AddressRow[] = [
    ...connection.addresses.map((host): AddressRow => ({ host, held: null, own: true, why: "OWN", events: hostEvents.get(host) ?? 0 })),
    ...held.map((address): AddressRow => ({ host: address.host, held: address, own: false, why: whyOf(address), events: address.events.reduce((sum, event) => sum + event.month, 0) })),
    ...connection.otherAddresses.filter((host) => !listed.has(host.toLowerCase())).map((host): AddressRow => ({ host, held: null, own: false, why: isCopyAddress(host, status.host) ? "COPY" : "OTHER", events: 0 })),
  ];
  const addressSearch = addressTerm.toLowerCase();
  const addressShown = addressRows.filter((row) => !addressSearch || row.host.toLowerCase().includes(addressSearch));
  const addressPager = useSitePager(addressShown, { isLoading: false, table: "addresses" });

  if (!events) {
    // Google didn't answer when the events were read: said plainly, with when it's asked again by itself (BR1).
    if (connection.readAgainAt !== null) {
      return (
        <Notice tone="warning">
          <span className="block font-medium text-foreground">{t("readFailedTitle")}</span>
          <span className="block">{t("readFailed", { at: formatDateTime(connection.readAgainAt) })}</span>
          {connection.problemDetail ? <span className="block">{t("googleSaid", { words: connection.problemDetail })}</span> : null}
        </Notice>
      );
    }
    return <Notice>{t("reading")}</Notice>;
  }

  const invalid = events.some((event) => {
    const draft = draftOf(event);
    return draft.counted && draft.value.trim() !== "" && !(Number(draft.value) >= 0);
  });
  const counted = events.filter((event) => draftOf(event).counted).length;
  const canTick = editing && status.canManage;
  const download = (
    <ListDownload
      label={t("download")}
      fileName={`${status.host}-events`}
      rows={sorted ?? []}
      columns={[
        { header: t("columns.event"), value: (row) => row.name },
        { header: t("columns.google"), value: (row) => row.event.eventName },
        { header: t("columns.kind"), value: (row) => t(`kinds.${row.kind}`) },
        { header: t("columns.times"), value: (row) => row.times },
        { header: t("columns.note"), value: (row) => row.note ?? "" },
      ]}
    />
  );
  const valueOf = (row: EventRow) => {
    const { event } = row;
    if (event.analyticsValue !== null) return <span title={t("setInAnalytics")} className="font-mono text-[13px] text-foreground">{formatMoney(Math.round(event.analyticsValue * 100), connection.currency)}</span>;
    if (canTick && draftOf(event).counted && event.eventName !== PURCHASE_EVENT) {
      return (
        <Field
          label={t("valueLabel", { name: row.name })}
          labelHidden
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          placeholder={sign}
          value={draftOf(event).value}
          onChange={(input) => set(event, { value: input.target.value })}
          wrapperClassName="ml-auto w-24"
        />
      );
    }
    return event.hakkenValue !== null ? <span className="font-mono text-[13px] text-foreground">{formatMoney(Math.round(event.hakkenValue * 100), connection.currency)}</span> : <NoFigure />;
  };

  return (
    <>
      {events.length === 0 ? <Notice tone="warning">{t("noKeyEvents")}</Notice> : null}
      <ListTable<EventRow>
        noun="events"
        title={t("title")}
        description={first ? t("firstDescription") : editing ? t("changing") : t("reading_")}
        rows={pager.pageRows}
        rowKey={(row) => row.event.eventName}
        actions={<>{!editing && status.canManage && connection.status === "CONNECTED" ? <Button variant="quiet" className="px-3 py-2 text-[12px]" onClick={() => router.push(hrefFor("connection", { change: "1" }))}>{t("change")}</Button> : null}{download}</>}
        search={{ value: text, onChange: setText, placeholder: t("search") }}
        filters={(
          <Select aria-label={t("kindChip")} value={kind} onChange={(next) => setKind(next as EventKind | "all")} chip={{ label: t("kindChip"), choice: kind === "all" ? null : t(`kinds.${kind}`) }}>
            <option value="all">{t("everyKind")}</option>
            {EVENT_KINDS.map((one) => <option key={one} value={one}>{t(`kinds.${one}`)}</option>)}
          </Select>
        )}
        sort={tableSort}
        empty={{ icon: <Plug className="h-8 w-8 text-muted/30" />, label: t("emptyEvents") }}
        footer={pager.footer}
        columns={[
          { key: "tick", header: t("columns.counts"), cell: (row) => <Checkbox label={row.name} labelHidden checked={draftOf(row.event).counted} disabled={!canTick} onChange={(checked) => set(row.event, { counted: checked })} /> },
          { key: "name", header: t("columns.event"), sortable: true, cell: (row) => <span title={t("inAnalytics", { name: row.event.eventName })} className="whitespace-nowrap text-[13px] text-foreground">{row.name}</span> },
          { key: "kind", header: t("columns.kind"), sortable: true, cell: (row) => <TagLabel>{t(`kinds.${row.kind}`)}</TagLabel> },
          { key: "times", header: t("columns.times"), sortable: true, align: "right", cell: (row) => <span className="flex items-center justify-end gap-3"><Meter value={most > 0 ? row.times / most : 0} className="w-24" /><span className="w-12 font-mono text-[13px] text-foreground">{formatNumber(row.times)}</span></span> },
          { key: "value", header: t("columns.value"), align: "right", cell: valueOf },
          { key: "note", header: t("columns.note"), cell: (row) => (row.note ? <span className="text-[12.5px] text-secondary">{row.note}</span> : null) },
        ]}
      />
      <ListTable<AddressRow>
        noun="addresses"
        title={t("addresses.title")}
        description={t("addresses.description")}
        rows={addressPager.pageRows}
        rowKey={(row) => row.host}
        search={{ value: addressText, onChange: setAddressText, placeholder: t("addresses.search") }}
        empty={{ icon: <Plug className="h-8 w-8 text-muted/30" />, label: t("addresses.empty") }}
        footer={addressPager.footer}
        columns={[
          { key: "tick", header: t("columns.counts"), cell: (row) => <Checkbox label={row.host} labelHidden checked={row.own || (row.held ? tickOf(row.held) : false)} disabled={!canTick || row.held === null} onChange={(checked) => setTicks((before) => ({ ...before, [row.host]: checked }))} /> },
          { key: "host", header: t("addresses.address"), cell: (row) => <span className="break-all text-[13px] text-foreground">{row.host}</span> },
          { key: "why", header: t("addresses.what"), cell: (row) => <span className="text-[12.5px] text-secondary">{t(`addresses.why.${row.why}`)}</span> },
          { key: "events", header: t("columns.times"), align: "right", cell: (row) => <span className="font-mono text-[13px] text-foreground">{formatNumber(row.events)}</span> },
        ]}
      />
      {canTick ? (
        <div className="flex flex-col items-start gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="brand"
              disabled={invalid || isBusy()}
              onClick={async () => {
                const outcome = await run(() => save({
                  siteId,
                  events: events.map((event) => {
                    const draft = draftOf(event);
                    return { eventName: event.eventName, counted: draft.counted, hakkenValue: draft.value.trim() === "" ? null : Number(draft.value) };
                  }),
                  addresses: held.map((address) => ({ host: address.host, counted: tickOf(address) })),
                }), { fallbackMessage: t("failed") });
                if (outcome.ok) router.push(first ? hrefFor("") : hrefFor("connection", { change: "0" }));
              }}
            >
              {t("save", { count: counted })}
            </Button>
            {first ? null : <Button variant="ghost" onClick={() => router.push(hrefFor("connection", { change: "0" }))}>{t("cancel")}</Button>}
          </div>
          {first ? <p className="text-[12px] text-muted">{t("startsAtOnce")}</p> : null}
        </div>
      ) : null}
    </>
  );
}

/** The way to disconnect, for an admin of a connected website. */
function Disconnect({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.connection");
  const siteId = useAnalyticsSiteId();
  const disconnect = useMutation(api.googleAnalyticsConnect.disconnectGoogleAnalytics);
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-disconnect" });
  const [confirming, setConfirming] = useState(false);
  if (!status.canManage || status.connection?.status !== "CONNECTED") return null;
  return (
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
  );
}
