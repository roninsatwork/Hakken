"use client";

import React, { useState } from "react";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, NotebookPen, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";

/**
 * "What the assistant knows about me" (personal-layer-and-goals-plan.md,
 * part 2): every entry the assistant holds about the signed-in person,
 * each with a delete beside it, and a box to add one by hand. This tab is
 * the whole visibility story — the note works quietly in the background,
 * but nothing on it is ever secret from its own subject, and nobody else
 * (admins included) has a screen for it at all.
 */
export function AssistantNoteTab() {
  const t = useTranslations("user.assistantNote");
  const notes = useQuery(api.userMemories.listMine, {});
  const addNote = useMutation(api.userMemories.addMine);
  const deleteNote = useMutation(api.userMemories.deleteMine);

  const [draft, setDraft] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const action = useAdminAction({ scope: "profile-assistant-note" });
  const [error, setError] = useState("");

  const handleAdd = async () => {
    if (isSaving || !draft.trim()) return;
    setIsSaving(true);
    setError("");
    const outcome = await action.run(() => addNote({ content: draft }), {
      key: "add-note",
      suppressErrorToast: true,
      fallbackMessage: t("addFailed"),
    });
    if (outcome.ok) setDraft("");
    else if (outcome.message) setError(outcome.message);
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col gap-5 w-full max-w-4xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div>
        <h3 className="text-[15px] font-medium text-foreground tracking-wide">{t("title")}</h3>
        <p className="text-[12px] text-secondary mt-0.5">{t("description")}</p>
      </div>

      {notes === undefined ? (
        <div className="py-8 text-center">
          <Loader2 className="w-5 h-5 animate-spin mx-auto opacity-50" />
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[16px] border border-border-dim/50 bg-sidebar/30 px-6 py-8 text-center">
          <NotebookPen className="w-5 h-5 text-muted" />
          <p className="text-[13px] text-secondary max-w-md">{t("empty")}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notes.map((note) => (
            <li
              key={note.memoryId}
              className="flex items-start justify-between gap-3 rounded-[12px] border border-border-dim/50 bg-sidebar/30 px-4 py-3"
            >
              <div className="flex flex-col gap-1">
                <span className="text-[13px] text-foreground">{note.content}</span>
                <span className="text-[11px] text-muted">
                  {note.sourceType === "MANUAL" ? t("sourceManual") : t("sourceLearned")}
                  {" · "}
                  {new Date(note.createdAt).toLocaleDateString()}
                </span>
              </div>
              <Button
                variant="icon"
                onClick={() =>
                  void action.run(() => deleteNote({ memoryId: note.memoryId }), {
                    key: note.memoryId,
                    suppressErrorToast: true,
                    fallbackMessage: t("addFailed"),
                  }).then((outcome) => {
                    if (!outcome.ok && outcome.message) setError(outcome.message);
                  })
                }
                aria-label={t("delete")}
                title={t("delete")}
                className="rounded-lg hover:text-destructive hover:bg-destructive/10 shrink-0"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Field
              label={t("addPlaceholder")}
              labelHidden
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t("addPlaceholder")}
              disabled={isSaving}
            />
          </div>
          <Button
            variant="brand"
            onClick={() => void handleAdd()}
            disabled={isSaving || !draft.trim()}
            className="flex items-center gap-2 whitespace-nowrap"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t("addButton")}
          </Button>
        </div>
        {error && <p className="text-[12px] text-destructive">{error}</p>}
        <p className="text-[11px] text-muted">{t("privacyHint")}</p>
      </div>
    </div>
  );
}
