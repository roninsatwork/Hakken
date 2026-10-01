"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { MailX } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Button } from "@/src/ui/components/screens/Button";

/**
 * Where the unsubscribe link in the Weekly News Digest leads (docs/plans/
 * active/knowledge-news-and-digest-plan.md, phase 8). Nobody need be signed
 * in: the link's token is the proof. It turns the digest off only when the
 * button is pressed, never on arrival — company mail systems open links
 * before their readers do, as the sign-in link learned (`verify/page.tsx`).
 * A mail client's own one-click unsubscribe goes to the platform directly
 * (`convex/emailHttp.ts`).
 */
export default function UnsubscribePage() {
  const t = useTranslations("unsubscribe");
  const token = useSearchParams().get("token") ?? "";
  const unsubscribe = useMutation(api.readerPreferences.unsubscribeWithToken);
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  const stop = async () => {
    if (!token || state === "working") return;
    setState("working");
    try {
      setState((await unsubscribe({ token })) ? "done" : "failed");
    } catch {
      setState("failed");
    }
  };

  const heading = !token ? t("incompleteTitle") : state === "done" ? t("doneTitle") : state === "failed" ? t("failedTitle") : t("title");
  const body = !token ? t("incompleteBody") : state === "done" ? t("doneBody") : state === "failed" ? t("failedBody") : t("body");

  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
        <MailX className="h-5 w-5 text-brand" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-foreground">{heading}</h1>
        <p className="text-sm text-secondary">{body}</p>
      </div>
      {token && (state === "idle" || state === "working") ? (
        <Button variant="brand" onClick={() => void stop()} disabled={state === "working"}>
          {state === "working" ? t("working") : t("stop")}
        </Button>
      ) : null}
    </div>
  );
}
