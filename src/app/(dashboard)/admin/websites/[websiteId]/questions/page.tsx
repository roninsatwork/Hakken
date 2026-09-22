"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Check, MessageSquare, Plus, Trash2 } from "lucide-react";

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

/**
 * What the AI engines are asked about this host.
 *
 * On the website, which is what `trackedPrompts` already claimed in its own
 * docstring — "a question belongs to a site, not to a client" — and then stored
 * the opposite of. Three clients watching one host used to hold three copies of
 * the same question and buy three copies of the same answer.
 *
 * The engine choice is real here. `addTrackedPrompt` accepted an `engines`
 * argument that no screen ever passed, so every question went to all four
 * forever and the cheapest lever in the feature could not be pulled.
 */
export default function WebsiteQuestionsPage() {
  const t = useTranslations("admin.websiteDetail.questions");
  const params = useParams();
  const websiteId = params.websiteId as Id<"websites">;

  const [draft, setDraft] = useState("");
  /*
    Absent means "all of them", which is also what the mutation does with an
    empty list. Holding the *exclusions* rather than the selection is what lets
    the engine list arrive from the server without this screen having to seed
    itself from it in an effect.
  */
  const [dropped, setDropped] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const addQuestion = useMutation(api.websiteCanonical.addWebsiteQuestion);
  const setActive = useMutation(api.websiteCanonical.setWebsiteQuestionActive);
  const removeQuestion = useMutation(api.websiteCanonical.removeWebsiteQuestion);
  const action = useAdminAction({ scope: "admin-website-questions" });

  const questions = useQuery(api.websiteCanonical.listWebsiteQuestions, {
    websiteId,
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });

  const isLoading = questions === undefined;

  const allEngines = useQuery(api.websiteCanonical.listEngines, {}) ?? [];
  const engines = allEngines.filter((engine) => !dropped.includes(engine));

  const toggleEngine = (engine: string) => {
    setDropped((current) => (
      current.includes(engine)
        ? current.filter((entry) => entry !== engine)
        : [...current, engine]
    ));
  };

  const handleAdd = async () => {
    setError("");
    const outcome = await action.run(
      () => addQuestion({ websiteId, prompt: draft, engines }),
      { key: "add", suppressErrorToast: true, fallbackMessage: t("errors.addFailed") },
    );
    if (outcome.ok) setDraft("");
    else setError(outcome.message);
  };

  const handleToggle = async (questionId: Id<"websiteQuestions">, isActive: boolean) => {
    setError("");
    const outcome = await action.run(
      () => setActive({ questionId, isActive }),
      { key: questionId, suppressErrorToast: true, fallbackMessage: t("errors.toggleFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  const handleRemove = async (questionId: Id<"websiteQuestions">) => {
    setError("");
    const outcome = await action.run(
      () => removeQuestion({ questionId }),
      { key: questionId, suppressErrorToast: true, fallbackMessage: t("errors.removeFailed") },
    );
    if (!outcome.ok) setError(outcome.message);
  };

  const engineLabel = (engine: string) => {
    if (engine === "chatgpt") return t("engines.chatgpt");
    if (engine === "claude") return t("engines.claude");
    if (engine === "gemini") return t("engines.gemini");
    if (engine === "perplexity") return t("engines.perplexity");
    return engine;
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<MessageSquare className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={t("subtitle")}
      />

      <div className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-card/40 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <Field
            id="website-question"
            label={t("addLabel")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t("addPlaceholder")}
            wrapperClassName="flex-1 min-w-[18rem]"
          />
          <Button
            variant="quiet"
            className="px-3 py-2 text-[12px]"
            disabled={action.isBusy("add") || draft.trim().length === 0 || engines.length === 0}
            onClick={() => void handleAdd()}
          >
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            {t("add")}
          </Button>
        </div>

        {/*
          A tick on the chosen engines, not only a colour. Seen in the browser on
          2026-09-22: a chip just switched off keeps its focus ring, and a focus
          ring in the brand colour read exactly like "on" — so the one choice on
          this screen that changes the bill could not be read back.
        */}
        <div className="flex flex-wrap items-center gap-2">
          {allEngines.map((engine) => {
            const chosen = engines.includes(engine);
            return (
              <Button
                key={engine}
                variant="outline"
                role="checkbox"
                aria-checked={chosen}
                className={`rounded-full px-3 py-1 text-[12px] ${
                  chosen ? "border-brand bg-brand/10 text-brand" : "border-dashed text-muted"
                }`}
                onClick={() => toggleEngine(engine)}
              >
                {chosen ? <Check className="mr-1 inline h-3 w-3" aria-hidden="true" /> : null}
                {engineLabel(engine)}
              </Button>
            );
          })}
        </div>

        {/* What a cycle buys, and why nothing queues any more. */}
        <span className="text-[11px] text-muted">
          {isLoading ? "" : `${t("asked", { count: questions.engineCalls })} · ${t("live")}`}
        </span>
        <SaveError>{error}</SaveError>
      </div>

      <DataTable
        rows={isLoading ? undefined : questions.data}
        rowKey={(row) => row._id}
        minWidthClassName="min-w-[820px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{
          icon: <MessageSquare className="h-8 w-8 text-muted/30" />,
          label: searchTerm ? t("noMatch") : t("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: questions?.totalPages ?? 1,
          totalCount: questions?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: searchTerm ? t("noMatch") : t("empty") },
        }}
        columns={[
          {
            key: "prompt",
            header: t("promptColumn"),
            cell: (row) => <span className="text-[13px] text-foreground">{row.prompt}</span>,
          },
          {
            key: "engines",
            header: t("enginesColumn"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.engines.map(engineLabel).join(", ")}
              </span>
            ),
          },
          {
            key: "state",
            header: t("stateColumn"),
            cell: (row) => (
              <StatusPill tone={row.isActive ? "success" : "neutral"}>
                {row.isActive ? t("active") : t("paused")}
              </StatusPill>
            ),
          },
          {
            key: "actions",
            header: t("actionsColumn"),
            align: "right",
            cell: (row) => (
              <RowActions>
                <Button
                  variant="quiet"
                  className="px-2 py-1 text-[11px]"
                  disabled={action.isBusy(row._id)}
                  onClick={() => void handleToggle(row._id, !row.isActive)}
                >
                  {row.isActive ? t("pause") : t("resume")}
                </Button>
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
