"use client";

import { lazy, Suspense } from "react";
import { useQuery } from "convex/react";
import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

const PhoneNumberContent = lazy(() =>
  import("./CallsContent").then((module) => ({ default: module.PhoneNumberContent }))
);
const RecentCallsContent = lazy(() =>
  import("./CallsContent").then((module) => ({ default: module.RecentCallsContent }))
);

/**
 * The screen behind the presenter.
 *
 * The number is the headline, displayed large enough for a room to read and
 * dial, with the live state beside it — this page sitting open *is* the
 * telephone demo: the room dials what it can see, then watches the call, the
 * summary and the follow-up land beneath. Everything updates live because the
 * queries are reactive; nothing polls, nothing needs refreshing.
 *
 * Callers' numbers are masked here. A wall display must never be where a
 * phone number leaks; the full number lives only on the call's own page.
 */
export default function CallsPage() {
  const t = useTranslations("calls");
  const { platformName } = useSystemSettings();
  const number = useQuery(api.telephony.getCompanyPhoneNumber, {});
  const calls = useQuery(api.telephony.listCalls, {});

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Phone className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t("subtitle", { platformName })}</p>
        </div>

        <section className="rounded-2xl border border-border-dim bg-sidebar/30 px-8 py-10 text-center">
          {number === undefined ? null : (
            <Suspense fallback={null}>
              <PhoneNumberContent number={number} calls={calls} />
            </Suspense>
          )}
        </section>

        <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
          {t("recent")}
        </h2>

        {calls === undefined ? null : (
          <Suspense fallback={null}>
            <RecentCallsContent calls={calls} />
          </Suspense>
        )}
      </div>
    </>
  );
}
