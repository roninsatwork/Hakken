"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { resolveLegacySettingsRoute } from "./_components/settingsTabs";

/**
 * Settings has no page of its own any more: each section is its own route
 * under the `(system)` group, reached from the menu in that group's layout.
 *
 * This entry point survives because `/admin/settings` is what the sidebar
 * links to, and because the screen spent its life as one page with `?tab=`
 * query links — in bookmarks, in docs, and in at least one link inside the
 * app. Those tabs map onto the new routes rather than 404ing.
 */
export default function SystemSettingsEntryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const destination = resolveLegacySettingsRoute(searchParams.get("tab"));

  useEffect(() => {
    router.replace(destination);
  }, [destination, router]);

  return (
    <div className="w-full h-[50vh] flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
    </div>
  );
}
