"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAdminAction } from "@/src/hooks/useAdminAction";

/**
 * An Admin → Content editing page's form (docs/plans/active/knowledge-news-
 * and-digest-plan.md): every editor is a page, never a pop-up (Anthony,
 * 2026-10-01). The form starts from the row — or empty for a new one — and
 * saving goes through the house runner (`useAdminAction`), back to the list
 * when it lands and with the failure on the page when it does not.
 */
export function useContentForm<Row, Form>({
  scope,
  row,
  empty,
  toForm,
  save,
  backHref,
  doneHref,
  saveFailed,
}: {
  scope: string;
  /** The row being edited, null for a new one, undefined while it loads. */
  row: Row | null | undefined;
  empty: Form;
  toForm: (row: Row) => Form;
  save: (form: Form) => Promise<unknown>;
  backHref: string;
  /**
   * Where a save lands, from what it returned, when that is not back to the
   * list: Add a person opens the new person's page
   * (content-people-knowledge-plan.md, board 3).
   */
  doneHref?: (saved: unknown) => string;
  saveFailed: string;
}) {
  const router = useRouter();
  const action = useAdminAction({ scope });
  // Untouched, the form is the row as it stands; the first change copies it.
  const [draft, setDraft] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const form = draft ?? (row ? toForm(row) : empty);

  // Each change lands on the form as it stands then, not as it was when the
  // handler began: a change that arrives after a wait — Helpful content's
  // summary, written once its page is read — must not undo the ones before it.
  const update = (patch: Partial<Form>) => setDraft((current) => ({ ...(current ?? (row ? toForm(row) : empty)), ...patch }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const outcome = await action.run(() => save(form), { suppressErrorToast: true, fallbackMessage: saveFailed });
    if (outcome.ok) router.push(doneHref ? doneHref(outcome.data) : backHref);
    else if (outcome.message) setError(outcome.message);
  };

  return { form, update, submit, error, isSaving: action.isBusy() };
}
