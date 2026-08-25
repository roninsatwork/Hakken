"use client";

import { useState } from "react";
import { useAction } from "convex/react";
import { Download, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { Select } from "@/src/ui/components/screens/Select";
import { getErrorMessage } from "@/src/lib/errors";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { buildEvidencePackDocument } from "@/src/lib/evidencePackDocument";

const DAY_MS = 24 * 60 * 60 * 1000;
const PERIODS = [7, 30, 90, 365] as const;

/**
 * Taking a copy of the evidence.
 *
 * The same panel on both surfaces: the platform view exports every client, a
 * workspace exports its own. Which one you get is decided by the backend from
 * who is asking, not by anything this screen sends — proving a customer's pack
 * holds their records and nobody else's is the part that actually matters, and
 * it should not depend on a screen passing the right argument.
 *
 * Downloads rather than renders. An auditor asks for something they can keep,
 * attach to a report and read six months from now, which a screen is not.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export function EvidencePackPanel() {
  const t = useTranslations("admin.governance.evidence");
  const produce = useAction(api.evidencePack.produce);

  const [days, setDays] = useState<number>(30);
  const [isProducing, setIsProducing] = useState(false);
  const [error, setError] = useState("");

  const handleProduce = async () => {
    if (isProducing) return;
    setIsProducing(true);
    setError("");

    try {
      const to = Date.now();
      const from = to - days * DAY_MS;
      const pack = await produce({ from, to });

      const document = buildEvidencePackDocument({
        pack,
        from,
        to,
        labels: {
          title: t("document.title"),
          period: t("document.period"),
          scopePlatform: t("document.scopePlatform"),
          scopeWorkspace: t("document.scopeWorkspace"),
          systems: t("document.systems"),
          runs: t("document.runs"),
          decisions: t("document.decisions"),
          policies: t("document.policies"),
          models: t("document.models"),
          none: t("document.none"),
          notRated: t("document.notRated"),
          noOwner: t("document.noOwner"),
        },
      });

      // A plain file the reader keeps. Built in the browser from what the
      // backend returned, so nothing is stored server-side that would then need
      // its own retention rule.
      const url = URL.createObjectURL(new Blob([document], { type: "text/markdown" }));
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `evidence-pack-${new Date(to).toISOString().slice(0, 10)}.md`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(getErrorMessage(caught, t("failed")));
    } finally {
      setIsProducing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-[16px] border border-border-dim bg-sidebar/40 p-5">
      <div>
        <p className="text-[14px] font-medium text-foreground">{t("title")}</p>
        <p className="mt-1 text-[13px] leading-relaxed text-secondary">{t("description")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-[13px] text-secondary" htmlFor="evidence-period">
          {t("periodLabel")}
        </label>
        <Select
          id="evidence-period"
          value={days}
          onChange={(next) => setDays(Number(next))}
          className="w-[180px]"
        >
          {PERIODS.map((period) => (
            <option key={period} value={period}>
              {t(`periods.${period}`)}
            </option>
          ))}
        </Select>

        {/*
          An ordinary button rather than WriteButton: an auditor cannot
          write anywhere and must still be able to take this. The export records
          that it happened, but the person exporting changes nothing.
        */}
        <Button
          variant="primary"
          onClick={handleProduce}
          disabled={isProducing}
          className="flex items-center gap-2 px-4 py-2 text-[13px] shadow-none"
        >
          {isProducing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {isProducing ? t("producing") : t("produce")}
        </Button>
      </div>

      <SaveError>{error}</SaveError>
    </div>
  );
}
