"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Check, Pencil, Sparkles, Trash2, X } from "lucide-react";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { Field } from "@/src/ui/components/screens/Field";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatTime } from "@/src/lib/dates";
import { useEngineLabel } from "@/src/app/(dashboard)/admin/_components/EngineChoice";
import { sectionBase } from "../../_components/websitesSection";
import { AddBar } from "../../_components/AddBar";
import { smallDollars } from "../../money";
import { useAiLists } from "./AiLists";

type Row = FunctionReturnType<typeof api.promptFanOut.getPromptFanOut>["rows"][number];

/**
 * One prompt's fan-out queries: the searches the AIs ran before answering it
 * — an admin data-entry list, and nothing else (docs/plans/active/
 * prompt-fan-out-queries-plan.md; Anthony, 2026-09-28: "its intent is to add,
 * edit and delete fan out queries").
 *
 * Opt-in (fan-out-opt-in-plan.md): each is checked on Google once, and the
 * ticked ones every run, up to the website's limit for them — at it, the empty
 * boxes grey out and say why. Here the admin ticks and unticks, adds one of
 * their own (ticked, room allowing), edits the words (the pencil), deletes one
 * (the trash can — off the list for good, with an undo straight after), or
 * asks the AIs now with Generate, the page's one orange action. Where the site
 * ranks for them is What came back's, not this list's.
 *
 * One screen at both scopes, like Your prompts: `companyWebsiteId` is the
 * website chosen in the section's menu, and only decides where "back" goes.
 */
export function PromptFanOut({ questionId, companyWebsiteId }: {
  questionId: Id<"websiteQuestions">;
  companyWebsiteId?: Id<"companyWebsites">;
}) {
  const t = useTranslations("admin.promptFanOut");
  const tCommon = useTranslations("common");
  const engineLabel = useEngineLabel();
  const { companyId, base } = useAiLists();

  const data = useQuery(api.promptFanOut.getPromptFanOut, { companyId, questionId });

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<{ from: string; text: string } | null>(null);
  const [deleted, setDeleted] = useState<{ queryText: string; wasTicked: boolean } | null>(null);
  const [notTicked, setNotTicked] = useState<string | null>(null);
  const [reusedToday, setReusedToday] = useState(false);
  const [error, setError] = useState("");

  const action = useAdminAction({ scope: "admin-prompt-fan-out" });
  const addQuery = useMutation(api.promptFanOut.addPromptFanOutQuery);
  const editQuery = useMutation(api.promptFanOut.editPromptFanOutQuery);
  const tickQuery = useMutation(api.promptFanOut.setPromptFanOutQueryTicked);
  const removeQuery = useMutation(api.promptFanOut.removePromptFanOutQuery);
  const restoreQuery = useMutation(api.promptFanOut.restorePromptFanOutQuery);
  const generate = useMutation(api.promptFanOut.generatePromptFanOut);

  const backHref = companyWebsiteId ? `${sectionBase(companyId)}/site/${companyWebsiteId}/questions` : base;
  const args = { companyId, questionId };

  const run = async <T,>(key: string, task: () => Promise<T>) => {
    setError("");
    const outcome = await action.run(task, { key, suppressErrorToast: true, fallbackMessage: t("errors.failed") });
    if (!outcome.ok) setError(outcome.message);
    return outcome.ok ? outcome.data : null;
  };

  const add = async () => {
    const text = draft.trim();
    setNotTicked(null);
    const added = await run("add", () => addQuery({ ...args, queryText: draft }));
    if (!added) return;
    setDraft("");
    if (!added.ticked) setNotTicked(text);
  };
  const saveEdit = async () => {
    if (!editing) return;
    if (await run(`edit:${editing.from}`, async () => {
      await editQuery({ ...args, from: editing.from, queryText: editing.text });
      return true;
    })) setEditing(null);
  };
  const toggle = async (row: Row, ticked: boolean) => {
    await run(`tick:${row.query}`, () => tickQuery({ ...args, queryText: row.queryText, ticked }));
  };
  const remove = async (row: Row) => {
    setNotTicked(null);
    const removed = await run(`remove:${row.query}`, () => removeQuery({ ...args, queryText: row.queryText }));
    if (removed) setDeleted({ queryText: row.queryText, wasTicked: removed.wasTicked });
  };
  const undo = async () => {
    if (!deleted) return;
    const restored = await run("undo", () => restoreQuery({ ...args, queryText: deleted.queryText, ticked: deleted.wasTicked }));
    if (!restored) return;
    setDeleted(null);
    if (deleted.wasTicked && !restored.ticked) setNotTicked(deleted.queryText);
  };
  const generateNow = async () => {
    setReusedToday(false);
    setError("");
    const outcome = await action.run(() => generate(args), { key: "generate", suppressErrorToast: true, fallbackMessage: t("errors.failed") });
    if (!outcome.ok) setError(outcome.message);
    else setReusedToday(outcome.data.asked === 0);
  };

  const question = data?.question;
  const host = question?.host ?? "";
  const rows = data?.rows ?? [];
  const term = searchTerm.trim().toLowerCase();
  const shown = rows.filter((row) => !term || row.queryText.toLowerCase().includes(term));
  const totalPages = Math.max(1, Math.ceil(shown.length / TABLE_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const tickedHere = rows.filter((row) => row.ticked).length;
  const ticked = data?.ticked ?? { count: 0, limit: 0 };
  // At the website's limit, nothing more can be ticked; past it (the limit was lowered), the first ticked are checked.
  const full = data !== undefined && ticked.count >= ticked.limit;
  const engines = (question?.engines ?? []).map(engineLabel).join(", ");
  const generating = data?.generating ?? null;

  // What Generate is doing, or why it cannot: one line, the newest news first.
  const generateNews = !data
    ? ""
    : !data.collecting
      ? t("generateOff")
      : generating && generating.waiting > 0
        ? t("generating", { engines })
        : generating && generating.failed > 0
          ? t("generateFailed", { count: generating.failed })
          : reusedToday
            ? t("generatedReused")
            : generating
              ? t("generated", { time: formatTime(generating.at) })
              : "";

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <DetailHeader
        back={{ label: t("back"), href: backHref }}
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={t("title")}
        description={question ? (
          <>
            <span className="text-foreground">{t("forPrompt", { prompt: question.prompt })}</span>
            <span className="mt-1 block max-w-2xl">{t("description", { host })}</span>
          </>
        ) : null}
        pills={question && !question.isActive ? <StatusLabel tone="neutral">{t("paused")}</StatusLabel> : null}
        action={question ? (
          <PagePrimaryAction
            variant="brand"
            icon={<Sparkles className="h-4 w-4" />}
            title={data?.generateUsd != null
              ? t("generateTip", { engines, price: smallDollars(data.generateUsd) })
              : t("generateTipUnknown", { engines })}
            disabled={!data?.collecting || action.isBusy("generate") || Boolean(generating && generating.waiting > 0)}
            onClick={() => void generateNow()}
          >
            {t("generate")}
          </PagePrimaryAction>
        ) : null}
      />

      {generateNews ? <Notice>{generateNews}</Notice> : null}
      {data && ticked.count > ticked.limit ? (
        <Notice>{t("over", { count: ticked.count, limit: ticked.limit, extra: ticked.count - ticked.limit, host })}</Notice>
      ) : null}
      {deleted ? (
        <Notice action={<Button variant="quiet" disabled={action.isBusy("undo")} onClick={() => void undo()}>{t("undo")}</Button>}>
          {t("deleted", { query: deleted.queryText })}
        </Notice>
      ) : null}
      {notTicked ? <Notice>{t("notTicked", { query: notTicked, host, limit: ticked.limit })}</Notice> : null}

      {question ? (
        <AddBar
          label={t("add")}
          disabled={action.isBusy("add") || draft.trim().length === 0}
          onAdd={() => void add()}
        >
          <Field
            id="prompt-new-query"
            label={t("addLabel")}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && draft.trim()) void add();
            }}
            placeholder={t("addPlaceholder")}
            wrapperClassName="flex-1 min-w-[18rem]"
          />
        </AddBar>
      ) : null}

      <SaveError>{error}</SaveError>
      {data?.cut ? <p className="text-[12px] text-muted">{t("cut")}</p> : null}

      <DataTable
        rows={data === undefined ? undefined : shown.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE)}
        rowKey={(row) => row.query}
        // Four narrow columns: the table's usual minimum width would push the icons off a laptop screen.
        minWidthClassName="min-w-[52rem]"
        search={{
          value: searchTerm,
          onChange: (next) => {
            setSearchTerm(next);
            setPage(1);
          },
          placeholder: t("searchPlaceholder"),
        }}
        empty={{ icon: <Sparkles className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page: safePage,
          totalPages,
          totalCount: shown.length,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: data === undefined,
          onPageChange: setPage,
          labels: {
            empty: term ? t("noMatch") : t("empty"),
            showing: (start, end, total) => {
              const counts = { start, end, total, here: tickedHere, count: ticked.count, limit: ticked.limit, host };
              // A price only for what is ticked here: none ticked costs nothing to say.
              return data?.checkUsd != null && tickedHere > 0
                ? t("showing", { ...counts, price: smallDollars(data.checkUsd * tickedHere) })
                : t("showingUnknown", counts);
            },
          },
        }}
        columns={[
          {
            key: "tick",
            header: t("columns.tick"),
            className: "w-[170px]",
            cell: (row) => {
              // Full: an empty box cannot be ticked, and says why.
              const blocked = !row.ticked && full;
              const reason = blocked ? t("full", { count: ticked.count, limit: ticked.limit, host }) : undefined;
              return (
                <span title={reason} className="flex items-center gap-2">
                  <Checkbox
                    label={t("tickLabel", { query: row.queryText })}
                    labelHidden
                    checked={row.ticked}
                    disabled={blocked || action.isBusy(`tick:${row.query}`)}
                    title={reason}
                    onChange={(next) => void toggle(row, next)}
                  />
                  <span className={row.ticked ? "text-[13px] font-semibold text-foreground" : "text-[13px] text-muted"}>
                    {row.ticked ? t("everyRun") : t("onceOnly")}
                  </span>
                </span>
              );
            },
          },
          {
            key: "query",
            header: t("columns.query"),
            cell: (row) => editing?.from === row.queryText ? (
              <Field
                label={t("editLabel", { query: row.queryText })}
                labelHidden
                autoFocus
                value={editing.text}
                onChange={(event) => setEditing({ from: row.queryText, text: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void saveEdit();
                  if (event.key === "Escape") setEditing(null);
                }}
                className="h-[38px] text-[13px]"
              />
            ) : (
              <span className="text-[13px] text-foreground">{row.queryText}</span>
            ),
          },
          {
            key: "seen",
            header: t("columns.seen"),
            align: "right",
            className: "w-[220px] whitespace-nowrap",
            cell: (row) => (
              <span className="font-mono text-[12px] text-foreground">
                {row.timesSeen === null ? t("yourOwn") : t("seen", { count: row.timesSeen })}
              </span>
            ),
          },
          {
            key: "actions",
            hiddenHeader: t("columns.actions"),
            align: "right",
            className: "w-[120px]",
            cell: (row) => (
              <RowActions alwaysVisible>
                {editing?.from === row.queryText ? (
                  <>
                    <RowIconButton label={t("save")} onClick={() => void saveEdit()}>
                      <Check className="h-4 w-4" />
                    </RowIconButton>
                    <RowIconButton label={tCommon("cancel")} onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" />
                    </RowIconButton>
                  </>
                ) : (
                  <>
                    <RowIconButton label={t("editRow", { query: row.queryText })} onClick={() => setEditing({ from: row.queryText, text: row.queryText })}>
                      <Pencil className="h-4 w-4" />
                    </RowIconButton>
                    <RowIconButton label={t("deleteRow", { query: row.queryText })} tone="danger" onClick={() => void remove(row)}>
                      <Trash2 className="h-4 w-4" />
                    </RowIconButton>
                  </>
                )}
              </RowActions>
            ),
          },
        ]}
      />
    </div>
  );
}
