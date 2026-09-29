import type { ReactNode } from "react";
import { Check, CircleX, Clock, Info, Loader2, Minus, Pin, ShieldCheck, TriangleAlert, User, UserCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { STATUS_TONE_TEXT_CLASSES, type StatusTone } from "./statusTone";

/** The icon each tone draws: five shapes, so the tone never rests on colour alone. */
const TONE_ICONS: Record<StatusTone, LucideIcon> = {
  success: Check,
  info: Info,
  warning: TriangleAlert,
  danger: CircleX,
  neutral: Minus,
};

/**
 * Icons for a meaning the tone alone does not carry. A screen names one of
 * these; it never passes an icon of its own. Add a new one here, with a line
 * on why, and to the table in docs/developer/screen-kit.md.
 */
export const STATUS_ICONS = {
  /** Work under way right now: it turns, so a glance tells it from a state that has settled. */
  working: { Icon: Loader2, spin: true },
  /** Waiting on a person's approval, not on the machine. */
  approval: { Icon: UserCheck, spin: false },
  /** Waiting for someone else to act — an invitation not yet accepted. */
  waiting: { Icon: Clock, spin: false },
  /** A person's role is an admin one: the shield the role pills always carried. */
  admin: { Icon: ShieldCheck, spin: false },
  /** A person's role is an ordinary member's. */
  member: { Icon: User, spin: false },
  /** How many facts are pinned to a wiki page: the pin is the word, the number beside it. */
  pinned: { Icon: Pin, spin: false },
} satisfies Record<string, { Icon: LucideIcon; spin: boolean }>;

export type StatusIconName = keyof typeof STATUS_ICONS;

export type StatusLabelProps = {
  tone: StatusTone;
  children: ReactNode;
  /** sm for tables and lists; md for page headers and detail rows. */
  size?: "sm" | "md";
  /** A meaning the tone does not carry, from STATUS_ICONS. Leave it out and the tone picks the icon. */
  icon?: StatusIconName;
  /** A sentence rather than a word or two — what happened after an action — so it may wrap. */
  wrap?: boolean;
  /** Layout only — width, margin, alignment. Never a colour, a box or a font. */
  className?: string;
};

/**
 * A status as a small line icon in the status's colour, then plain words.
 * No box, fill, border or rounded ends: Anthony chose this on 2026-09-29 to
 * replace every pill on the platform ("a give away it's AI designed"). Only
 * the icon is coloured; the words carry the meaning, so the icon is hidden
 * from screen readers. Pick the tone with `toneForStatus` for status strings,
 * or pass it directly when the meaning is known at the call site. See
 * docs/plans/active/status-labels-plan.md.
 */
export function StatusLabel({ tone, children, size = "sm", icon, wrap = false, className }: StatusLabelProps) {
  const named = icon ? STATUS_ICONS[icon] : null;
  const Icon = named?.Icon ?? TONE_ICONS[tone];
  return (
    <span
      data-tone={tone}
      className={cn(
        // A status is a word or two, never wrapped a word to a line in a narrow column;
        // a sentence wraps beside its icon, which stays on the first line.
        "inline-flex w-fit font-normal leading-snug text-foreground/85",
        wrap ? "items-start" : "items-center whitespace-nowrap",
        size === "sm" ? "gap-1.5 text-[12px]" : "gap-2 text-[13px]",
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        strokeWidth={2}
        className={cn(
          "shrink-0",
          size === "sm" ? "h-3.5 w-3.5" : "h-[15px] w-[15px]",
          wrap && "mt-[2px]",
          STATUS_TONE_TEXT_CLASSES[tone],
          named?.spin && "animate-spin",
        )}
      />
      {children}
    </span>
  );
}
