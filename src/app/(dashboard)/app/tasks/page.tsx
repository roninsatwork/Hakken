"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { Check, ListChecks, Plus, RotateCcw, Sparkles, Workflow, X } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatTaskDue, groupTasks, type TaskGroup } from "@/src/lib/taskGrouping";
import Header from "@/src/ui/components/layout/Header";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { PageHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { Field } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";
import { LAYER } from "@/src/ui/lib/layers";

const TASK_PAGE_SIZE = 30;

/**
 * The list of work waiting on somebody.
 *
 * Grouped by when it is due rather than when it was made, because the only
 * question anyone asks a to-do list is "what needs me today". Overdue leads;
 * finished and dropped work sits at the bottom as a record rather than a
 * queue.
 */
export default function TasksPage() {
  const t = useTranslations("tasks");
  const action = useAdminAction({ scope: "tasks-create" });
  const rowAction = useAdminAction({ scope: "tasks-row" });

  const [mineOnly, setMineOnly] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssignee, setNewAssignee] = useState<string>("");
  const [newDue, setNewDue] = useState("");

  const { results: tasks, status, loadMore } = usePaginatedQuery(
    api.tasks.listTasks,
    { mineOnly: mineOnly || undefined },
    { initialNumItems: TASK_PAGE_SIZE },
  );
  const team = useQuery(api.tasks.listAssignableMembers, {});
  const createTask = useMutation(api.tasks.createTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const reopenTask = useMutation(api.tasks.reopenTask);
  const cancelTask = useMutation(api.tasks.cancelTask);

  // Read once per render pass so every row groups against the same instant,
  // and ticked so a list left open does not go on calling yesterday today.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const grouped = groupTasks(tasks, now);
  const nameFor = (userId?: Id<"users">) =>
    team?.find((member) => member._id === userId)?.name
    || team?.find((member) => member._id === userId)?.email
    || null;

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!newTitle.trim()) return;

    await action.run(
      async () => {
        await createTask({
          title: newTitle.trim(),
          ...(newAssignee ? { assigneeUserId: newAssignee as Id<"users"> } : {}),
          ...(newDue ? { dueAt: new Date(`${newDue}T12:00:00`).getTime() } : {}),
        });
        setNewTitle("");
        setNewAssignee("");
        setNewDue("");
        setIsAdding(false);
      },
      { fallbackMessage: t("createFailed") },
    );
  };

  const handleComplete = (taskId: Id<"tasks">) =>
    rowAction.run(() => completeTask({ taskId }), {
      key: taskId,
      fallbackMessage: t("doneFailed"),
    });

  const handleReopen = (taskId: Id<"tasks">) =>
    rowAction.run(() => reopenTask({ taskId }), {
      key: taskId,
      fallbackMessage: t("reopenFailed"),
    });

  const handleCancel = (taskId: Id<"tasks">) =>
    rowAction.run(() => cancelTask({ taskId }), {
      key: taskId,
      fallbackMessage: t("dismissFailed"),
    });

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader
          icon={<ListChecks className="w-6 h-6 text-brand" />}
          title={t("title")}
          description={t("subtitle")}
          action={
            <div className={`relative ${LAYER.PAGE_CHROME} flex items-center gap-2`}>
              <div className="flex rounded-[10px] border border-border-dim p-0.5">
                <button
                  type="button"
                  onClick={() => setMineOnly(false)}
                  aria-pressed={!mineOnly}
                  className={`px-3 py-1.5 rounded-[8px] text-[12px] transition-colors ${!mineOnly ? "bg-foreground/10 text-foreground" : "text-secondary hover:text-foreground"}`}
                >
                  {t("all")}
                </button>
                <button
                  type="button"
                  onClick={() => setMineOnly(true)}
                  aria-pressed={mineOnly}
                  className={`px-3 py-1.5 rounded-[8px] text-[12px] transition-colors ${mineOnly ? "bg-foreground/10 text-foreground" : "text-secondary hover:text-foreground"}`}
                >
                  {t("mine")}
                </button>
              </div>

              <PagePrimaryAction
                onClick={() => setIsAdding(!isAdding)}
                icon={<Plus className="w-3.5 h-3.5" />}
              >
                {t("new")}
              </PagePrimaryAction>
            </div>
          }
        />

        {isAdding && (
          <motion.form
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleCreate}
            className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-foreground/[0.02] p-4"
          >
            {/* The title carries no visible label on purpose — this is a
                quick-add row under a heading that already says Tasks. Hidden
                rather than absent, so it is still announced. */}
            <Field
              autoFocus
              label={t("titlePlaceholder")}
              labelHidden
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              placeholder={t("titlePlaceholder")}
              className="h-auto rounded-none border-0 border-b border-border-dim bg-transparent px-0 pb-2 text-[15px] placeholder:text-muted/70 focus:border-brand/50"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="task-assignee" className="flex items-center gap-2 text-[12px] text-muted">
                {t("assignee")}
                <Select
                  id="task-assignee"
                  value={newAssignee}
                  onChange={setNewAssignee}
                  selectClassName="bg-transparent border border-border-dim rounded-[8px] px-2 py-1 text-[12px] text-foreground focus:outline-none focus:border-brand/50"
                >
                  <option value="">{t("unassigned")}</option>
                  {team?.map((member) => (
                    <option key={member._id} value={member._id}>
                      {member.name || member.email}
                    </option>
                  ))}
                </Select>
              </label>

              {/* Wrapping label, which is a real association — this one is not
                  a bare input, and stacking it in a Field would break the row. */}
              <label className="flex items-center gap-2 text-[12px] text-muted">
                {t("due")}
                <input
                  type="date"
                  value={newDue}
                  onChange={(event) => setNewDue(event.target.value)}
                  className="bg-transparent border border-border-dim rounded-[8px] px-2 py-1 text-[12px] text-foreground focus:outline-none focus:border-brand/50"
                />
              </label>

              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 text-[12px] text-secondary hover:text-foreground transition-colors"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!newTitle.trim() || action.isBusy()}
                  className="px-3 py-1.5 rounded-[8px] bg-brand text-white text-[12px] font-medium disabled:opacity-40 hover:brightness-110 transition-all"
                >
                  {t("create")}
                </button>
              </div>
            </div>
          </motion.form>
        )}

        {tasks.length === 0 && status !== "LoadingFirstPage" ? (
          <SonaeEmptyState
            icon={ListChecks}
            title={t("title")}
            description={mineOnly ? t("emptyMine") : t("empty")}
          />
        ) : (
          <div className="flex flex-col">
            {grouped.map((section) => (
              <section key={section.group} className="flex flex-col">
                <div className="flex items-center gap-2.5 pt-6 pb-1 first:pt-0">
                  <span
                    className={`text-[9px] font-medium tracking-[0.16em] uppercase ${
                      section.group === "overdue" ? "text-brand" : "text-muted"
                    }`}
                  >
                    {t(`groups.${section.group}` as `groups.${TaskGroup}`)}
                  </span>
                  <span aria-hidden="true" className="flex-1 h-px bg-border-dim" />
                </div>

                <ul className="flex flex-col">
                  {section.tasks.map((task) => {
                    const isSettled = task.status !== "OPEN";
                    const assignee = nameFor(task.assigneeUserId);
                    const due = formatTaskDue(task.dueAt);

                    return (
                      <li
                        key={task._id}
                        className="group flex items-start gap-3 py-2.5 border-b border-border-dim last:border-b-0"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void (isSettled ? handleReopen(task._id) : handleComplete(task._id))
                          }
                          aria-label={isSettled ? t("reopen") : t("done")}
                          className={`mt-0.5 w-4 h-4 rounded-[5px] border flex items-center justify-center flex-shrink-0 transition-colors ${
                            task.status === "DONE"
                              ? "bg-brand border-brand text-white"
                              : "border-border-dim hover:border-brand/60"
                          }`}
                        >
                          {task.status === "DONE" && <Check className="w-2.5 h-2.5" />}
                          {task.status === "CANCELLED" && <X className="w-2.5 h-2.5 text-muted" />}
                        </button>

                        <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                          <span
                            className={`text-[14px] leading-snug ${
                              isSettled ? "text-muted line-through decoration-muted/40" : "text-foreground"
                            }`}
                          >
                            {task.title}
                          </span>
                          {task.detail && <span className="text-[12px] text-muted">{task.detail}</span>}

                          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted">
                            {assignee && <span>{assignee}</span>}
                            <span>{due ?? t("noDue")}</span>
                            {task.createdBySource !== "PERSON" && (
                              <span className="inline-flex items-center gap-1">
                                {task.createdBySource === "AGENT" ? (
                                  <Sparkles className="w-3 h-3 text-brand" />
                                ) : (
                                  <Workflow className="w-3 h-3 text-brand" />
                                )}
                                {t(`raisedBy.${task.createdBySource}` as "raisedBy.AGENT" | "raisedBy.WORKFLOW")}
                              </span>
                            )}
                            {task.sourceUrl?.startsWith("/") && (
                              // Where this task came from — the call, the run.
                              // Stored since tasks existed, rendered nowhere
                              // until the phone made it matter: a follow-up
                              // to a call is unactionable without the call.
                              <Link
                                href={task.sourceUrl}
                                className="text-brand hover:underline"
                              >
                                {t("openSource")}
                              </Link>
                            )}
                          </span>
                        </div>

                        {task.status === "OPEN" && (
                          <button
                            type="button"
                            onClick={() => void handleCancel(task._id)}
                            aria-label={t("dismiss")}
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 w-7 h-7 rounded-[8px] flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {task.status === "DONE" && (
                          <button
                            type="button"
                            onClick={() => void handleReopen(task._id)}
                            aria-label={t("reopen")}
                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 w-7 h-7 rounded-[8px] flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 transition-all"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}

            {/* Not the kit's LoadMoreFooter: that is a table footer, with the
                rule and fill to match, and this is a grouped list. Forcing it
                on here would look like a table had lost its table. */}
            {status === "CanLoadMore" && (
              <button
                type="button"
                onClick={() => loadMore(TASK_PAGE_SIZE)}
                className="mt-5 self-start text-[12px] text-muted hover:text-foreground transition-colors"
              >
                {t("showMore")}
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
