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
  saveFailed,
}: {
  scope: string;
  /** The row being edited, null for a new one, undefined while it loads. */
  row: Row | null | undefined;
  empty: Form;
  toForm: (row: Row) => Form;
  save: (form: Form) => Promise<unknown>;
  backHref: string;
  saveFailed: string;
}) {
  const router = useRouter();
  const action = useAdminAction({ scope });
  // Untouched, the form is the row as it stands; the first change copies it.
  const [draft, setDraft] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const form = draft ?? (row ? toForm(row) : empty);

  const update = (patch: Partial<Form>) => setDraft({ ...form, ...patch });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const outcome = await action.run(() => save(form), { suppressErrorToast: true, fallbackMessage: saveFailed });
    if (outcome.ok) router.push(backHref);
    else if (outcome.message) setError(outcome.message);
  };

  return { form, update, submit, error, isSaving: action.isBusy() };
}
