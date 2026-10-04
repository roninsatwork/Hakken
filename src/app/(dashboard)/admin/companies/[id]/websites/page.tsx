"use client";

import { lazy, Suspense, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronDown, Globe, Plus, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_LOCATION_CODE, findSeoLocation } from "@/convex/utils/seoLocations";
import { Button } from "@/src/ui/components/screens/Button";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TABLE_PAGE_SIZE, matchesSearchTerm } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { cn } from "@/src/ui/lib/utils";
import { SiteMark } from "@/src/app/(dashboard)/app/sites/_components/SiteMark";
import { groupHolds } from "@/src/app/(dashboard)/app/sites/_components/siteGroups";
import { sectionHref } from "./_components/websitesSection";

const loadDialogs = () => import("./CompanyWebsiteDialogs");
const AddCompanyWebsiteDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.AddCompanyWebsiteDialog })),
);
const RemoveCompanyWebsiteDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.RemoveCompanyWebsiteDialog })),
);

type Holding = "OWNED" | "TRACKED";
type WebsiteRow = FunctionReturnType<typeof api.websites.listCompanyWebsiteRows>["rows"][number];
type Grouped = WebsiteRow & { siteId: string; relationship: Holding; ofSiteId: string | null };

/** One line of the list: a site the company owns, a competitor folded out beneath it, or the heading over those on their own. */
type Line =
  | { kind: "site"; row: Grouped; competitors: number; unfolded: boolean }
  | { kind: "competitor"; row: Grouped }
  | { kind: "alone" };

const lineKey = (line: Line) => (line.kind === "alone" ? "alone" : `${line.kind}-${line.row._id}`);
const placeOf = (row: WebsiteRow) =>
  row.locationLabel ?? findSeoLocation(row.locationCode ?? DEFAULT_LOCATION_CODE)?.label ?? "";

/**
 * Every website a company holds: the ones it owns, and the ones it watches.
 *
 * Anthony, 2026-09-22: *"in a company you set which you own and which you
 * track."* Both kinds sit on one list because they are one choice — what this
 * company pays to have collected — and a tracked row says which of the
 * company's own sites it is watched against, since that decides the day it is
 * pulled.
 *
 * Each row points at a `websites` record shared with every other company
 * holding or tracking the same host, which is why removing one says "remove
 * from this company" and never "delete". Deleting a website outright lives on
 * All Websites, worded so the two cannot be confused.
 *
 * Its own sites come first, each followed by the competitors watched against
 * it, then those watched on their own (docs/plans/active/
 * websites-section-menu-plan.md): the list is read whole — no company holds
 * more than a couple of hundred — so it can be grouped, and paged here. Laid
 * out as the client's "Your sites" is (Anthony, 2026-10-01: "a much better
 * design and layout"): each site with its competitors folded beneath it,
 * unfolded from the arrow at the end of its row, all of them at once
 * (docs/plans/active/sites-website-switcher-plan.md, W1). Opening a site opens
 * its to-do list; opening a competitor, its rankings.
 *
 * Super admin only for now, and shaped so the customer-facing version is a
 * second door onto the same functions rather than a rewrite.
 */
export default function CompanyWebsitesPage() {
  const t = useTranslations("admin.companyWebsites");
  const tSection = useTranslations("admin.websitesSection");
  const params = useParams();
  const router = useRouter();
  const companyId = params.id as Id<"companies">;

  const addWebsite = useMutation(api.websites.addCompanyWebsite);
  const trackWebsite = useMutation(api.websiteAttachments.addTrackedWebsite);
  const removeWebsite = useMutation(api.websites.removeCompanyWebsite);
  const action = useAdminAction({ scope: "admin-company-websites" });

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [holding, setHolding] = useState<Holding>("OWNED");
  // Null until chosen, so the first of the company's own sites is the default
  // without an effect copying it into state when the list arrives.
  const [againstChoice, setAgainstChoice] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ id: Id<"companyWebsites">; host: string } | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [dialogsActivated, setDialogsActivated] = useState(false);

  const listed = useQuery(api.websites.listCompanyWebsiteRows, { companyId });
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  // A company with one site sees its competitors without asking.
  const [unfolded, setUnfolded] = useState<ReadonlySet<string> | null>(null);

  // Each competitor under the company's own site it is watched against: the rows name that site by its website.
  const ownedByWebsite = new Map((listed?.rows ?? []).filter((row) => row.relationship !== "TRACKED").map((row) => [row.websiteId, row._id]));
  const { groups, alone } = groupHolds((listed?.rows ?? []).map((row): Grouped => ({
    ...row,
    siteId: row._id,
    relationship: row.relationship === "TRACKED" ? "TRACKED" : "OWNED",
    ofSiteId: row.relationship === "TRACKED" && row.againstWebsiteId ? ownedByWebsite.get(row.againstWebsiteId) ?? null : null,
  })));
  const isUnfolded = (siteId: string) => (unfolded ?? new Set<string>(groups.length === 1 ? [groups[0].owner.siteId] : [])).has(siteId);
  const setFold = (siteId: string, open: boolean) => {
    const next = new Set<string>(groups.filter(({ owner }) => isUnfolded(owner.siteId)).map(({ owner }) => owner.siteId));
    if (open) next.add(siteId);
    else next.delete(siteId);
    setUnfolded(next);
  };

  const matches = (row: WebsiteRow) => matchesSearchTerm(searchTerm, [row.displayHost]);
  const lines: Line[] | undefined = listed === undefined ? undefined : [
    ...groups.flatMap(({ owner, competitors }): Line[] => {
      const found = searchTerm ? competitors.filter(matches) : competitors;
      if (searchTerm && !matches(owner) && found.length === 0) return [];
      const open = searchTerm ? found.length > 0 : isUnfolded(owner.siteId);
      return [
        { kind: "site", row: owner, competitors: competitors.length, unfolded: open },
        ...(open ? found : []).map((row): Line => ({ kind: "competitor", row })),
      ];
    }),
    ...((): Line[] => {
      const found = searchTerm ? alone.filter(matches) : alone;
      return found.length > 0 ? [{ kind: "alone" }, ...found.map((row): Line => ({ kind: "competitor", row }))] : [];
    })(),
  ];
  const totalPages = Math.max(1, Math.ceil((lines?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = lines?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
  /** Where a row opens: a company's own site on its to-do list, a competitor on its rankings. */
  const openRow = (row: { _id: Id<"companyWebsites">; relationship?: "OWNED" | "TRACKED" }) => {
    const relationship = row.relationship === "TRACKED" ? "TRACKED" as const : "OWNED" as const;
    return sectionHref(companyId, relationship === "OWNED" ? "todo" : "rankings", { siteId: row._id, relationship });
  };

  // Only asked for once the dialog is open: it feeds one select box.
  const ownedSites = useQuery(
    api.websiteAttachments.listCompanyOwnedWebsites,
    isAddOpen ? { companyId } : "skip",
  );
  const againstId = againstChoice ?? ownedSites?.[0]?.companyWebsiteId ?? "";

  const activateDialogs = () => {
    void loadDialogs();
    setDialogsActivated(true);
  };

  const handleOpenAdd = () => {
    activateDialogs();
    setUrl("");
    setHolding("OWNED");
    setAgainstChoice(null);
    setSubmitError("");
    setIsAddOpen(true);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");

    const outcome = await action.run(
      () => holding === "TRACKED"
        ? trackWebsite({
          companyId,
          url,
          ...(againstId ? { againstCompanyWebsiteId: againstId as Id<"companyWebsites"> } : {}),
        })
        : addWebsite({ companyId, url }),
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );

    if (outcome.ok) {
      setIsAddOpen(false);
      // Back on the list, with the new site in view (Anthony, 2026-10-01: adding
      // one should take you "back the websites screen", not into its to-do list).
      setSearchTerm("");
      setPage(1);
      if (holding === "TRACKED" && againstId) setFold(againstId, true);
    } else {
      setSubmitError(outcome.message);
    }
  };

  /** Whose schedule a row is collected on, said in the row. */
  const sourceLine = (row: { scheduleSource: string; againstHost: string | null }) => {
    if (row.scheduleSource === "PAIR") return t("sourcePair", { host: row.againstHost ?? "" });
    if (row.scheduleSource === "WEBSITE") return t("sourceWebsite");
    if (row.scheduleSource === "COMPANY") return t("sourceCompany");
    return null;
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setSubmitError("");

    const outcome = await action.run(() => removeWebsite({ id: removing.id }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.removeFailed"),
    });

    if (outcome.ok) setRemoving(null);
    else setSubmitError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={tSection("pages.websites")}
        description={t("subtitle")}
        action={
          <PagePrimaryAction icon={<Plus className="h-4 w-4" />} onClick={handleOpenAdd}>
            {t("addWebsite")}
          </PagePrimaryAction>
        }
      />

      <DataTable
        rows={shown}
        rowKey={lineKey}
        onRowClick={(line) => {
          if (line.kind !== "alone") router.push(openRow(line.row));
        }}
        rowClickable={(line) => line.kind !== "alone"}
        rowClassName={(line) => (line.kind === "competitor" ? "bg-foreground/[0.015]" : "")}
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Globe className="h-8 w-8 text-muted/30" />, label: searchTerm ? t("emptySearch") : t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: lines?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: listed === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("emptySearch") : t("empty") },
        }}
        columns={[
          {
            key: "website",
            header: t("websiteColumn"),
            cell: (line) => {
              if (line.kind === "alone") {
                return <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t("onTheirOwn")}</span>;
              }
              if (line.kind === "competitor") {
                return (
                  <span className={cn("flex min-w-0 items-center gap-2.5", line.row.ofSiteId && "pl-11")}>
                    <SiteMark host={line.row.displayHost} iconUrl={line.row.iconUrl} owned={false} small />
                    <span className="truncate text-[13px] text-foreground/90">{line.row.displayHost}</span>
                  </span>
                );
              }
              return (
                <span className="flex min-w-0 items-center gap-3">
                  <SiteMark host={line.row.displayHost} iconUrl={line.row.iconUrl} owned />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-[13px] font-medium text-foreground">{line.row.displayHost}</span>
                    <span className="text-[12px] text-secondary">{placeOf(line.row)}</span>
                  </span>
                </span>
              );
            },
          },
          {
            key: "competitors",
            header: t("competitorsColumn"),
            cell: (line) =>
              line.kind !== "site" ? null : (
                <span className="text-[12px] text-secondary">
                  {t("competitors", { count: line.row.competitorCount })}
                  {line.row.competitorCountIsCapped ? "+" : ""}
                </span>
              ),
          },
          {
            key: "collection",
            header: t("collectionColumn"),
            cell: (line) => (
              line.kind === "alone" ? null : line.row.collecting && line.row.nextRunAt ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] text-foreground">{formatDateTime(line.row.nextRunAt)}</span>
                  <span className="text-[11px] text-muted">{sourceLine(line.row)}</span>
                </div>
              ) : (
                <StatusLabel tone="neutral">{t("notCollecting")}</StatusLabel>
              )
            ),
          },
          {
            // How much is kept about the site: its own limit where one is set
            // on its page, else the company's (`companyDataLimits.ts`).
            key: "limits",
            header: t("limitsColumn"),
            cell: (line) => (
              line.kind === "alone" ? null : (
                <div className="flex flex-col gap-1 whitespace-nowrap">
                  <span className="text-[12px] text-foreground">
                    {t("limitKeywords", { count: line.row.limits.keywordsPerSite })}
                    {line.row.limits.keywordsOwn ? <span className="text-muted"> · {t("ownLimit")}</span> : null}
                  </span>
                  <span className="text-[11px] text-muted">
                    {t("limitBacklinks", { count: line.row.limits.backlinksPerSite })}
                    {line.row.limits.backlinksOwn ? ` · ${t("ownLimit")}` : ""}
                  </span>
                </div>
              )
            ),
          },
          {
            key: "actions",
            header: t("actionsColumn"),
            align: "right",
            cell: (line) => (
              line.kind === "alone" ? null : (
                <RowActions>
                  <RowIconButton
                    label={t("removeTitle")}
                    tone="danger"
                    onClick={() => {
                      activateDialogs();
                      setSubmitError("");
                      setRemoving({ id: line.row._id, host: line.row.displayHost });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </RowIconButton>
                </RowActions>
              )
            ),
          },
          {
            // The fold, at the end of the row: the row itself opens the site.
            key: "fold",
            align: "right",
            cell: (line) =>
              line.kind !== "site" || line.competitors === 0 ? null : (
                <Button
                  variant="icon"
                  aria-expanded={line.unfolded}
                  aria-label={t(line.unfolded ? "hideCompetitors" : "showCompetitors", { host: line.row.displayHost })}
                  onClick={(event) => {
                    event.stopPropagation();
                    setFold(line.row.siteId, !line.unfolded);
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-[8px]"
                >
                  <ChevronDown className={cn("h-4 w-4 transition-transform", line.unfolded && "rotate-180")} aria-hidden="true" />
                </Button>
              ),
          },
        ]}
      />

      {dialogsActivated ? (
        <Suspense fallback={null}>
          <AddCompanyWebsiteDialog
            isOpen={isAddOpen}
            onClose={() => setIsAddOpen(false)}
            url={url}
            onUrlChange={setUrl}
            holding={holding}
            onHoldingChange={setHolding}
            againstId={againstId}
            onAgainstChange={setAgainstChoice}
            ownedSites={ownedSites}
            onSubmit={handleAdd}
            isSubmitting={action.isBusy()}
            submitError={submitError}
          />
          <RemoveCompanyWebsiteDialog
            host={removing?.host ?? null}
            onClose={() => {
              setRemoving(null);
              setSubmitError("");
            }}
            onConfirm={confirmRemove}
            isSubmitting={action.isBusy()}
            error={submitError}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
