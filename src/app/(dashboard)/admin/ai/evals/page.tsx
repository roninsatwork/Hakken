"use client";

import { EvalsScreen } from "@/src/app/(dashboard)/admin/_features/evals/EvalsScreen";

/** The global AI's own checks (Anthony's ruling, 2026-08-16): the same screen
 * every company has, with the list kept by hand. */
export default function GlobalAiEvalsPage() {
  return <EvalsScreen />;
}
