"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { GoogleAnalytics, GoogleTagManager } from '@next/third-parties/google';

export function AnalyticsProvider() {
   const tagId = useQuery(api.system.getAnalyticsId);
   
   if (!tagId) return null;
   
   const cleanId = tagId.trim().toUpperCase();
   
   if (cleanId.startsWith("GTM-")) {
      return <GoogleTagManager gtmId={cleanId} />;
   } else if (cleanId.startsWith("G-") || cleanId.startsWith("AW-")) {
      // Note: @next/third-parties/google uses GoogleAnalytics for both GA4 (G-) and Adwords (AW-) snippets.
      return <GoogleAnalytics gaId={cleanId} />
   }
   
   return null;
}
