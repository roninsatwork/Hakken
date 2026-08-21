"use client";

import { useQuery } from "convex/react";
import { Phone, PhoneCall } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatPhoneNumberForDisplay } from "@/convex/telephonyService";
import Header from "@/src/ui/components/layout/Header";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

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

  const liveCall = calls?.find(
    (call) => call.status === "RINGING" || call.status === "IN_PROGRESS"
  );

  // Blue/amber, never green-vs-red: the states must survive red-green colour
  // blindness, and each carries its written label regardless.
  const statusStyles: Record<string, string> = {
    RINGING: "bg-amber-500/15 text-amber-500",
    IN_PROGRESS: "bg-blue-500/15 text-blue-400",
    COMPLETED: "bg-foreground/10 text-secondary",
    FAILED: "bg-foreground/5 text-secondary/70",
  };

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
          {number === undefined ? null : number ? (
            <>
              <p className="text-[12px] uppercase tracking-[0.2em] text-secondary">
                {t("dialUs")}
              </p>
              <p className="mt-3 font-mono text-5xl font-semibold tracking-tight text-foreground sm:text-7xl">
                {formatPhoneNumberForDisplay(number)}
              </p>
              <p className="mt-5 inline-flex items-center gap-2 text-[13px] text-secondary">
                {liveCall ? (
                  <>
                    <PhoneCall aria-hidden className="w-4 h-4 animate-pulse text-blue-400" />
                    {t("live")}
                  </>
                ) : (
                  <>
                    <Phone aria-hidden className="w-4 h-4" />
                    {t("idle")}
                  </>
                )}
              </p>
            </>
          ) : (
            <p className="text-[13px] text-secondary">{t("noNumber")}</p>
          )}
        </section>

        <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
          {t("recent")}
        </h2>

        {calls === undefined ? null : calls.length === 0 ? (
          <SonaeEmptyState icon={Phone} title={t("title")} description={t("empty")} />
        ) : (
          <ul className="flex flex-col gap-3">
            {calls.map((call) => (
              <li key={call._id}>
                <Link
                  href={`/app/calls/${call._id}`}
                  className="flex items-center justify-between gap-4 rounded-[12px] border border-border-dim px-5 py-4 transition-colors hover:border-border"
                >
                  <div className="min-w-0">
                    <p className="font-mono text-[13px] text-foreground">{call.fromMasked}</p>
                    <p className="mt-1 truncate text-[13px] text-secondary">
                      {call.summary ?? t("turns", { count: call.turnCount })}
                      {call.matchedCustomerKey ? ` · ${call.matchedCustomerKey}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span
                      className={`rounded-full px-3 py-1 text-[11px] font-medium ${statusStyles[call.status]}`}
                    >
                      {t(`status.${call.status}`)}
                    </span>
                    <time className="text-[11px] tabular-nums text-secondary/80">
                      {new Date(call.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
