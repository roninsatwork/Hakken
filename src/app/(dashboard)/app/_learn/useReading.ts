"use client";

import { useCallback, useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * Reading in Insights, counted for Analytics (docs/plans/active/content-
 * people-knowledge-plan.md, phase 4). Opening an article or story is a view;
 * staying on it 30 seconds, or reaching its end, is a read — once a visit
 * (Q1); opening its original, or one of a person's channels, is a click. The
 * server leaves super admins out (Q3). Counting never gets in a reader's way:
 * nobody waits on it, and a failure is dropped.
 */

export type ReadingThing = { type: "OURS" | "WEB" | "STORY" | "PERSON"; id: string };

/** How long on a page makes it a read (Q1, answered 2026-10-10). */
export const READ_AFTER_MS = 30_000;

function quietly(sent: Promise<unknown> | undefined) {
  void sent?.catch(() => undefined);
}

/**
 * Counts a view when the article or story is on screen, then a read after
 * 30 seconds or when the returned marker — placed after its last words —
 * comes into view, whichever is first. Pass null until it has loaded.
 */
export function useCountReading(thing: ReadingThing | null) {
  const record = useMutation(api.reading.recordReading);
  const endRef = useRef<HTMLDivElement>(null);
  const type = thing?.type;
  const id = thing?.id;

  useEffect(() => {
    if (!type || !id) return;
    const counted = { type, id };
    let read = false;
    const markRead = () => {
      if (read) return;
      read = true;
      quietly(record({ kind: "READ", thing: counted }));
    };
    quietly(record({ kind: "VIEW", thing: counted }));
    const timer = setTimeout(markRead, READ_AFTER_MS);
    const end = endRef.current;
    const observer = end && typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) markRead();
      })
      : null;
    if (end) observer?.observe(end);
    return () => {
      clearTimeout(timer);
      observer?.disconnect();
    };
  }, [type, id, record]);

  return endRef;
}

/** Counts a click through to an original or a person's channel. */
export function useCountClick() {
  const record = useMutation(api.reading.recordReading);
  return useCallback((thing: ReadingThing) => quietly(record({ kind: "CLICK", thing })), [record]);
}
