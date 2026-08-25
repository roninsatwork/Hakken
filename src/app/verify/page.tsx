"use client";

import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { ChevronRight, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { CONSENT_CODE_PARAM } from "@/convex/magicLinkUrlService";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";

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
 */
export default function VerifyPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuthActions();
  const code = searchParams.get(CONSENT_CODE_PARAM);
  const redirectTo = sanitizeAuthRedirect(searchParams.get("redirectTo"));
  const [state, setState] = useState<"idle" | "signingIn" | "failed">("idle");

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
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold">
          {state === "failed" ? "That link has already been used" : "This link is incomplete"}
        </h1>
        <p className="text-sm text-secondary">
          {state === "failed"
            ? "A sign-in link works once. Ask for a new one, or sign in with a typed code instead."
            : "It may have been shortened or rewritten in transit. Ask for a new one, or sign in with a typed code instead."}
        </p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-brand px-4 py-3 text-sm font-semibold"
        >
          Back to sign in
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand/10">
        <KeyRound className="h-5 w-5 text-brand" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Confirm it is you</h1>
        <p className="text-sm text-secondary">
          One more press and you are in. This step exists because some company mail systems open
          links before you do, and a sign-in link only works once.
        </p>
      </div>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={state === "signingIn"}
        className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-brand px-4 py-3 text-sm font-semibold disabled:opacity-70"
      >
        {state === "signingIn" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Signing you in
          </>
        ) : (
          <>
            Sign in
            <ChevronRight className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  );
}
