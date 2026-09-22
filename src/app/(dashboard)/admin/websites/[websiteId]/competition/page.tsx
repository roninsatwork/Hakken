"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Plus, Swords, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDate } from "@/src/lib/dates";

/**
 * Who this host competes with.
 *
 * A directed graph on the website rather than a list per client, because "who
 * competes with this business" is a claim about a market and not about whoever
 * happens to be watching. Rivalry is not always mutual — a national brand is a
 * rival to a local firm more often than the reverse — so the edge has a
 * direction and the reverse is a separate claim.
 *
 * Adding one is two calls on purpose: `createWebsite` finds or creates the host,
 * then `addWebsiteRival` records the edge between two ids. Keeping them apart is
 * what stops this screen becoming a second place a website can be born, with its
 * own idea of what a host is.
 */
export default function WebsiteCompetitionPage() {
  const t = useTranslations("admin.websiteDetail.competition");
  const params = useParams();
  const websiteId = params.websiteId as Id<"websites">;

  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const createWebsite = useMutation(api.websites.createWebsite);
  const addRival = useMutation(api.websiteCanonical.addWebsiteRival);
  const removeRival = useMutation(api.websiteCanonical.removeWebsiteRival);
  const action = useAdminAction({ scope: "admin-website-competition" });

  const rivals = useQuery(api.websiteCanonical.listWebsiteRivals, {
    websiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const isLoading = rivals === undefined;

  const handleAdd = async () => {
    setError("");
    const outcome = await action.run(
      async () => {
        const { websiteId: rivalWebsiteId } = await createWebsite({ url: draft });
        await addRival({ websiteId, rivalWebsiteId });
      },
      { key: "add", suppressErrorToast: true, fallbackMessage: t("errors.addFailed") },
    );
    if (outcome.ok) setDraft("");
    else setError(outcome.message);
  };

  const handleRemove = async (edgeId: Id<"websiteRivals">) => {
    setError("");
    const outcome = await action.run(
      () => removeRival({ edgeId }),
      { key: edgeId, suppressErrorToast: true, fallbackMessage: t("errors.removeFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Swords className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field
            id="website-rival"
            label={t("addLabel")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="rival.co.uk"
            wrapperClassName="flex-1 min-w-[16rem]"
          />
          <Button
            variant="quiet"
            className="px-3 py-2 text-[12px]"
            disabled={action.isBusy("add") || draft.trim().length === 0}
            onClick={() => void handleAdd()}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {t("add")}
          </Button>
        </div>
        <SaveError>{error}</SaveError>
      </div>

      <DataTable
        rows={isLoading ? undefined : rivals.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[760px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <Swords className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: rivals?.totalPages ?? 1,
          totalCount: rivals?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "rival",
            header: t("hostColumn"),
            cell: (row) => (
              // A rival is a website like any other, configured the same way,
              // so its own record is one click from here.
              <Link
                href={`/admin/websites/${row.rivalWebsiteId}`}
                className="text-[13px] font-medium text-foreground hover:text-brand"
              >
                {row.displayHost}
              </Link>
            ),
          },
          {
            key: "source",
            header: t("sourceColumn"),
            cell: (row) => (
              <StatusPill tone={row.source === "DISCOVERED" ? "info" : "neutral"}>
                {row.source === "DISCOVERED" ? t("discovered") : t("asserted")}
              </StatusPill>
            ),
          },
          {
            key: "added",
            header: t("addedColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">{formatDate(row.createdAt)}</span>
            ),
          },
          {
            key: "actions",
            header: t("actionsColumn"),
            align: "right",
            cell: (row) => (
              <RowActions>
                <RowIconButton
                  label={t("remove")}
                  tone="danger"
                  onClick={() => void handleRemove(row._id)}
                >
                  <Trash2 className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />
    </div>
  );
}
