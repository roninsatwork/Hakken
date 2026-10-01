"use client";

import { useState } from "react";
import { useAdminAction } from "@/src/hooks/useAdminAction";

/**
 * Deleting from an Admin → Content list: asked first, in the one kind of
 * pop-up the dashboard keeps — a yes or a no (Anthony, 2026-10-01) — and run
 * through the house runner, its failure shown in that dialog.
 */
export function useContentDelete<Row, Args>({
  scope,
  remove,
  argsFor,
  deleteFailed,
}: {
  scope: string;
  /** The delete mutation itself; it is only ever called inside the runner below. */
  remove: (args: Args) => Promise<unknown>;
  argsFor: (row: Row) => Args;
  deleteFailed: string;
}) {
  const action = useAdminAction({ scope });
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [error, setError] = useState("");

  const confirmDelete = async () => {
    if (!deleting) return;
    const outcome = await action.run(() => remove(argsFor(deleting)), { suppressErrorToast: true, fallbackMessage: deleteFailed });
    if (outcome.ok) setDeleting(null);
    else if (outcome.message) setError(outcome.message);
  };

  return {
    deleting,
    askDelete: (row: Row) => {
      setError("");
      setDeleting(row);
    },
    closeDelete: () => {
      setDeleting(null);
      setError("");
    },
    confirmDelete,
    error,
    isBusy: action.isBusy(),
  };
}
