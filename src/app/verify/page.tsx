"use client";

import { Suspense, useState } from "react";
import { KeyRound, Loader2, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import {
  CONSENT_CODE_PARAM,
  buildRedemptionUrl,
} from "@/convex/magicLinkUrlService";
import { sanitizeAuthRedirect } from "@/src/lib/authRedirect";

/**
 * The page a sign-in link lands on, which deliberately does nothing on arrival.
 *
 * A mail gateway that follows links reaches exactly this, and leaves with
 * nothing: the code sits in a parameter the auth client does not recognise, so
 * no redemption happens on mount. Pressing the button is what moves the code
 * onto the name the client reads, and only a person does that.
 *
 * It renders as a plain anchor rather than a click handler on purpose. If
 * JavaScript never runs the link still works, and there is no effect here that
 * a rendering scanner could trip by loading the page.
 */
function VerifyContent() {
  const searchParams = useSearchParams();
  const code = searchParams.get(CONSENT_CODE_PARAM);
  const redirectTo = sanitizeAuthRedirect(searchParams.get("redirectTo"));
  const [isNavigating, setIsNavigating] = useState(false);

  if (!code) {
    return (
      <div className="flex flex-col gap-4 text-center">
        <h1 className="text-xl font-semibold">This link is incomplete</h1>
        <p className="text-sm text-secondary">
          It may have been shortened or rewritten in transit. Ask for a new one, or sign in with a
          typed code instead.
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
      <a
        href={buildRedemptionUrl(code, redirectTo)}
        onClick={() => setIsNavigating(true)}
        className="inline-flex items-center justify-center gap-2 rounded-[12px] bg-brand px-4 py-3 text-sm font-semibold"
      >
        {isNavigating ? (
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
      </a>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-[16px] border border-border-dim bg-background p-8">
        <Suspense
          fallback={
            <div className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-secondary" />
            </div>
          }
        >
          <VerifyContent />
        </Suspense>
      </div>
    </main>
  );
}
