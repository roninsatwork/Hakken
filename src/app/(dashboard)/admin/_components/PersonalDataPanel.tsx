"use client";

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { Download, Loader2, Trash2, UserSearch } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { getErrorMessage } from "@/src/lib/errors";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import { SaveError } from "@/src/ui/components/screens/SaveControls";

/**
 * Answering the two questions a person can ask about their own data.
 *
 * Reading is open to anyone who can read the governance surfaces, including an
 * auditor — answering a subject access request is exactly their job. Erasing is
 * not: it is irreversible and destroys records, so it stays with a platform
 * administrator and asks for confirmation naming the person first.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export function PersonalDataPanel() {
  const t = useTranslations("admin.governance.personalData");
  const me = useQuery(api.users.getMe);
  const produce = useAction(api.personalData.produceSubjectAccess);
  const erase = useAction(api.personalData.erase);

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"none" | "reading" | "erasing">("none");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const canErase = me?.role === "SUPER_ADMIN";

  const handleRead = async () => {
    if (!email.trim() || busy !== "none") return;
    setBusy("reading");
    setError("");
    setSummary([]);

    try {
      const result = await produce({ email: email.trim() });
      const document = JSON.stringify(result, null, 2);
      const url = URL.createObjectURL(new Blob([document], { type: "application/json" }));
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `personal-data-${result.person.email}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(getErrorMessage(caught, t("readFailed")));
    } finally {
      setBusy("none");
    }
  };

  const handleErase = async () => {
    setBusy("erasing");
    setError("");

    try {
      const result = await erase({ email: email.trim() });
      // The summary is the answer to give a regulator, so it stays on screen
      // rather than flashing past in a toast.
      setSummary(result.summary);
      setConfirming(false);
      setEmail("");
    } catch (caught) {
      setError(getErrorMessage(caught, t("eraseFailed")));
      setConfirming(false);
    } finally {
      setBusy("none");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-sidebar/40 p-5">
      <div>
        <p className="text-[14px] font-medium text-foreground">{t("title")}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-secondary">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t("emailPlaceholder")}
          className="h-[38px] min-w-[240px] flex-1 rounded-[10px] border border-border-dim bg-background px-3 text-[13px] text-foreground outline-none focus:border-brand/50"
        />

        <button
          type="button"
          onClick={handleRead}
          disabled={busy !== "none" || !email.trim()}
          className="flex items-center gap-2 rounded-[10px] border border-border-dim px-4 py-2 text-[13px] font-medium text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
        >
          {busy === "reading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserSearch className="h-4 w-4" aria-hidden="true" />
          )}
          {t("read")}
        </button>

        {canErase ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={busy !== "none" || !email.trim()}
            className="flex items-center gap-2 rounded-[10px] bg-rose-500/90 px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {t("erase")}
          </button>
        ) : null}
      </div>

      <SaveError>{error}</SaveError>

      {summary.length > 0 ? (
        <div className="rounded-[10px] border border-border-dim bg-background/60 p-4">
          <p className="text-[13px] font-medium text-foreground">{t("done")}</p>
          <ul className="mt-2 flex flex-col gap-1">
            {summary.map((line) => (
              <li key={line} className="text-[13px] leading-relaxed text-secondary">
                {line}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              const blob = new Blob([summary.join("\n")], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const link = window.document.createElement("a");
              link.href = url;
              link.download = "erasure-record.txt";
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="mt-3 flex items-center gap-2 text-[13px] text-foreground underline underline-offset-4"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t("keepRecord")}
          </button>
        </div>
      ) : null}

      <ConfirmationModal
        isOpen={confirming}
        onClose={() => setConfirming(false)}
        title={t("confirmTitle")}
        cancelLabel={t("cancel")}
        confirmLabel={t("confirmErase")}
        isSubmitting={busy === "erasing"}
        onConfirm={handleErase}
        warning={{ title: t("confirmWarningTitle"), description: t("confirmWarning") }}
      >
        {t("confirmBody", { email: email.trim() })}
      </ConfirmationModal>
    </div>
  );
}
