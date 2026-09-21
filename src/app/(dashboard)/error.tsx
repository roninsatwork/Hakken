"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { reportError } from "@/src/lib/reportError";

/**
 * Boundary for every authenticated surface (`/admin`, `/app`).
 *
 * The root layout is still mounted here, so theme and translations are
 * available. Only the failed segment is replaced — navigation stays usable,
 * which matters because most failures are one bad page rather than a dead app.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorBoundary");

  useEffect(() => {
    reportError(error, { scope: "dashboard-segment" });
  }, [error]);

  return (
    <div className="w-full flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5 text-destructive" />
        </div>

        <div className="flex flex-col gap-2">
          <h1 className="text-[16px] font-medium text-foreground tracking-tight">{t("title")}</h1>
          <p className="text-[13px] font-light text-muted leading-relaxed">{t("description")}</p>
        </div>

        {error.digest ? (
          <p className="text-[11px] text-secondary font-mono">
            {t("reference", { digest: error.digest })}
          </p>
        ) : null}

        <button
          type="button"
          onClick={reset}
          className="mt-2 inline-flex items-center gap-2 rounded-full border border-border-dim bg-sidebar/50 px-4 py-2 text-[13px] text-foreground transition-colors hover:bg-sidebar"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          {t("retry")}
        </button>
      </div>
    </div>
  );
}
