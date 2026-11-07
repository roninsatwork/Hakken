"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/convex/_generated/api";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";

/** The websites this tab has shown, so a website that goes missing while open is told apart from one opened from elsewhere. */
const openInThisTab = new Set<string>();

/**
 * Whether this tab has shown the website already. Each website screen calls it on every render, before it decides what to show:
 * a website that goes missing after it was open had its workspace changed on purpose, here or in another tab.
 */
export function useWebsiteWasOpen(siteId: string, found: boolean): boolean {
  if (found) openInThisTab.add(siteId);
  return openInThisTab.has(siteId);
}

const inView = () => typeof document !== "undefined" && document.visibilityState === "visible";

/**
 * A website the address names that the workspace doesn't hold. A super admin is moved into the workspace that holds it, and the
 * page opens (Anthony, 2026-11-07: "we should not see an error"). Anyone else sees the message, as before, and a website that
 * doesn't exist says so to everyone. Shared by every section's website screens.
 *
 * Only the tab being looked at moves the workspace, and a website that went missing while open is left alone until the person
 * comes back to its tab: a workspace is kept for the whole sign-in, so a tab left open on one company's website moved every
 * workspace chosen elsewhere straight back to it (Anthony, 2026-11-07: "why when i impersonate a workspace does it take me back").
 */
export function WebsiteNotFound({ siteId, wasOpen, icon, title, description }: { siteId: string; wasOpen: boolean; icon: LucideIcon; title: string; description: string }) {
  const holder = useQuery(api.websiteWorkspace.workspaceHoldingWebsite, { siteId });
  const impersonate = useMutation(api.users.impersonateCompany);
  const asked = useRef<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [looking, setLooking] = useState(inView);
  // Came back to this tab after the website went missing: what's on screen now is what they want to see.
  const [cameBack, setCameBack] = useState(false);
  useEffect(() => {
    const update = () => {
      const now = inView();
      setLooking(now);
      if (now) setCameBack(true);
    };
    const away = () => setLooking(inView());
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    window.addEventListener("blur", away);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
      window.removeEventListener("blur", away);
    };
  }, []);
  const moves = Boolean(holder) && looking && (!wasOpen || cameBack);
  useEffect(() => {
    if (!moves || !holder || asked.current === holder) return;
    asked.current = holder;
    impersonate({ companyId: holder }).catch(() => setFailed(true));
  }, [moves, holder, impersonate]);
  // A website to move to: the page waits as it does while a website loads. One open here before, whose workspace was changed while
  // it was on screen, says so plainly.
  if (!failed && (holder === undefined || (holder !== null && (moves || !looking || !wasOpen)))) {
    return <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />;
  }
  return <HakkenEmptyState icon={icon} title={title} description={description} />;
}
