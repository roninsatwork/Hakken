"use client";

import type { FunctionReturnType } from "convex/server";
import { Phone, PhoneCall } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { formatPhoneNumberForDisplay } from "@/convex/telephonyService";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";

type CompanyPhoneNumber = FunctionReturnType<typeof api.telephony.getCompanyPhoneNumber>;
type Calls = FunctionReturnType<typeof api.telephony.listCalls>;

export function PhoneNumberContent({
  number,
  calls,
}: {
  number: CompanyPhoneNumber;
  calls: Calls | undefined;
}) {
  const t = useTranslations("calls");
  const hasLiveCall = calls?.some(
    (call) => call.status === "RINGING" || call.status === "IN_PROGRESS"
  );

  if (!number) {
    return <p className="text-[13px] text-secondary">{t("noNumber")}</p>;
  }

  return (
    <>
      <p className="text-[12px] uppercase tracking-[0.2em] text-secondary">
        {t("dialUs")}
      </p>
      <p className="mt-3 font-mono text-5xl font-semibold tracking-tight text-foreground sm:text-7xl">
        {formatPhoneNumberForDisplay(number)}
      </p>
      <p className="mt-5 inline-flex items-center gap-2 text-[13px] text-secondary">
        {hasLiveCall ? (
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
  );
}

// Blue/amber, never green-vs-red: the states must survive red-green colour
// blindness, and each carries its written label regardless.
const statusStyles: Record<string, string> = {
  RINGING: "bg-amber-500/15 text-amber-500",
  IN_PROGRESS: "bg-blue-500/15 text-blue-400",
  COMPLETED: "bg-foreground/10 text-secondary",
  FAILED: "bg-foreground/5 text-secondary/70",
};

export function RecentCallsContent({ calls }: { calls: Calls }) {
  const t = useTranslations("calls");

  if (calls.length === 0) {
    return <HakkenEmptyState icon={Phone} title={t("title")} description={t("empty")} />;
  }

  return (
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
  );
}
