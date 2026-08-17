"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { CircleDollarSign, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { AiWorkspaceNav } from "@/src/app/(dashboard)/admin/ai/_components/AiWorkspaceNav";

/**
 * The money view (Anthony's pick, 2026-08-17): what the AI handled this
 * month and roughly what that is worth in a person's time. Every tile is
 * a count of real recorded events; the minutes assumption is on the
 * screen and editable — never hidden maths. Mounted at two heights.
 */
export function MoneyViewScreen({
  companyId,
  showWorkspaceNav,
}: {
  companyId?: Id<"companies">;
  showWorkspaceNav?: boolean;
}) {
  const t = useTranslations("aiMoney");
  const companyView = useQuery(
    api.moneyView.getMoneyViewForCompany,
    companyId ? { companyId } : "skip"
  );
  const globalView = useQuery(api.moneyView.getMoneyViewForGlobal, companyId ? "skip" : {});
  const view = companyId ? companyView : globalView;

  const setCompany = useMutation(api.moneyView.setAssumptionsForCompany);
  const setGlobal = useMutation(api.moneyView.setAssumptionsForGlobal);

  const [isEditingAssumptions, setIsEditingAssumptions] = useState(false);
  const [perConversation, setPerConversation] = useState<string | null>(null);
  const [perCall, setPerCall] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (view === undefined) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-brand" />
      </div>
    );
  }

  const tiles = [
    { label: t("tiles.answered"), value: view.answered, detail: t("tiles.answeredDetail") },
    { label: t("tiles.calls"), value: view.calls, detail: t("tiles.callsDetail") },
    { label: t("tiles.widget"), value: view.widgetConversations, detail: t("tiles.widgetDetail") },
    { label: t("tiles.unanswered"), value: view.unanswered, detail: t("tiles.unansweredDetail") },
  ];

  const saveAssumptions = async () => {
    const conversationMinutes = Number(perConversation ?? view.minutesPerConversation);
    const callMinutes = Number(perCall ?? view.minutesPerCall);
    if (!Number.isFinite(conversationMinutes) || !Number.isFinite(callMinutes)) return;
    setIsSaving(true);
    try {
      if (companyId) {
        await setCompany({
          companyId,
          minutesPerConversation: conversationMinutes,
          minutesPerCall: callMinutes,
        });
      } else {
        await setGlobal({
          minutesPerConversation: conversationMinutes,
          minutesPerCall: callMinutes,
        });
      }
      setIsEditingAssumptions(false);
      setPerConversation(null);
      setPerCall(null);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-12 w-full">
      <PageHeader
        icon={<CircleDollarSign className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={companyId ? t("subtitleCompany") : t("subtitleGlobal")}
        divider
      />

      {showWorkspaceNav && <AiWorkspaceNav />}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="rounded-[14px] border border-border-dim bg-sidebar px-5 py-4"
          >
            <p className="text-[10.5px] uppercase tracking-[0.12em] text-muted font-medium">
              {tile.label}
            </p>
            <p className="text-[26px] font-bold tracking-tight tabular-nums mt-1">{tile.value}</p>
            <p className="text-[11.5px] text-muted mt-0.5">{tile.detail}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap rounded-[14px] border border-brand/30 bg-brand/5 px-5 py-4">
        <div>
          <p className="text-[19px] font-bold tracking-tight">
            {t("worth", { hours: view.hours })}
          </p>
          <p className="text-[12px] text-secondary mt-0.5">
            {t("worthDetail", { answered: view.answered, calls: view.calls })}
          </p>
        </div>
        {isEditingAssumptions ? (
          <span className="flex items-center gap-2 text-[12.5px] text-secondary flex-wrap">
            {/* Left hand-written on purpose, and frozen with that reason: these
                two sit inside a sentence, and each is already labelled by the
                words around it through its wrapping label. The house field
                stacks a label above a full-width box, which would break the
                sentence into three lines to say the same thing. */}
            <label className="flex items-center gap-1.5">
              {t("assumptions.perConversation")}
              <input
                type="number"
                min={1}
                max={120}
                value={perConversation ?? String(view.minutesPerConversation)}
                onChange={(event) => setPerConversation(event.target.value)}
                className="w-16 bg-background border border-border-dim rounded-[8px] px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50"
              />
            </label>
            <label className="flex items-center gap-1.5">
              {t("assumptions.perCall")}
              <input
                type="number"
                min={1}
                max={120}
                value={perCall ?? String(view.minutesPerCall)}
                onChange={(event) => setPerCall(event.target.value)}
                className="w-16 bg-background border border-border-dim rounded-[8px] px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:border-brand/50"
              />
            </label>
            <WriteButton
              onClick={() => void saveAssumptions()}
              disabled={isSaving}
              className="px-3.5 py-1.5 rounded-[9px] bg-brand text-white text-[12px] font-medium disabled:opacity-40"
            >
              {isSaving ? t("assumptions.saving") : t("assumptions.save")}
            </WriteButton>
            <button
              type="button"
              onClick={() => {
                setIsEditingAssumptions(false);
                setPerConversation(null);
                setPerCall(null);
              }}
              className="text-[12px] text-secondary hover:text-foreground transition-colors"
            >
              {t("assumptions.cancel")}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setIsEditingAssumptions(true)}
            className="text-[12px] text-secondary border border-border-dim rounded-[10px] px-3.5 py-2 hover:text-foreground transition-colors"
          >
            {t("assumptions.summary", {
              perConversation: view.minutesPerConversation,
              perCall: view.minutesPerCall,
            })}
          </button>
        )}
      </div>

      <p className="text-[12.5px] text-muted max-w-2xl">{t("honesty")}</p>
    </div>
  );
}
