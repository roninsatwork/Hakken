"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Link2, Search, Store, Trash2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Field } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { FieldHint, FieldLabel, SegmentedChoice, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { PageSection } from "../../../../_components/PageSection";
import { formatDay } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { businessRecord, useSiteListHref, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { BusinessCell, FigureCell, LocalSetupNotice, ratingText, useOfficeName } from "../_components/LocalParts";

type Source = "GOOGLE" | "TRUSTPILOT" | "TRIPADVISOR";
const SOURCES: readonly Source[] = ["GOOGLE", "TRUSTPILOT", "TRIPADVISOR"];

type ListingRow = {
  listingId: Id<"listings">;
  source: Source;
  name: string;
  address: string | null;
  town: string | null;
  category: string | null;
  websiteHost: string | null;
  rating: number | null;
  reviews: number | null;
  url: string;
};
type Office = ListingRow & { linkedAt: number };
type Rival = { key: string; name: string; websiteHost: string | null; against: string | null; rating: number | null; reviews: number | null; sources: Source[]; listings: Array<Id<"listings">>; url: string };
type Found = ListingRow & { linkedAs: "OWN" | "RIVAL" | null };

const OFFICE_SORTS: SiteSortColumns<Office, "listing" | "where" | "reviews" | "rating"> = {
  listing: { value: (row) => row.name, first: "asc" },
  where: { value: (row) => row.source, first: "asc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  rating: { value: (row) => row.rating, first: "desc" },
};
const RIVAL_SORTS: SiteSortColumns<Rival, "business" | "against" | "reviews" | "rating"> = {
  business: { value: (row) => row.name, first: "asc" },
  against: { value: (row) => row.against, first: "asc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
  rating: { value: (row) => row.rating, first: "desc" },
};
const FOUND_SORTS: SiteSortColumns<Found, "business" | "category" | "rating" | "reviews"> = {
  business: { value: (row) => row.name, first: "asc" },
  category: { value: (row) => row.category, first: "asc" },
  rating: { value: (row) => row.rating, first: "desc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
};
const nameOf = (row: { name: string }) => row.name;
/** As drawn, a table here wears no footer — until it holds more than one page. */
const pagedOnly = <Footer extends { totalCount: number; pageSize: number }>(footer: Footer) => (footer.totalCount > footer.pageSize ? footer : undefined);

/**
 * Discovery → Local → Your listings (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, D3, D18; drawn as "Local · Your listings"): the
 * profiles that are the company's own, one per office, finding one by name,
 * and the rivals watched. Find buys one search; nothing else is bought here.
 */
export default function LocalListingsPage() {
  const t = useTranslations("sites.local.listings");
  const tl = useTranslations("sites.local");
  const siteId = useSiteId();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const officeName = useOfficeName();
  const data = useQuery(api.siteLocalListings.localListings, { siteId });
  const find = useMutation(api.siteLocalListings.findListing);
  const link = useMutation(api.siteLocalListings.linkListing);
  const unlink = useMutation(api.siteLocalListings.unlinkListing);
  const action = useAdminAction({ scope: "site-local-listings" });
  const [source, setSource] = useState<Source>("GOOGLE");
  const [typed, setTyped] = useState("");

  const offices = data?.offices;
  const rivals = useMemo<Rival[] | undefined>(() => {
    if (!data) return undefined;
    // One row a rival business: its Google profile and its pages elsewhere, joined by the website they name.
    const groups = new Map<string, Rival>();
    for (const row of data.rivals) {
      const key = row.websiteHost ?? `${row.source}:${row.listingId}`;
      const held = groups.get(key);
      if (held) {
        held.sources.push(row.source);
        held.listings.push(row.listingId);
        if (row.source === "GOOGLE") Object.assign(held, { name: row.name, rating: row.rating, reviews: row.reviews, url: row.url });
        continue;
      }
      groups.set(key, {
        key,
        name: row.name,
        websiteHost: row.websiteHost,
        against: row.againstTown ? tl("officeOf", { town: row.againstTown }) : row.againstName,
        rating: row.rating,
        reviews: row.reviews,
        sources: [row.source],
        listings: [row.listingId],
        url: row.url,
      });
    }
    return [...groups.values()];
  }, [data, tl]);
  const current = data?.finds.find((entry) => entry.source === source) ?? null;

  const officesSorted = useSiteSortedList(offices, OFFICE_SORTS, { opening: "reviews", name: nameOf });
  const officesPager = useSitePager(officesSorted.rows, { isLoading: data === undefined });
  const foundSorted = useSiteSortedList(current?.rows, FOUND_SORTS, { opening: "business", name: nameOf, table: "found" });
  const foundPager = useSitePager(foundSorted.rows, { isLoading: data === undefined, table: "found" });
  const rivalsSorted = useSiteSortedList(rivals, RIVAL_SORTS, { opening: "reviews", name: nameOf, table: "rivals" });
  const rivalsPager = useSitePager(rivalsSorted.rows, { isLoading: data === undefined, table: "rivals" });

  const sourceName = (value: Source) => t(`sources.${value}`);
  const linkedOn = (at: number) => formatDay(new Date(at).toISOString().slice(0, 10));
  const runFind = () => void action.run(() => find({ siteId, source, text: typed }), { key: "find", fallbackMessage: t("findFailed") });
  const linkAs = (row: Found, role: "OWN" | "RIVAL") => void action.run(() => link({ siteId, listingId: row.listingId, role }), {
    key: `link:${row.listingId}`,
    fallbackMessage: t("linkFailed"),
  });
  const stop = (listings: Array<Id<"listings">>) => void action.run(async () => {
    for (const listingId of listings) await unlink({ siteId, listingId });
  }, { key: `unlink:${listings[0]}`, fallbackMessage: t("unlinkFailed") });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Link2 className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      {data && !data.ownSite ? <Notice>{t("notOwnSite")}</Notice> : null}
      {data && data.ownSite && !data.on ? <LocalSetupNotice siteId={siteId} reason="off" /> : null}

      <PageSection title={t("yoursTitle")} description={t("yoursDescription")}>
        <DataTable
          rows={officesPager.pageRows}
          rowKey={(row) => row.listingId}
          onRowClick={(row) => router.push(row.source === "GOOGLE" ? `/app/sites/${siteId}/local?office=${row.listingId}` : listHref("reviews"))}
          cardHeader={<TableBar footer={officesPager.footer} noun="listings" />}
          empty={{ icon: <Store className="h-8 w-8 text-muted/30" />, label: t("yoursEmpty") }}
          footer={pagedOnly(officesPager.footer)}
          sort={officesSorted.tableSort}
          columns={[
            { key: "listing", header: t("columns.listing"), sortable: true, cell: (row) => <BusinessCell name={row.source === "GOOGLE" ? `${row.name} · ${officeName(row)}` : row.name} sub={row.source === "GOOGLE" ? row.address : row.url.replace(/^https:\/\//, "")} href={row.source === "GOOGLE" ? `/app/sites/${siteId}/local?office=${row.listingId}` : row.url} /> },
            { key: "where", header: t("columns.where"), sortable: true, cell: (row) => <TagLabel>{t(`where.${row.source}`)}</TagLabel> },
            { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
            { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
            { key: "status", header: t("columns.status"), cell: (row) => <StatusLabel tone="success">{t("linked", { day: linkedOn(row.linkedAt) })}</StatusLabel> },
            {
              key: "actions",
              header: <span className="sr-only">{t("columns.actions")}</span>,
              cell: (row) => (
                <RowActions alwaysVisible>
                  <RowIconButton label={t("stopReading")} tone="danger" onClick={() => stop([row.listingId])}><Trash2 className="h-4 w-4" /></RowIconButton>
                </RowActions>
              ),
            },
          ]}
        />
      </PageSection>

      {data?.ownSite ? (
        <SettingsCard title={t("findTitle")}>
          <Field
            label={t("findLabel")}
            hint={t("findHint")}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && typed.trim().length > 1) runFind(); }}
            placeholder={t("findPlaceholder")}
          />
          <FieldLabel>{t("whereToLook")}</FieldLabel>
          <SegmentedChoice
            size="compact"
            label={t("whereToLook")}
            value={source}
            options={SOURCES.map((value) => ({ value, label: sourceName(value) }))}
            onChange={setSource}
          />
          <FieldHint>{t("findCost")}</FieldHint>
          <div>
            <PagePrimaryAction icon={<Search className="h-4 w-4" />} onClick={runFind} disabled={!data.on || typed.trim().length < 2 || action.isBusy("find")}>
              {action.isBusy("find") ? t("finding") : t("find")}
            </PagePrimaryAction>
          </div>
        </SettingsCard>
      ) : null}

      {current ? (
        <PageSection title={t("foundTitle")} description={t("foundDescription", { name: current.name, where: sourceName(current.source) })}>
          {current.looking ? <Notice>{t("looking")}</Notice> : null}
          {current.failed ? <Notice tone="warning">{t("findFailed")}</Notice> : null}
          <DataTable
            rows={foundPager.pageRows}
            rowKey={(row) => row.listingId}
            cardHeader={<TableBar footer={foundPager.footer} noun="found" />}
            empty={{ icon: <Search className="h-8 w-8 text-muted/30" />, label: current.looking ? t("looking") : t("foundEmpty") }}
            footer={pagedOnly(foundPager.footer)}
            sort={foundSorted.tableSort}
            columns={[
              { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <BusinessCell name={row.name} sub={row.address ?? row.websiteHost} /> },
              { key: "category", header: t("columns.category"), sortable: true, cell: (row) => (row.category ? <TagLabel>{row.category}</TagLabel> : <FigureCell value={null} />) },
              { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
              { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
              {
                key: "actions",
                header: <span className="sr-only">{t("columns.actions")}</span>,
                cell: (row) => row.linkedAs === "OWN" ? (
                  <StatusLabel tone="success">{t("alreadyYours")}</StatusLabel>
                ) : row.linkedAs === "RIVAL" ? (
                  <StatusLabel tone="success">{t("watched")}</StatusLabel>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="quiet" className="whitespace-nowrap" disabled={action.isBusy(`link:${row.listingId}`)} onClick={() => linkAs(row, "OWN")}>{t("thisIsUs")}</Button>
                    <Button variant="quiet" className="whitespace-nowrap" disabled={action.isBusy(`link:${row.listingId}`)} onClick={() => linkAs(row, "RIVAL")}>{t("watchAsRival")}</Button>
                  </div>
                ),
              },
            ]}
          />
        </PageSection>
      ) : null}

      <PageSection title={t("rivalsTitle")} description={t("rivalsDescription")}>
        <DataTable
          rows={rivalsPager.pageRows}
          rowKey={(row) => row.key}
          onRowClick={(row) => router.push(recordHref(businessRecord({ host: row.websiteHost, listingId: row.listings[0] ?? null })!))}
          cardHeader={<TableBar footer={rivalsPager.footer} noun="rivals" />}
          empty={{ icon: <Store className="h-8 w-8 text-muted/30" />, label: t("rivalsEmpty") }}
          footer={pagedOnly(rivalsPager.footer)}
          sort={rivalsSorted.tableSort}
          columns={[
            { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <BusinessCell name={row.name} sub={row.websiteHost ?? t("noWebsite")} href={recordHref(businessRecord({ host: row.websiteHost, listingId: row.listings[0] ?? null })!)} /> },
            { key: "against", header: t("columns.against"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.against ?? t("everyOffice")}</span> },
            { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
            { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
            { key: "read", header: t("columns.listingsRead"), cell: (row) => <span className="text-[12px] text-secondary">{row.sources.map(sourceName).join(" · ")}</span> },
            {
              key: "actions",
              header: <span className="sr-only">{t("columns.actions")}</span>,
              cell: (row) => (
                <RowActions alwaysVisible>
                  <RowIconButton label={t("stopWatching")} tone="danger" onClick={() => stop(row.listings)}><Trash2 className="h-4 w-4" /></RowIconButton>
                </RowActions>
              ),
            },
          ]}
        />
      </PageSection>
    </div>
  );
}
