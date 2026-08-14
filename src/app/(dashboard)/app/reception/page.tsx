"use client";

import { useQuery } from "convex/react";
import { ExternalLink, MonitorSpeaker } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatDateTime } from "@/src/lib/dates";
import Header from "@/src/ui/components/layout/Header";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";

/**
 * Reception: the front door to the receptionist screen, in the main menu
 * beside Calls — because a client-facing demo nobody can find is a demo
 * that does not exist. Same shape as the Calls screen on purpose: header,
 * one headline panel, the live detail beneath.
 */
export default function ReceptionPage() {
  const t = useTranslations("reception");
  const screens = useQuery(api.kiosk.listMyReceptionScreens, {});

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <MonitorSpeaker className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t("subtitle")}</p>
        </div>

        {screens === undefined ? null : screens.length === 0 ? (
          <SonaeEmptyState title={t("empty")} description={t("emptyHint")} />
        ) : (
          screens.map((screen) => (
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
          ))
        )}
      </div>
    </>
  );
}
