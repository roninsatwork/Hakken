"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useSearchParams } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";

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
  const [error, setError] = useState<string | null>(null);

  const params = useMemo(() => {
    const role = searchParams.get("role") || "";
    const secret = searchParams.get("secret") || "";
    const redirectTo = sanitizeRedirectTo(searchParams.get("redirectTo"));
    return { role, secret, redirectTo };
  }, [searchParams]);

  useEffect(() => {
    let isActive = true;

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

        if (!isActive) return;

        if (!result.signingIn) {
          setError("Local test sign-in was rejected.");
          return;
        }

        await new Promise((resolve) => setTimeout(resolve, 250));
        if (!isActive) return;

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
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
        <div
          data-testid="local-test-auth-error"
          className="max-w-md rounded-[24px] border border-border-dim bg-card/60 p-8 shadow-xl flex flex-col gap-4"
        >
          <ShieldAlert className="w-8 h-8 text-[#f43f5e]" />
          <h1 className="text-xl font-semibold tracking-wide">Local test auth unavailable</h1>
          <p className="text-[14px] text-secondary leading-relaxed">{error}</p>
        </div>
      </main>
    );
  }

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
