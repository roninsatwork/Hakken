"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ArrowRight, CircleCheck, MailX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { isChoosable } from "@/convex/utils/communications";
import { Eyebrow, IconDisc, RainSplit, ScreenCopy, ScreenTitle } from "@/src/ui/components/public/RainSplit";

/**
 * Where the unsubscribe link in an email leads (docs/plans/active/knowledge-
 * news-and-digest-plan.md, phase 8; outbox-and-preferences-plan.md, B1): each
 * email a person may opt out of names its own type. Nobody need be signed
 * in: the link's token is the proof. It turns that type off only when the
 * button is pressed, never on arrival — company mail systems open links
 * before their readers do, as the sign-in link learned (`verify/page.tsx`).
 * A mail client's own one-click unsubscribe goes to the platform directly
 * (`convex/emailHttp.ts`).
 *
 * Its four states — the question, done, the link no longer working, the link
 * incomplete — are drawn on the "Hakken home page" canvas, approved
 * 2026-10-29 (before-sign-in-plan.md; unsubscribeLook.test holds them).
 */
export default function UnsubscribePage() {
  const t = useTranslations("unsubscribe");
  const tKinds = useTranslations("communications");
  const tLanding = useTranslations("landing");
  const { platformName } = useSystemSettings();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  // Which type of email the link stops (outbox-and-preferences-plan.md, B1); a link from before the types stops the digest.
  const asked = params.get("kind") ?? "WEEKLY_NEWS_DIGEST";
  const kindKey = isChoosable(asked) ? asked : "WEEKLY_NEWS_DIGEST";
  const kind = tKinds(`${kindKey}.name`, { platformName });
  const unsubscribe = useMutation(api.readerPreferences.unsubscribeWithToken);
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  const stop = async () => {
    if (!token || state === "working") return;
    setState("working");
    try {
      setState((await unsubscribe({ token, kind: kindKey })) ? "done" : "failed");
    } catch {
      setState("failed");
    }
  };

  const heading = !token ? t("incompleteTitle") : state === "done" ? t("doneTitle") : state === "failed" ? t("failedTitle") : t("title", { kind });
  const body = !token ? t("incompleteBody") : state === "done" ? t("doneBody", { kind }) : state === "failed" ? t("failedBody", { kind }) : t("body", { kind });
  const copyright = tLanding("copyright", { year: new Date().getFullYear() });

  return (
    <RainSplit name="unsubscribe" width="narrow" copyright={copyright}>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <IconDisc tone={state === "done" ? "success" : "brand"}>
        {state === "done" ? <CircleCheck className="h-[22px] w-[22px]" /> : <MailX className="h-5 w-5" />}
      </IconDisc>
      <ScreenTitle>{heading}</ScreenTitle>
      <ScreenCopy>{body}</ScreenCopy>
      {token && (state === "idle" || state === "working") ? (
        <Button
          variant="primary"
          onClick={() => void stop()}
          data-part="primary-action"
          disabled={state === "working"}
          className="flex w-max items-center gap-2.5 px-[22px] py-[13px] text-[15px]"
        >
          <span>{state === "working" ? t("working") : t("stop")}</span>
          {state === "working" ? null : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
        </Button>
      ) : null}
    </RainSplit>
  );
}
