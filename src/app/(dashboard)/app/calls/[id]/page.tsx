"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { ArrowLeft, CheckSquare, Phone, UserRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";

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
      <div className="flex flex-col gap-6 pb-8">
        <BackLink label={t("back")} />

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

        {(call.matchedCustomerKey || call.taskId) && (
          <div className="flex flex-wrap gap-3">
            {call.matchedCustomerKey && (
              <span className="inline-flex items-center gap-2 rounded-full border border-border-dim px-4 py-1.5 text-[12px] text-foreground">
                <UserRound aria-hidden className="w-3.5 h-3.5 text-brand" />
                {/* One flex item, not three: the label, the colon and the value are
                    one sentence, and as separate children the row's `gap` pushes the
                    colon away from the word it belongs to. */}
                <span>{t("matchedCustomer")}: {call.matchedCustomerKey}</span>
              </span>
            )}
            {call.taskId && (
              <Link
                href="/app/tasks"
                className="inline-flex items-center gap-2 rounded-full border border-border-dim px-4 py-1.5 text-[12px] text-foreground transition-colors hover:border-border"
              >
                <CheckSquare aria-hidden className="w-3.5 h-3.5 text-brand" />
                {t("openTask")}
              </Link>
            )}
          </div>
        )}

        {call.summary && (
          <section className="rounded-[12px] border border-border-dim bg-sidebar/30 px-5 py-4">
            <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
              {t("summary")}
            </h2>
            <p className="mt-2 text-[14px] leading-relaxed text-foreground">{call.summary}</p>
          </section>
        )}

        <section>
          <h2 className="text-[12px] font-medium uppercase tracking-[0.2em] text-secondary">
            {t("transcript")}
          </h2>
          {call.turns.length === 0 ? (
            <p className="mt-3 text-[13px] text-secondary">{t("noTranscript")}</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-3">
              {call.turns.map((turn, index) => (
                <li
                  key={index}
                  className={`max-w-[85%] rounded-[12px] px-4 py-3 text-[14px] leading-relaxed ${
                    turn.role === "CALLER"
                      ? "self-start border border-border-dim text-foreground"
                      : "self-end bg-foreground/[0.06] text-foreground"
                  }`}
                >
                  <p className="mb-1 text-[11px] uppercase tracking-widest text-secondary">
                    {turn.role === "CALLER" ? t("caller") : t("sonae")}
                  </p>
                  {turn.text}
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
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
