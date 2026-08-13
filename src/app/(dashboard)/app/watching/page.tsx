"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { motion } from "framer-motion";
import { AlertTriangle, Eye, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Header from "@/src/ui/components/layout/Header";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { formatDateTime } from "@/src/lib/dates";

type Interval = "daily" | "weekly" | "monthly";

/**
 * Questions Sonae re-asks on a schedule.
 *
 * Each row says when it last ran and whether the answer moved, because the
 * useful state of a watcher is usually "nothing has changed" — and that has
 * to be visible, or silence is indistinguishable from being broken.
 */
export default function WatchingPage() {
  const t = useTranslations("watching");
  const questions = useQuery(api.scheduledQuestions.listQuestions, {});
  const createQuestion = useMutation(api.scheduledQuestions.createQuestion);
  const setActive = useMutation(api.scheduledQuestions.setQuestionActive);
  const removeQuestion = useMutation(api.scheduledQuestions.deleteQuestion);

  const [isAdding, setIsAdding] = useState(false);
  const [question, setQuestion] = useState("");
  const [interval, setIntervalValue] = useState<Interval>("weekly");
  const [raisesTask, setRaisesTask] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!question.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await createQuestion({ question: question.trim(), intervalStr: interval, raisesTask });
      setQuestion("");
      setRaisesTask(false);
      setIsAdding(false);
    } catch (error) {
      console.error("Failed to add a watched question", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Eye className="w-6 h-6 text-brand" />
              {t("title")}
            </h1>
            <p className="text-[13px] text-secondary mt-1 max-w-[46rem]">{t("subtitle")}</p>
          </div>

          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:brightness-110 active:scale-95 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("new")}
          </button>
        </div>

        {isAdding && (
          <motion.form
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={handleCreate}
            className="flex flex-col gap-3 rounded-[12px] border border-border-dim bg-foreground/[0.02] p-4"
          >
            <input
              autoFocus
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={t("placeholder")}
              className="w-full bg-transparent border-0 border-b border-border-dim rounded-none px-0 pb-2 text-[15px] text-foreground focus:outline-none focus:border-brand/50 placeholder:text-muted/70"
            />
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-[12px] text-muted">
                {t("interval")}
                <select
                  value={interval}
                  onChange={(event) => setIntervalValue(event.target.value as Interval)}
                  className="bg-transparent border border-border-dim rounded-[8px] px-2 py-1 text-[12px] text-foreground focus:outline-none focus:border-brand/50"
                >
                  <option value="daily">{t("daily")}</option>
                  <option value="weekly">{t("weekly")}</option>
                  <option value="monthly">{t("monthly")}</option>
                </select>
              </label>

              <label className="flex items-center gap-2 text-[12px] text-muted">
                <input
                  type="checkbox"
                  checked={raisesTask}
                  onChange={(event) => setRaisesTask(event.target.checked)}
                  className="accent-brand"
                />
                {t("raisesTask")}
              </label>

              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-[12px] text-secondary hover:text-foreground transition-colors">
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={!question.trim() || isSaving}
                  className="px-3 py-1.5 rounded-[8px] bg-brand text-white text-[12px] font-medium disabled:opacity-40 hover:brightness-110 transition-all"
                >
                  {t("add")}
                </button>
              </div>
            </div>
          </motion.form>
        )}

        {questions && questions.length === 0 ? (
          <SonaeEmptyState icon={Eye} title={t("title")} description={t("empty")} />
        ) : (
          <ul className="flex flex-col">
            {questions?.map((row) => (
              <li key={row._id} className="flex items-start gap-4 py-4 border-b border-border-dim last:border-b-0">
                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                  <span className="text-[15px] text-foreground">{row.question}</span>

                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                    <span>{t(row.intervalStr as Interval)}</span>
                    <span>
                      {row.lastAskedAt
                        ? `${t("lastAsked")} ${formatDateTime(row.lastAskedAt, { locale: [] })}`
                        : t("neverAsked")}
                    </span>
                    {row.lastChangedAt && (
                      <span className="text-brand">
                        {t("changed")} {formatDateTime(row.lastChangedAt, { locale: [] })}
                      </span>
                    )}
                    {row.lastError && (
                      <span className="inline-flex items-center gap-1 text-amber-500">
                        <AlertTriangle className="w-3 h-3" />
                        {t("failed")}
                      </span>
                    )}
                  </span>

                  {row.lastAnswer && (
                    <p className="text-[13px] leading-relaxed text-secondary max-w-[46rem]">
                      {row.lastAnswer.length > 300 ? `${row.lastAnswer.slice(0, 300)}…` : row.lastAnswer}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setActive({ questionId: row._id as Id<"scheduledQuestions">, isActive: !row.isActive })}
                    aria-pressed={row.isActive}
                    className={`h-8 px-3 rounded-[8px] border text-[12px] transition-colors ${
                      row.isActive
                        ? "border-brand/40 bg-brand/10 text-brand"
                        : "border-border-dim text-secondary hover:text-foreground hover:bg-foreground/5"
                    }`}
                  >
                    {row.isActive ? t("on") : t("off")}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion({ questionId: row._id as Id<"scheduledQuestions"> })}
                    aria-label={t("remove")}
                    className="w-8 h-8 rounded-[8px] flex items-center justify-center text-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
