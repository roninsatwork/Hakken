"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { AiSystemEntry, AiSystemRisk } from "@/convex/governanceRegisterService";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { Button } from "@/src/ui/components/screens/Button";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { Select } from "@/src/ui/components/screens/Select";

/**
 * Closing a gap where you found it.
 *
 * The register was very good at telling you something was missing and no help
 * at all in fixing it: every row that said "nobody is accountable for this"
 * meant a trip to another screen to say who was. A list of complaints you
 * cannot action gets read once and then ignored, which is the failure mode of
 * every compliance register that has ever gone stale.
 *
 * Only assistants can be edited here, and the panel says so for the rest rather
 * than showing fields that do nothing. A widget has no rating and no owner of
 * its own on the record — it inherits both from the assistant behind it — and
 * offering boxes that quietly discard what you type would be worse than
 * offering none.
 *
 * Saves through the ordinary assistant update, which already writes a rating
 * change to the audit trail. A second path that wrote the same field without
 * that record would be a way to change a risk rating unobserved.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const RATINGS: AiSystemRisk[] = ["LOW", "MEDIUM", "HIGH"];

type RegisterEntryPanelProps = {
  entry: AiSystemEntry | null;
  onClose: () => void;
};

export function RegisterEntryPanel({ entry, onClose }: RegisterEntryPanelProps) {
  const t = useTranslations("admin.governance.register.panel");
  const tRegister = useTranslations("admin.governance.register");
  const canWrite = useCanWriteHere();

  const users = useQuery(
    api.governanceRegister.getOwnerCandidates,
    entry?.kind === "ASSISTANT" ? {} : "skip",
  );
  const updateAgent = useMutation(api.agents.updateAgent);

  const [purpose, setPurpose] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [risk, setRisk] = useState<AiSystemRisk | "">("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  // Reset to whatever the record says whenever a different row is opened, so a
  // half-typed purpose cannot follow the reader onto the next system.
  useEffect(() => {
    setPurpose(entry?.purpose ?? "");
    setOwnerId("");
    setRisk(entry && entry.risk !== "UNRATED" ? entry.risk : "");
    setError("");
  }, [entry]);

  if (!entry) return null;

  const editable = entry.kind === "ASSISTANT";
  const dirty =
    purpose.trim() !== (entry.purpose ?? "").trim() ||
    ownerId !== "" ||
    (risk !== "" && risk !== entry.risk);

  const handleSave = async () => {
    if (!dirty || isSaving) return;

    setIsSaving(true);
    setError("");

    try {
      await updateAgent({
        id: entry.id as Id<"agents">,
        // Only what actually changed. Sending every field would rewrite the
        // record on every save and fill the audit trail with changes nobody made.
        ...(purpose.trim() !== (entry.purpose ?? "").trim() ? { description: purpose.trim() } : {}),
        ...(ownerId ? { ownerId: ownerId as Id<"users"> } : {}),
        ...(risk !== "" && risk !== entry.risk ? { riskLevel: risk as "LOW" | "MEDIUM" | "HIGH" } : {}),
      });

      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SonaeModal isOpen onClose={onClose} title={entry.name}>
      <p className="mb-5 text-[12px] text-muted">
        {[
          tRegister(`kind.${entry.kind}`),
          entry.model,
          typeof entry.activity === "number" ? t("runs", { count: entry.activity }) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {!editable ? (
        <p className="rounded-[10px] border border-border-dim bg-sidebar/40 p-4 text-[13px] text-secondary">
          {t("notEditable")}
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <label className="mb-1.5 block text-[12px] text-secondary" htmlFor="register-purpose">
              {t("purposeLabel")}
            </label>
            <textarea
              id="register-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              disabled={!canWrite}
              rows={3}
              placeholder={t("purposePlaceholder")}
              className={`w-full rounded-[10px] border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand/50 disabled:opacity-60 ${
                purpose.trim() ? "border-border-dim" : "border-[#fbbf24]/40"
              }`}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[12px] text-secondary" htmlFor="register-owner">
              {t("ownerLabel")}
            </label>
            <Select
              id="register-owner"
              value={ownerId}
              onChange={setOwnerId}
              disabled={!canWrite || users === undefined}
              className="w-full"
              selectClassName={entry.ownerName || ownerId ? "" : "!border-[#fbbf24]/40"}
            >
              <option value="">
                {/* Naming who holds it now rather than a blank, so choosing
                    nothing is visibly "leave it as it is" rather than "clear it". */}
                {entry.ownerName ? t("ownerKeep", { name: entry.ownerName }) : t("ownerNone")}
              </option>
              {(users ?? []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </Select>
            {users !== undefined && users.length === 0 ? (
              /* An empty picker with no explanation reads as a broken screen.
                 If there is genuinely nobody who could be named, say so. */
              <p className="mt-1.5 text-[12px] text-muted">{t("ownerEmpty")}</p>
            ) : null}
          </div>

          <div>
            <p className="mb-1.5 text-[12px] text-secondary">{t("riskLabel")}</p>
            <div className="flex flex-wrap gap-2">
              {RATINGS.map((option) => {
                const selected = (risk || entry.risk) === option;

                return (
                  // Stays raw: an aria-pressed rating chip whose border swaps with selection — matches no variant.
                  <button
                    key={option}
                    type="button"
                    onClick={() => setRisk(option)}
                    disabled={!canWrite}
                    aria-pressed={selected}
                    className={`rounded-full border px-4 py-1.5 text-[12px] transition-colors disabled:opacity-60 ${
                      selected
                        ? "border-foreground/40 text-foreground"
                        : "border-border-dim text-secondary hover:border-foreground/20"
                    }`}
                  >
                    {tRegister(`risk.${option}`)}
                  </button>
                );
              })}
            </div>
            {entry.risk === "UNRATED" ? (
              <p className="mt-2 flex items-start gap-1.5 text-[12px] text-[#b45309] dark:text-[#fbbf24]">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {t("riskUnset")}
              </p>
            ) : null}
          </div>

          {error ? <p className="text-[12px] text-[#b45309] dark:text-[#fbbf24]">{error}</p> : null}

          <div className="flex items-center justify-between gap-3 border-t border-border-dim pt-4">
            <p className="text-[11px] text-muted">{t("recorded")}</p>

            {canWrite ? (
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={!dirty || isSaving}
                className="flex items-center gap-2 px-4 py-2 text-[13px] shadow-none disabled:opacity-40"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {t("save")}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </SonaeModal>
  );
}
