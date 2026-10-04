"use client";

import { useMutation } from "convex/react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { Notice } from "@/src/ui/components/screens/Notice";
import type { LookupOverview } from "./useLookup";

/** Waiting while the agent buys, or why it failed, with Look up again for anyone who may buy. */
export function LookupState({ lookup }: { lookup: LookupOverview }) {
  const t = useTranslations("keywordResearch.lookup");
  const lookUpAgain = useMutation(api.keywordResearch.lookUpAgain);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-again" });
  if (lookup.state === "WAITING") return <Notice>{t("waitingNotice")}</Notice>;
  if (lookup.state !== "FAILED") return null;
  return (
    <Notice
      tone="warning"
      action={
        lookup.canLookUp ? (
          <Button
            variant="quiet"
            disabled={isBusy()}
            onClick={() => void run(() => lookUpAgain({ lookupId: lookup.lookupId }), { fallbackMessage: t("againFailed") })}
            className="inline-flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            {t("again")}
          </Button>
        ) : undefined
      }
    >
      {lookup.problem ?? t("failedNotice")}
    </Notice>
  );
}
