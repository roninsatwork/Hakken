"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness } from "lucide-react";
import { useTranslations } from "next-intl";
import { servicesEyeData } from "@/convex/utils/sees/analyticsServices";
import { SERVICE_GROUPS, perHundredOf, type ServiceGroup } from "@/convex/utils/serviceGroups";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { ListTable } from "@/src/ui/components/screens/ListTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { toCsv } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ConversionsHereCell, FigureCell, UpOrDownCell } from "../../_components/AnalyticsCells";
import { useEyeNames } from "../../_components/useEyeFigures";
import { periodWord, useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePeriod, type AnalyticsStatus } from "../../_components/useAnalytics";
import { ServiceBoxes, ServiceDotsCard, ServiceMapCard, ServiceMonthCard, useOpenService, useServiceGroups, useServices, type Service, type ServiceGroups, type ServicesAnswer } from "./_components/ServiceParts";

/**
 * Services (docs/plans/active/services-new-page-plan-2026-11-07.md; board "The new page so far" on the canvas "Hakken — Services,
 * four ways"): the services people look at, and the ones that get them in touch, for a website that sells services rather than
 * products. Four boxes, one for each group named by its numbers; each service's visits each month; the dots; the map; then the
 * table. A service is a page in a Classification whose type is Service. All of it from the Google Analytics events already
 * saved: nothing new is asked of Google, and there's no money anywhere. A service business says Events (Anthony, 2026-11-06).
 */
export default function AnalyticsServicesPage() {
  const t = useTranslations("googleAnalytics.services");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<BriefcaseBusiness className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <ServicesBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function ServicesBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.services");
  const answer = useServices();
  const groups = useServiceGroups(answer);
  const router = useRouter();
  const openService = useOpenService();
  const open = (service: Service) => router.push(openService(service));
  if (answer === undefined) return null;
  if (answer.state === "noServices") return <Notice>{t("noServices", { host: status.host })}</Notice>;
  if (answer.state !== "ready") return <Notice>{t("collecting")}</Notice>;
  return (
    <div className="flex flex-col gap-6">
      <ServicesSees answer={answer} groups={groups} />
      {answer.everyDevice ? <Notice>{t("everyDevice")}</Notice> : null}
      {answer.leftOut > 0 ? <Notice>{t("leftOut", { most: answer.services.length, count: answer.leftOut })}</Notice> : null}
      <ServiceBoxes groups={groups} />
      <ServiceMonthCard answer={answer} groups={groups} />
      <ServiceDotsCard groups={groups} host={status.host} />
      <ServiceMapCard answer={answer} groups={groups} host={status.host} onOpen={open} />
      <ServicesTable answer={answer} groups={groups} host={status.host} onOpen={open} />
    </div>
  );
}

/**
 * The page's eye: every service by the page's own names, the most visits first, the totals over all of them, the whole website, the
 * events on other pages and the channels, with the groups as the boxes name them (services-new-page-plan-2026-11-07.md, step 6).
 */
function ServicesSees({ answer, groups }: { answer: ServicesAnswer; groups: ServiceGroups }) {
  const tm = useTranslations("googleAnalytics.menu");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const eyeNames = useEyeNames();
  const opening = groups.across === "visits" && groups.doing === "events" && groups.acrossPick === "middle" && groups.upPick === "middle" && groups.ticked.length === groups.channels.length;
  const data = useMemo(() => servicesEyeData(answer, eyeNames, opening ? groups.names : undefined), [answer, eyeNames, opening, groups.names]);
  // Where "Do first" may send the reader: All pages, a service's own page, how people arrive, and what counts as an event.
  const links = useMemo(() => [
    { label: tm("allPages"), href: hrefFor("all-pages") },
    { label: tm("channels"), href: hrefFor("channels") },
    { label: tm("landingPages"), href: hrefFor("funnel") },
    { label: tm("conversions"), href: hrefFor("conversions") },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hrefFor is new each draw; the dates, device and country decide.
  ], [tm, args.period, args.device, args.country]);
  // No visits to any service in these dates: the rules say it at once, and a press would only say it again, minutes later.
  return <AnalyticsSees screen="services" seen={null} currency={null} data={data} links={links} writes={data.allServices.visits > 0} />;
}

/** Visits under which a rate is too few to trust, greyed with its reason, as every Google Analytics table does (`FEW_VISITS`). */
const FEW_VISITS = 100;

type SortKey = "name" | "visits" | "visitsUp" | "events";
/** Each heading's sort, the most first, names A to Z, over the whole list. */
const SORTS: SiteSortColumns<Service, SortKey> = {
  name: { value: (service) => service.name.toLowerCase(), first: "asc" },
  visits: { value: (service) => service.now.visits, first: "desc" },
  visitsUp: { value: (service) => service.now.visits - service.before.visits, first: "desc" },
  events: { value: (service) => service.now.events, first: "desc" },
};
const nameOf = (service: Service) => service.name;
/** A service's address without the website's: "/ai-agency/". */
const pathOf = (address: string) => address.replace(/^https?:\/\/[^/]+/, "") || "/";

/**
 * Every service: its name with its address under it, visits, up or down, and events with their rate under it. A search box and a Show
 * chip on one row, and a Classification chip when the website has more than one Service-type Classification. Every heading sorts the
 * whole list, pages of 25, the exact total, and Download CSV. A row opens that page's own screen, and its Back returns here as it was.
 */
function ServicesTable({ answer, groups, host, onOpen }: { answer: ServicesAnswer; groups: ServiceGroups; host: string; onOpen: (service: Service) => void }) {
  const t = useTranslations("googleAnalytics.services.table");
  const tm = useTranslations("googleAnalytics.services.map");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const [device] = useDevice();
  const [search, setSearch, settled] = useSiteSearch();
  const term = settled.trim().toLowerCase();
  // By its name or its path, never the website's own address, which every service shares.
  const listed = useMemo(() => groups.services.filter((service) => groups.inGroup(service) && (!term || service.name.toLowerCase().includes(term) || pathOf(service.address).toLowerCase().includes(term))), [groups, term]);
  const sorted = useSiteSortedList(listed, SORTS, { opening: "visits", name: nameOf });
  const paged = useSitePager(sorted.rows);
  const groupOptions = [{ value: "", label: tm("everyService") }, ...SERVICE_GROUPS.map((key) => ({ value: key, label: groups.names[key] }))];
  const bar = [tf(`periods.${periodWord(period)}`), tf(`devices.${device}`).toLowerCase()].join(" · ");
  const csv = () => toCsv(
    [t("csv.service"), t("csv.address"), t("csv.group"), t("csv.visits"), t("csv.visitsBefore"), t("csv.events"), t("csv.eventsBefore"), t("csv.per100"), t("csv.started")],
    (sorted.rows ?? []).map((service) => {
      const group = groups.groupOf.get(service.key);
      return [service.name, service.address, group ? groups.names[group] : "", service.now.visits, answer.hasBefore ? service.before.visits : null, service.now.events, answer.hasBefore ? service.before.events : null, perHundredOf(service.now.events, service.now.visits), service.started];
    }),
  );
  return (
    <ListTable
      rows={paged.pageRows}
      rowKey={(service) => service.key}
      noun="services"
      summary={<span className="text-[12px] text-secondary">{bar}</span>}
      actions={<DownloadButton label={t("download")} busyLabel={t("downloading")} onClick={() => saveTextFile(csv(), `${host}-google-analytics-services.csv`)} />}
      search={{ value: search, onChange: setSearch, placeholder: t("find") }}
      filters={(
        <div className="flex flex-wrap items-center gap-3">
          <Select aria-label={t("showLabel")} chip={{ label: t("showLabel"), choice: groups.group ? groups.names[groups.group] : null }} value={groups.group} onChange={(next) => groups.setGroup(next as ServiceGroup | "")}>
            {groupOptions.map((one) => <option key={one.value} value={one.value}>{one.label}</option>)}
          </Select>
          {answer.classifications.length > 1 ? (
            <Select aria-label={t("classificationLabel")} chip={{ label: t("classificationLabel"), choice: answer.classifications.find((one) => one.id === groups.classification)?.name ?? null }} value={groups.classification} onChange={groups.setClassification}>
              <option value="">{t("everyClassification")}</option>
              {answer.classifications.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
            </Select>
          ) : null}
        </div>
      )}
      sort={sorted.tableSort}
      onRowClick={onOpen}
      empty={{ icon: <BriefcaseBusiness className="h-8 w-8 text-muted/30" />, label: term || groups.group ? t("noMatch") : t("empty") }}
      footer={paged.footer}
      columns={[
        {
          key: "name",
          header: t("service"),
          sortable: true,
          className: CUT_COLUMN.first,
          cell: (service: Service) => (
            <span className="flex min-w-0 flex-col">
              <span className="block truncate text-[13px] text-foreground" title={service.name}>{service.name}</span>
              <span className="block truncate text-[12px] text-muted" title={service.address}>{pathOf(service.address)}</span>
            </span>
          ),
        },
        { key: "visits", header: t("visits"), align: "right", sortable: true, cell: (service: Service) => <FigureCell value={service.now.visits} /> },
        { key: "visitsUp", header: t("upOrDown"), align: "right", sortable: true, cell: (service: Service) => <UpOrDownCell now={service.now.visits} before={answer.hasBefore ? service.before.visits : null} /> },
        {
          key: "events",
          header: t("events"),
          align: "right",
          sortable: true,
          cell: (service: Service) => <ConversionsHereCell conversions={service.now.events} rate={service.now.visits > 0 ? service.now.events / service.now.visits : null} fewVisits={service.now.visits < FEW_VISITS} />,
        },
      ]}
    />
  );
}
