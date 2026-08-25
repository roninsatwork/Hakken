"use client";

import { useQuery } from "convex/react";
import { MonitorSpeaker } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { lazy, Suspense } from "react";

const ReceptionResults = lazy(() => import("./ReceptionResults"));

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

        <Suspense fallback={null}>
          {screens === undefined ? null : <ReceptionResults screens={screens} />}
        </Suspense>
      </div>
    </>
  );
}
