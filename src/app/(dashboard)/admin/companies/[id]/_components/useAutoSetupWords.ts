"use client";

import { useTranslations } from "next-intl";
import { readSource } from "@/convex/utils/autoSetupAgent";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

/**
 * How a box Auto Setup wrote says so (docs/plans/active/auto-setup-plan.md,
 * AS5), in the screen's language: what it was written from — "from
 * nec.ac.uk's pages", "rivals rank for it: …" — under a search or question
 * ("Written by Hakken · …") or under a box ("Hakken wrote this … Change it any
 * time."), in the words Auto Classify's description already uses. Null for a
 * box a person wrote. Shared by the company's Overview and Websites screens.
 */
export function useAutoSetupWords() {
  const t = useTranslations("admin.autoSetup");
  const { platformName } = useSystemSettings();

  const from = (code: string | null | undefined): string | null => {
    const source = readSource(code);
    if (!source) return null;
    if (source.kind === "RIVALS") {
      const shown = source.hosts.slice(0, 2).join(", ");
      const more = source.hosts.length - 2;
      return more > 0 ? t("from.RIVALS_MORE", { hosts: shown, more }) : t("from.RIVALS", { hosts: shown });
    }
    return t(`from.${source.kind}`, { host: source.hosts[0] ?? "" });
  };

  const said = (key: "writtenLine" | "wroteThis" | "wroteThese") => (code: string | null | undefined): string | null => {
    const what = from(code);
    return what ? t(key, { platformName, from: what }) : null;
  };

  return { from, line: said("writtenLine"), wroteThis: said("wroteThis"), wroteThese: said("wroteThese") };
}
