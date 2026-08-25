"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ChevronRight, Loader2, Sparkles, CheckCircle2, KeyRound } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useSearchParams } from "next/navigation";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";
import { describeVerdict, normaliseCode } from "@/convex/oneTimeCodeService";

export default function LoginPage() {
  const t = useTranslations('login');
  const { signIn } = useAuthActions();
  const searchParams = useSearchParams();
  const redirectTo = sanitizeAuthRedirect(searchParams.get("redirectTo"));
  const recordMagicLinkRequestAttempt = useMutation(api.authEvents.recordMagicLinkRequestAttempt);
  const [email, setEmail] = useState("");
  const [isSubmittingEmail, setIsSubmittingEmail] = useState(false);
  const [isSubmittingGoogle, setIsSubmittingGoogle] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const requestOneTimeCode = useMutation(api.oneTimeCodes.requestCode);
  const recordCodeVerified = useMutation(api.oneTimeCodes.recordVerified);
  const recordCodeFailed = useMutation(api.oneTimeCodes.recordFailed);
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
      try {
        await recordCodeVerified({ email });
      } catch {
        console.debug("Auth diagnostics skipped.");
      }
    } catch {
      // The framework refuses a wrong or spent code without saying which, so
      // the screen says the one thing that is always true and always useful.
      setCodeError(describeVerdict({ ok: false, reason: "wrong" }));

      // And the refusal is recorded. A failed sign-in left nothing behind
      // anywhere, which made a run of attempts against an account invisible.
      try {
        await recordCodeFailed({ email });
      } catch {
        console.debug("Auth diagnostics skipped.");
      }
    } finally {
      setIsSubmittingCode(false);
    }
  };

  return (
    <div className="public-site ps-login">
      <div className="ps-login-inner">
        <Link href="/" className="ps-login-brand">
          <span className="ps-login-mark">
            <Sparkles className="h-[15px] w-[15px]" />
          </span>
          <span className="ps-display text-[16px] tracking-[0.14em]">SONAE</span>
        </Link>

        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 320 }}
          className="w-full max-w-[440px]"
        >
          <div className="ps-login-card">
            <span className="ps-eyebrow">{t('subtitle')}</span>
            <h1 className="ps-display ps-login-h1">{t('title')}</h1>

            <AnimatePresence mode="wait">
              {codeSent ? (
                <motion.form
                  key="code"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="mt-7 flex w-full flex-col gap-3"
                  onSubmit={handleCodeSubmit}
                >
                  <p className="ps-login-note">{t('codeSent')}</p>

                  <div className="relative w-full">
                    <KeyRound className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--ps-ink-40)]" />
                    <input
                      // `inputMode` so a phone offers digits, and no autofill
                      // guessing: this is typed from another device by design.
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      required
                      placeholder={t('codePlaceholder')}
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
                      className="ps-login-input"
                    />
                  </div>

                  {codeError ? <p className="ps-login-note">{codeError}</p> : null}

                  <button
                    type="submit"
                    disabled={isSubmittingCode || !code}
                    className="ps-login-primary group"
                  >
                    {isSubmittingCode ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <span>{t('signInWithCode')}</span>
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => { setCodeSent(false); setCode(""); setCodeError(""); }}
                    className="ps-login-try"
                  >
                    {t('tryDifferentEmail')}
                  </button>
                </motion.form>
              ) : !emailSent ? (
                <motion.form
                  key="form"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  className="mt-7 flex w-full flex-col gap-3"
                  onSubmit={handleEmailSignIn}
                >
                  <div className="relative w-full">
                    <Mail className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--ps-ink-40)]" />
                    <input
                      type="email"
                      required
                      placeholder={t('emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="ps-login-input"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingEmail || !email}
                    className="ps-login-primary group"
                  >
                    {isSubmittingEmail ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <span>{t('sendMagicLink')}</span>
                        <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCodeRequest}
                    disabled={isSubmittingCode || !email}
                    className="ps-login-secondary"
                  >
                    {isSubmittingCode ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <KeyRound className="h-4 w-4" />
                        <span>{t('sendCode')}</span>
                      </>
                    )}
                  </button>

                  <div className="ps-login-divider">
                    <span>{t('or')}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isSubmittingGoogle}
                    className="ps-login-secondary"
                  >
                    {isSubmittingGoogle ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        <span>{t('continueWithGoogle')}</span>
                      </>
                    )}
                  </button>
                </motion.form>
              ) : (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-7 flex w-full flex-col items-start"
                >
                  <span className="ps-login-tick">
                    <CheckCircle2 className="h-6 w-6" />
                  </span>
                  <h2 className="ps-display ps-login-h2 mt-4">{t('thankYou')}</h2>
                  <p className="ps-login-note mt-2">{t('magicLinkSent')}</p>
                  <button
                    type="button"
                    onClick={() => setEmailSent(false)}
                    className="ps-login-try"
                  >
                    {t('tryDifferentEmail')}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <p className="ps-login-foot">
          備え — the production layer behind AI products.
        </p>
      </div>
    </div>
  );
}
