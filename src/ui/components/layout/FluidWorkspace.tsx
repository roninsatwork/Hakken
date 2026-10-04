"use client";

import React, { useEffect, useLayoutEffect, useRef } from "react";
import { motion } from "framer-motion";
import { usePathname } from "next/navigation";
import { useUI } from "@/src/context/UIContext";

/** How long a page coming back on Back may take to fill in before its place is given up, and how often it is tried. */
const RESTORE_FOR_MS = 4_000;
const RESTORE_EVERY_MS = 100;

/**
 * The dashboard's scrolling column. It scrolls itself, not the window, so it
 * places each page itself (Anthony's audit, 2026-10-04: a link followed from
 * 600px down opened the next page 600px down, its title out of sight): a page
 * opened from another starts at its top, Back and Forward return to where it
 * was. A sort, filter or search changes only the address's query, not the
 * page, and keeps the reader's place.
 */
export default function FluidWorkspace({ children, className }: { children: React.ReactNode, className?: string }) {
  const { isSidebarOpen } = useUI();
  const pathname = usePathname();
  const column = useRef<HTMLElement>(null);
  const shownPath = useRef(pathname);
  const places = useRef(new Map<string, number>());
  const traversing = useRef(false);

  useEffect(() => {
    const box = column.current;
    if (!box) return;
    // The page's place, kept as the reader scrolls, and again as they click
    // (a link or a row may be leaving the page) and press Back or Forward:
    // a browser tab out of view sends no scroll events.
    const keep = () => places.current.set(shownPath.current, box.scrollTop);
    const mark = () => {
      keep();
      traversing.current = true;
    };
    // Back and Forward are told by the browser's navigation events where it has
    // them: they come before Next.js draws the page, which a popstate does not.
    const navigation = (window as unknown as { navigation?: EventTarget }).navigation;
    const traverse = (event: Event) => {
      if ((event as Event & { navigationType?: string }).navigationType === "traverse") mark();
    };
    box.addEventListener("scroll", keep, { passive: true });
    box.addEventListener("click", keep, { capture: true });
    if (navigation) navigation.addEventListener("navigate", traverse);
    else window.addEventListener("popstate", mark);
    return () => {
      box.removeEventListener("scroll", keep);
      box.removeEventListener("click", keep, { capture: true });
      if (navigation) navigation.removeEventListener("navigate", traverse);
      else window.removeEventListener("popstate", mark);
    };
  }, []);

  useLayoutEffect(() => {
    const box = column.current;
    if (!box || shownPath.current === pathname) return;
    shownPath.current = pathname;
    const place = traversing.current ? places.current.get(pathname) ?? 0 : 0;
    traversing.current = false;
    box.scrollTop = place;
    if (place === 0) return;
    // Back to a page still loading its rows: return to its place as it fills
    // in, for a few seconds, unless the reader scrolls first.
    const started = Date.now();
    const timer = window.setInterval(() => {
      if (box.scrollTop >= place - 1 || Date.now() - started > RESTORE_FOR_MS) stop();
      else box.scrollTop = place;
    }, RESTORE_EVERY_MS);
    const readerMoves = ["wheel", "touchstart", "keydown", "mousedown"] as const;
    function stop() {
      window.clearInterval(timer);
      for (const move of readerMoves) box?.removeEventListener(move, stop);
    }
    for (const move of readerMoves) box.addEventListener(move, stop, { passive: true });
    return stop;
  }, [pathname]);

  return (
    <motion.main
      ref={column}
      initial={false}
      animate={{
        paddingLeft: isSidebarOpen ? "240px" : "0px",
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30, mass: 1 }}
      className="h-screen overflow-y-auto flex flex-col w-full bg-transparent text-foreground relative z-0"
    >
      <div className={`flex flex-col flex-1 w-full p-8 relative min-h-0 ${className || ''}`}>
        {children}
      </div>
    </motion.main>
  );
}
