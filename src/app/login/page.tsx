"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { ArrowRight, CircleCheck, KeyRound, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSearchParams } from "next/navigation";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { describeVerdict, normaliseCode } from "@/convex/oneTimeCodeService";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { CodeBoxes } from "@/src/ui/components/public/CodeBoxes";
import { Eyebrow, IconDisc, RainSplit, ScreenCopy, ScreenTitle } from "@/src/ui/components/public/RainSplit";

/**
 * Sign in, in four states, as drawn on the "Hakken home page" canvas and
 * approved 2026-10-29 (docs/plans/active/before-sign-in-plan.md; loginLook.test
 * holds each): the email form, the six-digit code, the code refused, and the
 * link sent. The ways in and what the screen says about them are unchanged
 * from before the redraw: a link, a typed code, or Google, with nothing said
 * that would confirm which addresses exist.
 */
export default function LoginPage() {
  const t = useTranslations("login");
  const tLanding = useTranslations("landing");
  const { platformName } = useSystemSettings();
  const { signIn } = useAuthActions();
  const searchParams = useSearchParams();
  const redirectTo = sanitizeAuthRedirect(searchParams.get("redirectTo"));
  const recordMagicLinkRequestAttempt = useMutation(api.authEvents.recordMagicLinkRequestAttempt);
  const [email, setEmail] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const requestOneTimeCode = useMutation(api.oneTimeCodes.requestCode);
  /**
   * Which way in the person chose. Neither is the default, and choosing one
   * never takes the other away — a link is right when the email is open on the
   * same machine, and a code is right when it is not.
   */
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [codeError, setCodeError] = useState("");

  const handleGoogleSignIn = async () => {
    setIsSubmittingGoogle(true);
    await signIn("google", { redirectTo });
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setIsSubmittingEmail(true);
    try {
      /*
       * Refused quietly when the address has asked too often, exactly as the
       * code path is. Saying so would confirm which addresses exist, and the
       * person receiving unwanted mail is better served by it stopping than by
       * a message.
       *
       * An error here lets the sign-in through rather than blocking it: this
       * gate exists to stop mail being posted at someone, and a diagnostics
       * wobble must never be the thing that locks a real person out.
       */
      let allowed = true;
      try {
        const attempt = await recordMagicLinkRequestAttempt({ email, provider: "resend" });
        allowed = attempt?.allowed !== false;
      } catch {
        console.debug("Auth diagnostics skipped.");
      }

      if (allowed) {
        await signIn("resend", { email, redirectTo });
      }
    } catch {
      // Fail silently to thwart user enumeration attacks
      console.debug("Auth action processed.");
    } finally {
      setIsSubmittingEmail(false);
      setEmailSent(true);
    }
  };

  const handleCodeRequest = async () => {
    if (!email || isSubmittingCode) return;
    setIsSubmittingCode(true);
    setCodeError("");

    try {
      // Refused quietly when the address has asked too often. Saying so would
      // confirm which addresses exist, and the person receiving unwanted codes
      // is better served by the mail stopping than by a message.
      const allowed = await requestOneTimeCode({ email });
      if (allowed) {
        await signIn("one-time-code", { email, redirectTo });
      }
    } catch {
      // Silent, exactly as the link path is, to thwart user enumeration.
      console.debug("Auth action processed.");
    } finally {
      setIsSubmittingCode(false);
      setCodeSent(true);
    }
  };

  const handleCodeSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const entered = normaliseCode(code);
    if (!entered || isSubmittingCode) return;

    setIsSubmittingCode(true);
    setCodeError("");

    try {
      await signIn("one-time-code", { email, code: entered, redirectTo });
    } catch {
      // The framework refuses a wrong or spent code without saying which, so
      // the screen says the one thing that is always true and always useful.
      setCodeError(describeVerdict({ ok: false, reason: "wrong" }));
    } finally {
      setIsSubmittingCode(false);
    }
  };

  const startAgain = () => {
    setEmailSent(false);
    setCodeSent(false);
    setCode("");
    setCodeError("");
  };

  const copyright = tLanding("copyright", { year: new Date().getFullYear() });

  if (codeSent) {
    return (
      <RainSplit name="sign-in" width="narrow" copyright={copyright}>
        <form className="contents" onSubmit={handleCodeSubmit}>
          <Eyebrow>{t("subtitle")}</Eyebrow>
          <ScreenTitle>{t("title")}</ScreenTitle>
          <ScreenCopy>{t("codeSent")}</ScreenCopy>
          <CodeBoxes label={t("codePlaceholder")} value={code} onChange={setCode} disabled={isSubmittingCode} invalid={Boolean(codeError)} />
          {codeError ? (
            <StatusLabel tone="danger" wrap data-part="status">
              {codeError}
            </StatusLabel>
          ) : null}
          <Button
            variant="primary"
            type="submit"
            data-part="primary-action"
            disabled={isSubmittingCode || !code}
            className="flex w-full items-center justify-center gap-2.5 px-[22px] py-[13px] text-[15px]"
          >
            {isSubmittingCode ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : (
              <>
                <span>{t("signInWithCode")}</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </Button>
          <button type="button" onClick={startAgain} data-part="link" data-part-label={t("tryDifferentEmail")} className="self-start text-[13px] text-secondary transition-colors hover:text-foreground">
            {t("tryDifferentEmail")}
          </button>
        </form>
      </RainSplit>
    );
  }

  if (emailSent) {
    return (
      <RainSplit name="sign-in" width="narrow" copyright={copyright}>
        <Eyebrow>{t("subtitle")}</Eyebrow>
        <IconDisc tone="success">
          <CircleCheck className="h-[22px] w-[22px]" />
        </IconDisc>
        <ScreenTitle>{t("thankYou")}</ScreenTitle>
        <ScreenCopy>{t("magicLinkSent", { platformName })}</ScreenCopy>
        <button type="button" onClick={startAgain} data-part="link" data-part-label={t("tryDifferentEmail")} className="self-start text-[13px] text-secondary transition-colors hover:text-foreground">
          {t("tryDifferentEmail")}
        </button>
      </RainSplit>
    );
  }

  return (
    <RainSplit name="sign-in" width="narrow" copyright={copyright}>
      <form className="contents" onSubmit={handleEmailSignIn}>
        <Eyebrow>{t("subtitle")}</Eyebrow>
        <ScreenTitle>{t("title")}</ScreenTitle>
        <Field
          label={t("emailLabel")}
          type="email"
          required
          autoComplete="email"
          placeholder={t("emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <Button
          variant="primary"
          type="submit"
          data-part="primary-action"
          disabled={isSubmittingEmail || !email}
          className="flex w-full items-center justify-center gap-2.5 px-[22px] py-[13px] text-[15px]"
        >
          {isSubmittingEmail ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : (
            <>
              <span>{t("sendMagicLink")}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
        <Button
          variant="quiet"
          onClick={handleCodeRequest}
          data-part="action"
          data-part-label={t("sendCode")}
          disabled={isSubmittingCode || !email}
          className="flex w-full items-center justify-center gap-2 px-4 py-3 text-[13px]"
        >
          {isSubmittingCode ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : (
            <>
              <KeyRound className="h-[15px] w-[15px]" aria-hidden="true" />
              <span>{t("sendCode")}</span>
            </>
          )}
        </Button>
        <div className="flex items-center gap-3.5" aria-hidden="true">
          <span className="flex-1 border-t border-border-dim" />
          <span className="font-mono text-[11px] tracking-[0.2em] text-muted">{t("or")}</span>
          <span className="flex-1 border-t border-border-dim" />
        </div>
        <Button
          variant="quiet"
          onClick={handleGoogleSignIn}
          data-part="action"
          data-part-label={t("continueWithGoogle")}
          disabled={isSubmittingGoogle}
          className="flex w-full items-center justify-center gap-2.5 px-4 py-3 text-[13px]"
        >
          {isSubmittingGoogle ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : (
            <>
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>{t("continueWithGoogle")}</span>
            </>
          )}
        </Button>
      </form>
    </RainSplit>
  );
}
