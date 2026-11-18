"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";
import { warnOnLeaveWhileSaving } from "@/src/lib/leaveWarning";

const isE2EAuthEnabled = process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED === "1"
  && process.env.NEXT_PUBLIC_E2E_AUTH_ENVIRONMENT === "local"
  && process.env.NODE_ENV !== "production";
// Convex's own "Leave site?" warning asked while a screen only read from Google: the app's own asks only while saving
// (`warnOnLeaveWhileSaving`, speed fixes 18 November 2026).
const convex = isE2EAuthEnabled ? undefined : new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!, { unsavedChangesWarning: false });
if (convex && typeof window !== "undefined") warnOnLeaveWhileSaving(convex);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (isE2EAuthEnabled) return <>{children}</>;

  return <ConvexAuthNextjsProvider client={convex!}>{children}</ConvexAuthNextjsProvider>;
}
