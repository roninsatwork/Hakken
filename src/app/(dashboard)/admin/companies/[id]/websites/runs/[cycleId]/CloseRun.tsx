"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/src/ui/components/screens/Button";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { useAdminAction } from "@/src/hooks/useAdminAction";

/**
 * Close this run: a collection finished by hand (Anthony, 2026-09-25: "is
 * there a way to manually close it"). Only while the run is still open, and
 * only after saying what closing does — requests not yet sent come off the
 * queue, answers already paid for are still filed
 * (`seoCollectionClose.closeCollectionRun`). Grey: it is not the page's action.
 */
export function CloseRun({ cycleId, open }: { cycleId: Id<"seoCollectionCycles">; open: boolean }) {
  const t = useTranslations("admin.collectionRuns.detail.close");
  const canWriteHere = useCanWriteHere();
  const closeRun = useMutation(api.seoCollectionClose.closeCollectionRun);
  const action = useAdminAction({ scope: "admin-collection-run-close" });
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (!canWriteHere || !open) return null;

  const handleConfirm = async () => {
    setError("");
    const outcome = await action.run(async () => await closeRun({ cycleId }), {
      suppressErrorToast: true,
      fallbackMessage: t("failed"),
    });
    if (outcome.ok) setConfirming(false);
    // A repeat click while the first is running owns nothing to report.
    else if (!outcome.deduplicated) setError(outcome.message);
  };

  return (
    <>
      <Button variant="quiet" onClick={() => setConfirming(true)} className="px-3 py-1.5 text-[13px]">
        {t("button")}
      </Button>
      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={t("title")}
        confirmLabel={t("confirm")}
        cancelLabel={t("cancel")}
        isSubmitting={action.isBusy()}
        onConfirm={handleConfirm}
        error={error || undefined}
      >
        <p>{t("body")}</p>
      </ConfirmationModal>
    </>
  );
}
