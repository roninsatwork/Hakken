"use client";

import type { FunctionReturnType } from "convex/server";
import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatDateTime } from "@/src/lib/dates";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";

type ReceptionScreens = FunctionReturnType<typeof api.kiosk.listMyReceptionScreens>;

export default function ReceptionResults({ screens }: { screens: ReceptionScreens }) {
  const t = useTranslations("reception");

  if (screens.length === 0) {
    return <SonaeEmptyState title={t("empty")} description={t("emptyHint")} />;
  }

  return screens.map((screen) => (
    <section
      key={screen.widgetId}
      className="rounded-2xl border border-border-dim bg-sidebar/30 px-8 py-10 text-center"
    >
      <p className="text-[12px] uppercase tracking-[0.2em] text-secondary">
        {t("screenLabel")}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {screen.name}
      </p>
      <a
        href={`/kiosk/${screen.widgetId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-brand px-8 py-3 text-[14px] font-bold text-white shadow-lg transition-transform hover:scale-[1.02]"
      >
        <ExternalLink className="w-4 h-4" />
        {t("open")}
      </a>
      <p className="mt-5 text-[13px] text-secondary">
        {screen.lastSeenAt
          ? t("lastSeen", {
              when: formatDateTime(screen.lastSeenAt),
              count: screen.sessionCount,
            })
          : t("neverSeen")}
      </p>
    </section>
  ));
}
