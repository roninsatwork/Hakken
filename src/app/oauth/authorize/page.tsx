"use client";

import { useEffect, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useAction, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ArrowRight, Check, Loader2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CHAT_APP_MAKERS, returnAddressWith } from "@/convex/utils/chatApps";
import { Button } from "@/src/ui/components/screens/Button";
import { Select } from "@/src/ui/components/screens/Select";
import { Eyebrow, RainSplit, ScreenCopy, ScreenTitle } from "@/src/ui/components/public/RainSplit";

/** The signed-in person's initials, as the top bar draws them. */
function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

type Described = FunctionReturnType<typeof api.chatAppPasses.describeAllowRequest>;
type Ready = Extract<Described, { ok: true }>;

/**
 * The Allow page (docs/plans/active/ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * board 1): ChatGPT or Claude sends a signed-in person here to ask for their
 * company's figures. It says which app is asking, what it can and can't read,
 * where the figures go and where the person goes back to. Allow sends them back
 * with a one-use code; Cancel sends them back with a refusal. A page, never a
 * pop-up, and it only ever sends a person back to an address the app registered.
 */
export default function AllowPage() {
  const t = useTranslations("chatApps.allow");
  const tLanding = useTranslations("landing");
  const params = useSearchParams();
  const router = useRouter();
  const describe = useAction(api.chatAppPasses.describeAllowRequest);
  const allow = useMutation(api.chatAppPasses.allow);
  const { signOut } = useAuthActions();
  const [described, setDescribed] = useState<Described | "broken" | null>(null);
  const [companyId, setCompanyId] = useState<Id<"companies"> | "">("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const asked = useRef(false);

  const request = {
    clientId: params.get("client_id") ?? "",
    redirectUri: params.get("redirect_uri") ?? "",
    responseType: params.get("response_type") ?? "",
    codeChallenge: params.get("code_challenge") ?? "",
    codeChallengeMethod: params.get("code_challenge_method") ?? "",
    ...(params.get("resource") ? { resource: params.get("resource") as string } : {}),
    ...(params.get("state") ? { state: params.get("state") as string } : {}),
  };

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    describe(request)
      .then((answer) => {
        setDescribed(answer);
        if (answer.ok) setCompanyId(answer.person.company?.id ?? answer.person.companies[0]?.id ?? "");
      })
      .catch(() => setDescribed("broken"));
    // The request is the page's address: asked once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const copyright = tLanding("copyright", { year: new Date().getFullYear() });
  const frame = (children: React.ReactNode) => (
    <RainSplit name="allow" width="narrow" copyright={copyright}>
      {children}
    </RainSplit>
  );
  const stop = (title: string, body: string) => frame(
    <>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <ScreenTitle>{title}</ScreenTitle>
      <ScreenCopy>{body}</ScreenCopy>
    </>,
  );

  if (described === null) {
    return frame(
      <>
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <p className="m-0 flex items-center gap-2 text-[14px] text-secondary"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("checking")}</p>
      </>,
    );
  }
  if (described === "broken") return stop(t("badTitle"), t("badBody"));
  if (!described.ok) return described.reason === "unknownApp" ? stop(t("unknownTitle"), t("unknownBody")) : stop(t("badTitle"), t("badBody"));

  const ready: Ready = described;
  const { person, app, appName, issuer, returnHost } = ready;
  const company = person.superAdmin ? person.companies.find((one) => one.id === companyId) ?? null : person.company;
  if (!company) return stop(t("noCompanyTitle"), t("noCompanyBody"));
  const switchedOff = person.switchedOff.includes(company.id);
  if (switchedOff && !person.superAdmin) return stop(t("offTitle", { app: appName }), t("offBody", { company: company.name }));

  const press = async () => {
    setSending(true);
    setFailed(false);
    try {
      const { returnTo } = await allow({ ...request, ...(person.superAdmin ? { companyId: company.id } : {}) });
      window.location.assign(returnTo);
    } catch {
      setFailed(true);
      setSending(false);
    }
  };
  const cancel = () => {
    window.location.assign(returnAddressWith(request.redirectUri, { error: "access_denied", state: request.state, iss: issuer }));
  };
  const differentEmail = async () => {
    await signOut();
    router.push(`/login?redirectTo=${encodeURIComponent(`${window.location.pathname}${window.location.search}`)}`);
  };

  const bullet = (kind: "can" | "cant", words: string) => (
    <li key={words} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-secondary">
      <span className="mt-0.5">{kind === "can" ? <Check className="h-4 w-4 shrink-0 text-success" aria-hidden="true" /> : <X className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />}</span>
      <span>{words}</span>
    </li>
  );

  return frame(
    <>
      <Eyebrow>{t("eyebrow")}</Eyebrow>
      <ScreenTitle>{t("title", { app: appName })}</ScreenTitle>
      <ScreenCopy>{person.superAdmin ? t("leadPick", { app: appName }) : t("lead", { app: appName, company: company.name })}</ScreenCopy>
      <div className="flex items-center justify-between gap-4 border-y border-border-dim py-3">
        <span className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-[12px] font-medium text-foreground">{initialsOf(person.name)}</span>
          <span className="text-[13px] text-foreground">{t("signedInAs", { name: person.name })}</span>
        </span>
        <Button variant="ghost" data-part="link" onClick={() => void differentEmail()} className="px-0 py-0 text-[13px] hover:bg-transparent">{t("differentEmail")}</Button>
      </div>
      {person.superAdmin ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="allow-company" className="text-[12px] font-medium text-secondary">{t("company")}</label>
          <Select id="allow-company" value={companyId} onChange={(value) => setCompanyId(value as Id<"companies">)} className="w-full">
            {person.companies.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
          </Select>
          {switchedOff ? <p className="m-0 text-[12px] text-warning">{t("offBody", { company: company.name })}</p> : null}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[13px] font-medium text-foreground">{t("canRead", { app: appName })}</h2>
        <ul className="m-0 flex flex-col gap-1.5 p-0">{[t("read1"), t("read2"), t("read3")].map((words) => bullet("can", words))}</ul>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="m-0 text-[13px] font-medium text-foreground">{t("cantDo", { app: appName })}</h2>
        <ul className="m-0 flex flex-col gap-1.5 p-0">{[t("cant1"), t("cant2")].map((words) => bullet("cant", words))}</ul>
      </div>
      <p className="m-0 text-[12px] leading-relaxed text-muted">
        {t("keeps", { app: appName, maker: CHAT_APP_MAKERS[app] })} {t("goesBack", { host: returnHost })}
      </p>
      {failed ? <p className="m-0 text-[13px] text-destructive" role="alert">{t("failed")}</p> : null}
      <div className="flex items-center gap-3">
        <Button
          variant="primary"
          data-part="primary-action"
          disabled={sending || switchedOff}
          onClick={() => void press()}
          className="flex items-center justify-center gap-2.5 px-[22px] py-[13px] text-[15px]"
        >
          {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <><span>{t("allow")}</span><ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
        </Button>
        <Button variant="ghost" onClick={cancel} disabled={sending}>{t("cancel")}</Button>
      </div>
    </>,
  );
}
