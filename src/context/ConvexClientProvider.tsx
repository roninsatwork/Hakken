"use client";

import { ReactNode } from "react";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs";

const isE2EAuthEnabled = process.env.NEXT_PUBLIC_E2E_AUTH_ENABLED === "1";
const convex = isE2EAuthEnabled ? undefined : new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (isE2EAuthEnabled) return <>{children}</>;

  return <ConvexAuthNextjsProvider client={convex!}>{children}</ConvexAuthNextjsProvider>;
}
