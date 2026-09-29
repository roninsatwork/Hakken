"use client";

import { lazy, Suspense, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Plus, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TABLE_PAGE_SIZE, matchesSearchTerm } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { sectionHref } from "./_components/websitesSection";

const loadDialogs = () => import("./CompanyWebsiteDialogs");
const AddCompanyWebsiteDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.AddCompanyWebsiteDialog })),
);
const RemoveCompanyWebsiteDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.RemoveCompanyWebsiteDialog })),
);

type Holding = "OWNED" | "TRACKED";

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
 * more than a couple of hundred — so it can be grouped, and paged here.
 * Opening a site opens its to-do list; opening a competitor, its rankings.
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
  const matching = listed?.rows.filter((row) => matchesSearchTerm(searchTerm, [row.displayHost]));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);
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
      // Straight into it: adding the site is half the job and the next thing
      // anyone wants is what it is producing.
      router.push(openRow({ _id: outcome.data, relationship: holding }));
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
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[760px]"
        onRowClick={(row) => router.push(openRow(row))}
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
          totalCount: matching?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: listed === undefined,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("emptySearch") : t("empty") },
        }}
        columns={[
          {
            key: "website",
            header: t("websiteColumn"),
            cell: (row) => (
              // A competitor sits under the site it is compared with, set in.
              <span className={`block text-[13px] leading-tight text-foreground ${row.relationship === "TRACKED" && row.againstHost ? "pl-5 font-normal" : "font-medium"}`}>
                {row.displayHost}
              </span>
            ),
          },
          {
            key: "heldAs",
            header: t("heldAsColumn"),
            cell: (row) => (
              row.relationship === "TRACKED" ? (
                <div className="flex flex-col gap-1">
                  <StatusLabel tone="neutral">{t("tracked")}</StatusLabel>
                  <span className="text-[11px] text-muted">
                    {row.againstHost ? t("against", { host: row.againstHost }) : t("onItsOwn")}
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <StatusLabel tone="info">{t("owned")}</StatusLabel>
                  <span className="text-[11px] text-muted">
                    {t("competitors", { count: row.competitorCount })}
                    {row.competitorCountIsCapped ? "+" : ""}
                  </span>
                </div>
              )
            ),
          },
          {
            // What the site's Brief has waiting. Only an owned site has moves: a
            // tracked one is compared on its pair's lists.
            key: "moves",
            header: t("movesColumn"),
            cell: (row) => (
              row.movesWaiting > 0 ? (
                <span className="font-mono text-[13px] text-brand">
                  {row.movesWaiting > 20 ? "20+" : row.movesWaiting}
                </span>
              ) : (
                <span className="text-[12px] text-muted">–</span>
              )
            ),
          },
          {
            key: "collection",
            header: t("collectionColumn"),
            cell: (row) => (
              row.collecting && row.nextRunAt ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] text-foreground">{formatDateTime(row.nextRunAt)}</span>
                  <span className="text-[11px] text-muted">{sourceLine(row)}</span>
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
            cell: (row) => (
              <div className="flex flex-col gap-1 whitespace-nowrap">
                <span className="text-[12px] text-foreground">
                  {t("limitKeywords", { count: row.limits.keywordsPerSite })}
                  {row.limits.keywordsOwn ? <span className="text-muted"> · {t("ownLimit")}</span> : null}
                </span>
                <span className="text-[11px] text-muted">
                  {t("limitBacklinks", { count: row.limits.backlinksPerSite })}
                  {row.limits.backlinksOwn ? ` · ${t("ownLimit")}` : ""}
                </span>
              </div>
            ),
          },
          {
            key: "actions",
            header: t("actionsColumn"),
            align: "right",
            cell: (row) => (
              <RowActions>
                <RowIconButton
                  label={t("removeTitle")}
                  tone="danger"
                  onClick={() => {
                    activateDialogs();
                    setSubmitError("");
                    setRemoving({ id: row._id, host: row.displayHost });
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
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
