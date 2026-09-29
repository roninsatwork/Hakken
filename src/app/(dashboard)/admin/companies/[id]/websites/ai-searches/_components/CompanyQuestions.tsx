"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Check, MessageSquare, Pencil, Plus, Trash2, X } from "lucide-react";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDate } from "@/src/lib/dates";
import { EnginePicker, useEngineChoice, useEngineLabel } from "@/src/app/(dashboard)/admin/_components/EngineChoice";
import { WebsitePicker, chosenWebsite, useAiLists } from "./AiLists";
import { ListNotice } from "./ListNotice";
import { PromptAllowance } from "./PromptAllowance";
import { sectionBase } from "../../_components/websitesSection";

type Row = FunctionReturnType<typeof api.companyAiLists.listCompanyQuestions>["data"][number];

/**
 * Your prompts: every question the company asks the AI assistants — across
 * all its own websites, or one website's when one is chosen in the section's
 * menu — to add, edit, pause, resume or remove (docs/plans/active/fan-out-angles-plan.md,
 * FA9; websites-section-menu-plan.md). Which assistants a new one is asked of
 * is one dropdown. Clicking a question opens its fan-out queries, at the same
 * scope (prompt-fan-out-queries-plan.md). The add box shows how many prompts
 * the website asks against its limit (`PromptAllowance`); the pencil changes
 * a question's words (Anthony, 2026-09-28: "if it made a spelling mistake i
 * had to delete and re-enter").
 *
 * One list at both scopes: until 2026-09-28 a website had a second, with
 * other columns.
 */
export function CompanyQuestions({ companyWebsiteId, host }: { companyWebsiteId?: Id<"companyWebsites">; host?: string }) {
  const t = useTranslations("admin.companyAiLists");
  const tq = useTranslations("admin.companyAiLists.questions");
  const tSection = useTranslations("admin.websitesSection");
  const tCommon = useTranslations("common");
  const { companyId, counts, base } = useAiLists();
  const router = useRouter();

  const [draft, setDraft] = useState("");
  const [site, setSite] = useState("");
  const [error, setError] = useState("");
  // The question being changed: its words and assistants as they stand in the row, and as they were.
  const [editing, setEditing] = useState<{ id: Id<"websiteQuestions">; text: string; engines: string[]; was: Row } | null>(null);
  const [edited, setEdited] = useState<{ prompt: string; words: boolean; engines: string[] } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const addQuestion = useMutation(api.websiteCanonical.addWebsiteQuestion);
  const setActive = useMutation(api.websiteCanonical.setWebsiteQuestionActive);
  const removeQuestion = useMutation(api.websiteCanonical.removeWebsiteQuestion);
  const editQuestion = useMutation(api.websiteCanonical.editWebsiteQuestion);
  const action = useAdminAction({ scope: "admin-company-ai-questions" });

  const questions = useQuery(api.companyAiLists.listCompanyQuestions, {
    companyId,
    ...(companyWebsiteId ? { companyWebsiteId } : {}),
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const isLoading = questions === undefined;

  const engineChoice = useEngineChoice();
  const engines = engineChoice.chosen;
  const engineLabel = useEngineLabel();
  // The website chosen in the menu, else the one picked in the add box.
  const website = chosenWebsite(companyWebsiteId ?? site, counts?.websites);
  // At its limit the website takes no more prompts: asking and paused alike count.
  const full = website ? website.prompts >= website.promptsLimit : false;

  const handleAdd = async () => {
    if (!website) return;
    setError("");
    const outcome = await action.run(
      () => addQuestion({ companyWebsiteId: website.companyWebsiteId, prompt: draft, engines }),
      { key: "add", suppressErrorToast: true, fallbackMessage: tq("errors.addFailed") },
    );
    if (outcome.ok) setDraft("");
    else setError(outcome.message);
  };

  const handleToggle = async (questionId: Id<"websiteQuestions">, isActive: boolean) => {
    setError("");
    const outcome = await action.run(
      () => setActive({ questionId, isActive }),
      { key: questionId, suppressErrorToast: true, fallbackMessage: tq("errors.toggleFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  const handleRemove = async (questionId: Id<"websiteQuestions">) => {
    setError("");
    const outcome = await action.run(
      () => removeQuestion({ questionId }),
      { key: questionId, suppressErrorToast: true, fallbackMessage: tq("errors.removeFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  const handleEdit = async () => {
    if (!editing) return;
    const prompt = editing.text.replace(/\s+/g, " ").trim();
    setError("");
    setEdited(null);
    const outcome = await action.run(
      () => editQuestion({ questionId: editing.id, prompt: editing.text, engines: editing.engines }),
      { key: editing.id, suppressErrorToast: true, fallbackMessage: tq("errors.editFailed") },
    );
    if (!outcome.ok) {
      setError(outcome.message);
      return;
    }
    setEditing(null);
    setEdited({ prompt, words: prompt !== editing.was.prompt, engines: editing.engines });
  };

  // Ticked or unticked in the row's dropdown, kept in the house order.
  const toggleEditEngine = (engine: string) => setEditing((current) => current && {
    ...current,
    engines: engineChoice.all.filter((entry) => (entry === engine) !== current.engines.includes(entry)),
  });

  // The question's own fan-out queries, at the scope open: this website's, or the company's.
  const promptHref = (row: { _id: Id<"websiteQuestions"> }) => companyWebsiteId
    ? `${sectionBase(companyId)}/site/${companyWebsiteId}/questions/${row._id}`
    : `${base}/prompts/${row._id}`;

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<MessageSquare className="h-6 w-6 text-brand" />}
        title={tSection("pages.questions")}
        description={host ? tq("descriptionOne", { host }) : tq("description")}
      />

      <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-4">
        {website ? (
          <PromptAllowance
            host={website.host}
            used={website.prompts}
            paused={website.promptsPaused}
            limit={website.promptsLimit}
            limitsHref={`${sectionBase(companyId)}/site/${website.companyWebsiteId}/limits`}
          />
        ) : null}
        <div className="flex flex-wrap items-end gap-2">
          <Field
            id="company-question"
            label={tq("addLabel")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={full ? tq("allowance.fullPlaceholder") : tq("addPlaceholder")}
            disabled={full}
            wrapperClassName="flex-1 min-w-[18rem]"
          />
          {companyWebsiteId ? null : (
            <WebsitePicker id="company-question-website" value={website?.companyWebsiteId ?? ""} onChange={setSite} websites={counts?.websites ?? []} />
          )}
          <EnginePicker
            id="company-question-engines"
            label={tq("askedOfLabel")}
            all={engineChoice.all}
            chosen={engines}
            onToggle={engineChoice.toggle}
          />
          {/* A disabled button shows no tooltip of its own: the reason sits on what holds it. */}
          <span title={full && website ? tq("allowance.fullTip", { host: website.host, limit: website.promptsLimit }) : undefined}>
            <Button
              variant="quiet"
              className="px-3 py-2 text-[12px]"
              disabled={!website || full || action.isBusy("add") || draft.trim().length === 0 || engines.length === 0}
              onClick={() => void handleAdd()}
            >
              <Plus className="mr-1 inline h-3.5 w-3.5" />
              {tq("add")}
            </Button>
          </span>
        </div>
        {/* What a collection buys across the company's websites. */}
        <span className="text-[11px] text-muted">
          {isLoading ? "" : `${tq("asked", { count: questions.engineCalls })} · ${tq("live")}`}
        </span>
        <SaveError>{error}</SaveError>
      </div>

      {edited ? (
        <ListNotice>
          {edited.words
            ? tq("edited", { prompt: edited.prompt })
            : tq("editedEngines", { prompt: edited.prompt, engines: edited.engines.map(engineLabel).join(", ") })}
        </ListNotice>
      ) : null}
      {questions?.cut ? <p className="text-[12px] text-muted">{t("cut", { count: questions.totalCount })}</p> : null}

      <DataTable
        rows={isLoading ? undefined : questions.data}
        rowKey={(row) => row._id}
        onRowClick={(row) => router.push(promptHref(row))}
        // The question being edited is a text box, not a way to its fan-out queries.
        rowClickable={(row) => editing?.id !== row._id}
        minWidthClassName="min-w-[1080px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: tq("searchPlaceholder"),
        }}
        empty={{
          icon: <MessageSquare className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? tq("noMatch") : tq("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: questions?.totalPages ?? 1,
          totalCount: questions?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: {
            empty: searchTerm ? tq("noMatch") : tq("empty"),
            showing: (start, end, total) => tq("showingOpen", { start, end, total }),
          },
        }}
        columns={[
          {
            key: "prompt",
            header: tq("columns.question"),
            cell: (row) => editing?.id === row._id ? (
              <Field
                label={tq("editLabel", { prompt: row.prompt })}
                labelHidden
                autoFocus
                value={editing.text}
                onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleEdit();
                  if (event.key === "Escape") setEditing(null);
                }}
                className="h-[38px] text-[13px]"
              />
            ) : (
              <Link
                href={promptHref(row)}
                onClick={(event) => event.stopPropagation()}
                className="text-[13px] text-foreground underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
              >
                {row.prompt}
              </Link>
            ),
          },
          ...(companyWebsiteId ? [] : [{
            key: "website",
            header: tq("columns.website"),
            cell: (row: Row) => <span className="text-[12px] text-secondary">{row.host}</span>,
          }]),
          {
            key: "engines",
            header: tq("columns.askedOf"),
            cell: (row) => editing?.id === row._id ? (
              <EnginePicker
                id={`edit-engines-${row._id}`}
                label={tq("askedOfLabel")}
                labelHidden
                all={engineChoice.all}
                chosen={editing.engines}
                onToggle={toggleEditEngine}
              />
            ) : (
              <span className="text-[12px] text-secondary">{row.engines.map(engineLabel).join(", ")}</span>
            ),
          },
          {
            key: "fanOut",
            header: tq("columns.fanOut"),
            align: "right",
            cell: (row) => (
              <span className="font-mono text-[12px] text-foreground">
                {tq("fanOutCount", { total: row.fanOutSearches, ticked: row.fanOutTicked })}
              </span>
            ),
          },
          {
            key: "added",
            header: tq("columns.added"),
            cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatDate(row.createdAt)}</span>,
          },
          {
            key: "state",
            header: tq("columns.state"),
            cell: (row) => (
              <StatusLabel tone={row.isActive ? "success" : "neutral"}>
                {row.isActive ? tq("asking") : tq("paused")}
              </StatusLabel>
            ),
          },
          {
            key: "actions",
            header: tq("columns.actions"),
            align: "right",
            cell: (row) => editing?.id === row._id ? (
              <RowActions alwaysVisible>
                <RowIconButton label={tq("save")} onClick={() => void handleEdit()}>
                  <Check className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={tCommon("cancel")} onClick={() => setEditing(null)}>
                  <X className="h-4 w-4" />
                </RowIconButton>
              </RowActions>
            ) : (
              <RowActions alwaysVisible>
                <Button
                  variant="quiet"
                  className="px-2 py-1 text-[11px]"
                  disabled={action.isBusy(row._id)}
                  onClick={(event) => {
                    // A button in a row that opens: pausing must not open it too.
                    event.stopPropagation();
                    void handleToggle(row._id, !row.isActive);
                  }}
                >
                  {row.isActive ? tq("pause") : tq("resume")}
                </Button>
                <RowIconButton label={tq("edit")} onClick={() => setEditing({ id: row._id, text: row.prompt, engines: [...row.engines], was: row })}>
                  <Pencil className="h-4 w-4" />
                </RowIconButton>
                <RowIconButton label={tq("remove")} tone="danger" onClick={() => void handleRemove(row._id)}>
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
