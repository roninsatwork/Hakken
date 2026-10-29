"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ArrowRight, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { CONSENT_CODE_PARAM } from "@/convex/magicLinkUrlService";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";
import { Button } from "@/src/ui/components/screens/Button";
import { Eyebrow, IconDisc, RainSplit, ScreenCopy, ScreenTitle, primaryLinkClassName } from "@/src/ui/components/public/RainSplit";

/**
 * The page a sign-in link lands on, which deliberately does nothing on arrival.
 *
 * The first version of this page held the code behind a plain anchor, on the
 * theory that mail scanners follow links but do not click. Production proved
 * the theory half right: the gateway at the affected domain renders pages and
 * follows the anchors it finds in them, and it spent the code 93 seconds after
 * send — before the email had even been released to the inbox.
 *
 * So there is now no URL anywhere that redeems on load. Not in the email, not
 * in this page's DOM. Redemption happens only inside a click handler on a
 * button with no href: a crawler that renders this page and harvests
 * navigation targets finds a dead end. The page therefore requires JavaScript,
 * which is the trade being made — the no-JS anchor was precisely the leak, and
 * the app this signs into cannot run without JavaScript either.
 *
 * A sandbox that synthetically clicks buttons would still spend the code.
 * Those exist and are rarer; if one turns up, the answer is not another round
 * of this arms race but the typed one-time code, which is immune by
 * construction because nothing in the email can spend it.
 *
 * Its three states — nearly there, link used, link incomplete — are drawn on
 * the "Hakken home page" canvas, approved 2026-10-29 (before-sign-in-plan.md;
 * verifyLook.test holds them), in plain words.
 */
export default function VerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuthActions();
  const tLanding = useTranslations("landing");
  const code = searchParams.get(CONSENT_CODE_PARAM);
  const redirectTo = sanitizeAuthRedirect(searchParams.get("redirectTo"));
  const [state, setState] = useState<"idle" | "signingIn" | "failed">("idle");
  const copyright = tLanding("copyright", { year: new Date().getFullYear() });

  const handleSignIn = async () => {
    if (!code || state === "signingIn") return;
    setState("signingIn");
    try {
      /*
       * No provider, just the code — exactly how the library's own
       * URL-code flow calls it (`signIn(undefined, { code })` in its React
       * client). The public typing requires a provider name; the runtime
       * resolves the code without one, and passing a name here would tie
       * this page to one provider when the code already knows its own.
       */
      const signInWithCode = signIn as (
        provider?: string,
        params?: { code: string }
      ) => ReturnType<typeof signIn>;
      const result = await signInWithCode(undefined, { code });
      if (result.signingIn) {
        router.replace(redirectTo);
        return;
      }
      setState("failed");
    } catch {
      setState("failed");
    }
  };

  if (!code || state === "failed") {
    const used = state === "failed";
    return (
      <RainSplit name="verify" width="narrow" copyright={copyright}>
        <Eyebrow>Sign in</Eyebrow>
        <ScreenTitle>{used ? "This sign-in link has been used" : "This link didn't come through properly"}</ScreenTitle>
        <ScreenCopy>
          {used
            ? "A sign-in link only works once. Go back and ask for a new one, or sign in with a code instead."
            : "Part of it went missing on the way. Go back and ask for a new one, or sign in with a code instead."}
        </ScreenCopy>
        <Link href="/login" data-part="primary-action" className={primaryLinkClassName}>
          <span>Back to sign in</span>
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </RainSplit>
    );
  }

  return (
    <RainSplit name="verify" width="narrow" copyright={copyright}>
      <Eyebrow>Sign in</Eyebrow>
      <IconDisc tone="brand">
        <KeyRound className="h-5 w-5" />
      </IconDisc>
      <ScreenTitle>Nearly there</ScreenTitle>
      <ScreenCopy>
        Press the button to finish signing in. We ask for this because some work email systems open links by
        themselves, and a sign-in link only works once.
      </ScreenCopy>
      <Button
        variant="primary"
        onClick={handleSignIn}
        data-part="primary-action"
        disabled={state === "signingIn"}
        className="flex w-max items-center gap-2.5 px-[22px] py-[13px] text-[15px]"
      >
        {state === "signingIn" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>Signing you in</span>
          </>
        ) : (
          <>
            <span>Sign in</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </>
        )}
      </Button>
    </RainSplit>
  );
}
