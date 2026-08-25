"use client";

import { lazy, Suspense, use } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, Phone } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";

const CallDetailContent = lazy(() => import("./CallDetailContent"));

/**
 * One call, in full.
 *
 * This is the only place the caller's whole number appears — the list and
 * the follow-up task both carry the masked form. The transcript reads as a
 * conversation, the summary sits above it, and the customer and task the
 * finale attached are one click each.
 */
export default function CallDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations("calls");
  const call = useQuery(api.telephony.getCall, { callId: id });

  if (call === undefined) {
    return (
      <>
        <Header />
        <div />
      </>
    );
  }

  if (call === null) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-4 pb-8">
          <BackLink label={t("back")} />
          <p className="text-[13px] text-secondary">{t("notFound")}</p>
        </div>
      </>
    );
  }

  const when = (timestamp: number) =>
    new Date(timestamp).toLocaleString([], {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <>
      <Header />
      <Suspense fallback={<div />}>
        <CallDetailContent
          call={call}
          backLink={<BackLink label={t("back")} />}
          heading={(
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                <Phone className="w-6 h-6 text-brand" />
                <span className="font-mono">{call.fromNumber}</span>
              </h1>
              <p className="text-[13px] text-secondary mt-1">
                {t("started")} {when(call.startedAt)}
                {call.endedAt ? ` · ${t("ended")} ${when(call.endedAt)}` : ""} ·{" "}
                {t(`status.${call.status}`)}
              </p>
            </div>
          )}
        />
      </Suspense>
    </>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/app/calls"
      className="inline-flex w-fit items-center gap-2 text-[13px] text-secondary transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="w-4 h-4" />
      {label}
    </Link>
  );
}
