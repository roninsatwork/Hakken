"use client";

import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { CheckSquare, UserRound } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

type Call = NonNullable<FunctionReturnType<typeof api.telephony.getCall>>;

export default function CallDetailContent({
  call,
  backLink,
  heading,
}: {
  call: Call;
  backLink: ReactNode;
  heading: ReactNode;
}) {
  const t = useTranslations("calls");
  const { platformName } = useSystemSettings();

  return (
    <div className="flex flex-col gap-6 pb-8">
      {backLink}
      {heading}

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
                  {turn.role === "CALLER" ? t("caller") : t("hakken", { platformName })}
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
