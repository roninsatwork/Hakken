"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const LocalTestAuthError = lazy(() => import("./LocalTestAuthError"));

type LocalTestAuthClientProps = {
  enabled: boolean;
};

const allowedRoles = new Set(["super-admin", "company-admin", "user"]);

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function sanitizeRedirectTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/app";
  return value;
}

export function LocalTestAuthClient({ enabled }: LocalTestAuthClientProps) {
  const searchParams = useSearchParams();
  const { signIn } = useAuthActions();
  const signInAttemptKeyRef = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const role = searchParams.get("role") || "";
    const secret = searchParams.get("secret") || "";
    const redirectTo = sanitizeRedirectTo(searchParams.get("redirectTo"));
    return { role, secret, redirectTo };
  }, [searchParams]);

  useEffect(() => {
    let isActive = true;
    const attemptKey = `${enabled ? "enabled" : "disabled"}:${params.role}:${params.secret}:${params.redirectTo}`;
    if (signInAttemptKeyRef.current === attemptKey) return;
    signInAttemptKeyRef.current = attemptKey;

    async function signInForLocalTest() {
      if (!enabled) {
        setError("Local test auth is disabled.");
        return;
      }

      if (!isLocalhost(window.location.hostname)) {
        setError("Local test auth is only available on localhost.");
        return;
      }

      if (!allowedRoles.has(params.role) || !params.secret) {
        setError("Missing or invalid local test auth parameters.");
        return;
      }

      try {
        const result = await signIn("local-test", {
          role: params.role,
          secret: params.secret,
          redirectTo: params.redirectTo,
        });

        if (!result.signingIn) {
          setError("Local test sign-in was rejected.");
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
        window.location.assign(params.redirectTo);
      } catch {
        if (isActive) setError("Local test sign-in failed.");
      }
    }

    void signInForLocalTest();

    return () => {
      isActive = false;
    };
  }, [enabled, params, signIn]);

  if (error) {
    return (
      <Suspense fallback={<LocalTestAuthLoading />}>
        <LocalTestAuthError message={error} />
      </Suspense>
    );
  }

  return <LocalTestAuthLoading />;
}

function LocalTestAuthLoading() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div
        data-testid="local-test-auth-loading"
        className="flex items-center gap-3 text-[13px] text-secondary tracking-wide"
      >
        <Loader2 className="w-5 h-5 animate-spin text-brand" />
        <span>Creating local test session</span>
      </div>
    </main>
  );
}
