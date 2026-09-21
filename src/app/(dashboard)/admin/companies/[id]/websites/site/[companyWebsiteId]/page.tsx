"use client";

import { lazy, Suspense, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Globe, Plus, Swords, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDate } from "@/src/lib/dates";
import { WebsiteScheduleOverride } from "./WebsiteScheduleOverride";
import { WatchLocation } from "./WatchLocation";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { MessageSquare } from "lucide-react";

const loadDialogs = () => import("./CompetitorDialogs");
const AddCompetitorDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.AddCompetitorDialog })),
);
const RemoveCompetitorDialog = lazy(() =>
  loadDialogs().then((module) => ({ default: module.RemoveCompetitorDialog })),
);

/**
 * One of a company's websites, and the competitors tracked against it.
 *
 * Competitors live inside a website rather than beside it because a rival is
 * only meaningful relative to the site it is measured against — the shop's
 * competitors are not the trade arm's. They also inherit this website's refresh
 * cadence rather than carrying their own: numbers pulled in different weeks are
 * not a comparison.
 *
 * Every competitor is a shared `websites` record, so stopping tracking here
 * removes this company's interest and nothing else.
 */
export default function CompanyWebsiteDetailPage() {
  const t = useTranslations("admin.companyWebsiteDetail");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const website = useQuery(api.websites.getCompanyWebsiteById, { id: companyWebsiteId });
  const addCompetitor = useMutation(api.websites.addTrackedCompetitor);
  const removeCompetitor = useMutation(api.websites.removeTrackedCompetitor);
  const action = useAdminAction({ scope: "admin-website-competitors" });

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebounce(searchTerm, 400);
  const [page, setPage] = useState(1);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [removing, setRemoving] = useState<{ id: Id<"trackedCompetitors">; host: string } | null>(null);
  const [submitError, setSubmitError] = useState("");

  /*
    The AI questions below the competitors. Their table lives here rather than
    in a component of its own because the screen-kit guard checks that a list's
    header comes from a header component *above* its table, and splitting a
    table into a fragment hides that ordering from the check — which is how
    nine sub-tables ended up frozen into an allowlist.
  */
  const [promptDraft, setPromptDraft] = useState("");
  const [promptError, setPromptError] = useState("");
  const [promptSearch, setPromptSearch] = useState("");
  const [promptPage, setPromptPage] = useState(1);
  const debouncedPromptSearch = useDebounce(promptSearch, 400);

  const addPrompt = useMutation(api.seoPrompts.addTrackedPrompt);
  const removePrompt = useMutation(api.seoPrompts.removeTrackedPrompt);
  const setPromptActive = useMutation(api.seoPrompts.setTrackedPromptActive);
  const tPrompts = useTranslations("admin.companyWebsiteDetail.prompts");

  const prompts = useQuery(api.seoPrompts.listTrackedPrompts, {
    companyWebsiteId,
    searchTerm: debouncedPromptSearch,
    page: promptPage,
    pageSize: TABLE_PAGE_SIZE,
  });

  const handleAddPrompt = async () => {
    setPromptError("");
    const outcome = await action.run(
      () => addPrompt({ companyWebsiteId, prompt: promptDraft }),
      { key: "add-prompt", suppressErrorToast: true, fallbackMessage: tPrompts("errors.addFailed") },
    );
    if (outcome.ok) setPromptDraft("");
    else setPromptError(outcome.message);
  };

  /*
    Through the action runner rather than fired and forgotten. A bare
    `void mutation(...)` has nowhere to put a failure: the row would sit there
    looking changed while the server had refused, and nothing would say so.
  */
  const handlePromptToggle = async (promptId: Id<"trackedPrompts">, isActive: boolean) => {
    setPromptError("");
    const outcome = await action.run(
      () => setPromptActive({ promptId, isActive }),
      { key: promptId, suppressErrorToast: true, fallbackMessage: tPrompts("errors.toggleFailed") },
    );
    if (!outcome.ok) setPromptError(outcome.message);
  };

  const handlePromptRemove = async (promptId: Id<"trackedPrompts">) => {
    setPromptError("");
    const outcome = await action.run(
      () => removePrompt({ promptId }),
      { key: promptId, suppressErrorToast: true, fallbackMessage: tPrompts("errors.removeFailed") },
    );
    if (!outcome.ok) setPromptError(outcome.message);
  };
  const [dialogsActivated, setDialogsActivated] = useState(false);

  const competitors = useQuery(api.websites.getTrackedCompetitors, {
    companyWebsiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const isLoading = competitors === undefined;
  const websitesHref = `/admin/companies/${companyId}/websites`;

  const activateDialogs = () => {
    void loadDialogs();
    setDialogsActivated(true);
  };

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setPage(1);
  };

  const handleOpenAdd = () => {
    activateDialogs();
    setUrl("");
    setSubmitError("");
    setIsAddOpen(true);
  };

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitError("");

    const outcome = await action.run(
      () => addCompetitor({ companyWebsiteId, url }),
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );

    if (outcome.ok) setIsAddOpen(false);
    else setSubmitError(outcome.message);
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setSubmitError("");

    const outcome = await action.run(() => removeCompetitor({ id: removing.id }), {
      suppressErrorToast: true,
      fallbackMessage: t("errors.removeFailed"),
    });

    if (outcome.ok) setRemoving(null);
    else setSubmitError(outcome.message);
  };

  if (website === undefined) {
    return <p className="text-[13px] text-secondary">{t("loading")}</p>;
  }
  if (website === null) {
    return <p className="text-[13px] text-destructive">{t("notFound")}</p>;
  }

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("back"), href: websitesHref }}
        icon={<Globe className="h-6 w-6 text-brand" />}
        title={website.displayHost}
        description={t("subtitle")}
        action={
          <PagePrimaryAction icon={<Plus className="h-4 w-4" />} onClick={handleOpenAdd}>
            {t("addCompetitor")}
          </PagePrimaryAction>
        }
      />

      <WebsiteScheduleOverride
        companyWebsiteId={companyWebsiteId}
        companyName={website.companyName}
        companyIntervalStr={website.companyIntervalStr}
        stored={{
          refreshIntervalStr: website.refreshIntervalStr,
          collectionEnabled: website.collectionEnabled,
        }}
        effective={website.effective}
      />

      <WatchLocation
        companyWebsiteId={companyWebsiteId}
        savedCode={website.locationCode}
      />

      <DataTable
        rows={isLoading ? undefined : competitors.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[700px]"
        search={{ value: searchTerm, onChange: handleSearch, placeholder: t("searchPlaceholder") }}
        empty={{
          icon: <Swords className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("emptySearch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: competitors?.totalPages ?? 1,
          totalCount: competitors?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("emptySearch") : t("empty") },
        }}
        columns={[
          {
            key: "competitor",
            header: t("competitorColumn"),
            cell: (row) => (
              <span className="block text-[13px] font-medium leading-tight text-foreground">
                {row.displayHost}
              </span>
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
          <AddCompetitorDialog
            isOpen={isAddOpen}
            onClose={() => setIsAddOpen(false)}
            url={url}
            onUrlChange={setUrl}
            onSubmit={handleAdd}
            isSubmitting={action.isBusy()}
            submitError={submitError}
          />
          <RemoveCompetitorDialog
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

      <div className="flex flex-col gap-2">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          <MessageSquare className="h-3.5 w-3.5" />
          {tPrompts("title")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">{tPrompts("subtitle")}</p>
      </div>

      <div className="flex flex-col gap-2 rounded-[12px] border border-border-dim bg-card/40 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field
            label={tPrompts("addLabel")}
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            placeholder={tPrompts("addPlaceholder")}
            wrapperClassName="flex-1 min-w-[16rem]"
          />
          <Button
            variant="quiet"
            className="px-3 py-2 text-[12px]"
            disabled={action.isBusy("add-prompt") || promptDraft.trim().length === 0}
            onClick={() => void handleAddPrompt()}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {tPrompts("add")}
          </Button>
        </div>
        {/*
          On screen rather than discovered by hitting it: each question is a
          paid call per engine, every time this website is collected.
        */}
        <span className="text-[11px] text-muted">
          {prompts === undefined
            ? tPrompts("loading")
            : tPrompts("remaining", { count: prompts.remaining })}
        </span>
        <SaveError>{promptError}</SaveError>
      </div>

      <DataTable
        rows={prompts === undefined ? undefined : prompts.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[720px]"
        search={{
          value: promptSearch,
          onChange: (value) => {
            setPromptSearch(value);
            setPromptPage(1);
          },
          placeholder: tPrompts("searchPlaceholder"),
        }}
        empty={{
          icon: <MessageSquare className="h-8 w-8 text-muted/30" />,
          label: promptSearch ? tPrompts("noMatch") : tPrompts("empty"),
        }}
        footer={{
          mode: "paged",
          page: promptPage,
          totalPages: prompts?.totalPages ?? 1,
          totalCount: prompts?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: prompts === undefined,
          onPageChange: setPromptPage,
          labels: { empty: promptSearch ? tPrompts("noMatch") : tPrompts("empty") },
        }}
        columns={[
          {
            key: "prompt",
            header: tPrompts("promptColumn"),
            cell: (row) => <span className="text-[13px] text-foreground">{row.prompt}</span>,
          },
          {
            key: "engines",
            header: tPrompts("enginesColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.engines.map((engine) => tPrompts(`engines.${engine}`)).join(", ")}
              </span>
            ),
          },
          {
            key: "promptState",
            header: tPrompts("stateColumn"),
            cell: (row) => (
              <StatusPill tone={row.isActive ? "success" : "neutral"}>
                {row.isActive ? tPrompts("asking") : tPrompts("paused")}
              </StatusPill>
            ),
          },
          {
            key: "promptActions",
            header: "",
            hiddenHeader: tPrompts("actionsColumn"),
            align: "right",
            cell: (row) => (
              <div className="flex items-center justify-end gap-1">
                <Button
                  variant="quiet"
                  className="px-2 py-1 text-[11px]"
                  disabled={action.isBusy(row._id)}
                  onClick={() => void handlePromptToggle(row._id, !row.isActive)}
                >
                  {row.isActive ? tPrompts("pause") : tPrompts("resume")}
                </Button>
                <Button
                  variant="icon"
                  aria-label={tPrompts("remove")}
                  title={tPrompts("remove")}
                  className="text-muted hover:text-destructive"
                  disabled={action.isBusy(row._id)}
                  onClick={() => void handlePromptRemove(row._id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
