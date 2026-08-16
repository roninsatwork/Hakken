"use client";

import { use } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { ArrowLeft, CheckSquare, Phone, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * One call, in full, from the admin's seat (seven-gaps plan, phase 1).
 * Mirrors the tenant call page: this is the only admin surface where the
 * caller's whole number appears — the list carries the masked form.
 */
export default function AdminCallDetailPage({
  params,
}: {
  params: Promise<{ id: string; callId: string }>;
}) {
  const { id, callId } = use(params);
  const companyId = id as Id<"companies">;
  const t = useTranslations("calls");
  const call = useQuery(api.telephony.getCallForCompany, { companyId, callId });

  if (call === undefined) return <div />;

  if (call === null) {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <BackLink label={t("back")} />
        <p className="text-[13px] text-secondary">{t("notFound")}</p>
      </div>
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
              {t("matchedCustomer")}: {call.matchedCustomerKey}
            </span>
          )}
          {call.taskId && (
            <span className="inline-flex items-center gap-2 rounded-full border border-border-dim px-4 py-1.5 text-[12px] text-foreground">
              <CheckSquare aria-hidden className="w-3.5 h-3.5 text-brand" />
              {t("followUpTask")}
            </span>
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
  );
}

function BackLink({ label }: { label: string }) {
  const params = useParams();
  return (
    <Link
      href={`/admin/companies/${params.id}/calls`}
      className="inline-flex w-fit items-center gap-2 text-[13px] text-secondary transition-colors hover:text-foreground"
    >
      <ArrowLeft aria-hidden className="w-4 h-4" />
      {label}
    </Link>
  );
}
