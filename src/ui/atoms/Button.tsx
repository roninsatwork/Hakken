"use client";

import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/src/ui/lib/utils";

/**
 * The button, said once.
 *
 * 387 screens-worth of `<button>` elements were counted on 2026-08-19, and
 * each one invents its own padding, corner radius and hover shade. They are
 * not 387 designs — read together they collapse into a handful of recipes,
 * copied by eye and drifting a token at a time: a dark call-to-action drawn
 * 55 times with two different hovers, a bordered grey workhorse drawn ~50
 * ways, a borderless cancel drawn wherever a modal needed one. This freezes
 * the recipes that actually recur, exactly as they are on screen today —
 * moving onto a variant should not shift a button by a pixel.
 *
 * Seven variants, each the most-repeated exact recipe of a real family:
 *
 * - `primary` — the dark call-to-action: solid foreground, dims on hover.
 * - `pill` — the same call-to-action in its rounded-full, bold, glowing form,
 *   used on hero moments like empty states and upload panels.
 * - `quiet` — the bordered grey workhorse that sits inside tables and panels.
 * - `ghost` — no border, no background until hovered; the modal Cancel.
 * - `accent` — brand-tinted chip with a brand border, for the secondary
 *   action that should still catch the eye.
 * - `destructive` — the red-tinted confirm used before deleting something.
 * - `icon` — a round hit-target around a single icon.
 *
 * Two rules the element itself gets wrong are fixed here and not optional:
 * the type defaults to `"button"`, never the silent form-submit a bare
 * `<button>` means; and keyboard focus is always visible, drawn only for
 * keyboard users so pointer clicks look exactly as they did.
 *
 * `className` merges after the variant (tailwind-merge), so a screen may
 * adjust size or spacing — `text-[11px]`, `w-full` — without leaving the
 * kit. A button whose colours or behaviour genuinely match no variant should
 * stay a raw `<button>` and its file stays in the frozen count in
 * scripts/screen-kit-allowlist.json, which may shrink, never grow.
 */

export type ButtonVariant =
  | "primary"
  | "pill"
  | "quiet"
  | "ghost"
  | "accent"
  | "destructive"
  | "icon";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "px-6 py-2.5 rounded-[10px] bg-foreground text-background text-sm font-medium " +
    "hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50",
  pill:
    "flex items-center gap-2 px-8 py-3 rounded-full bg-foreground text-background " +
    "font-bold tracking-wide text-[13px] hover:opacity-90 transition-all " +
    "disabled:opacity-30 disabled:cursor-not-allowed shadow-[0_0_30px_rgba(255,255,255,0.05)]",
  quiet:
    "px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[12px] " +
    "font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] " +
    "transition-all disabled:opacity-50",
  ghost:
    "px-5 py-2.5 rounded-[8px] text-[13px] font-medium text-secondary " +
    "hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50",
  accent:
    "px-3 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[12px] " +
    "font-semibold hover:bg-brand/15 transition-all disabled:opacity-50",
  destructive:
    "px-6 py-2.5 rounded-full border border-red-500/20 bg-red-500/10 text-red-500 " +
    "text-[13px] font-bold tracking-widest uppercase hover:bg-red-500/20 transition-colors",
  icon: "p-2 rounded-full text-secondary hover:text-foreground hover:bg-foreground/5 transition-all",
};

/** Keyboard focus is visible on every variant; a pointer click shows nothing new. */
const FOCUS_CLASSES =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

type ButtonProps = {
  variant: ButtonVariant;
  /** For the rare screen that must reach the element — to focus it, or anchor a menu. */
  ref?: Ref<HTMLButtonElement>;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function Button({ variant, type = "button", className, ref, ...buttonProps }: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(VARIANT_CLASSES[variant], FOCUS_CLASSES, className)}
      {...buttonProps}
    />
  );
}
