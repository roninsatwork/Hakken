"use client";

import { useRef, type ClipboardEvent, type ChangeEvent, type KeyboardEvent } from "react";
import { cn } from "@/src/ui/lib/utils";

const BOXES = 6;
const digitsOnly = (text: string) => text.replace(/\D/g, "").slice(0, BOXES);

/**
 * A six-digit code typed one digit a box.
 *
 * New to the screen kit on 2026-10-29, named CodeBoxes, for the sign-in code
 * screen Anthony asked to be "better" than one text field (canvas "Hakken home
 * page", board LoginCode). Typing moves on to the next box by itself,
 * backspace moves back, a pasted or auto-filled code fills every box, and the
 * next box to fill is outlined in the brand colour. The value is the digits
 * alone, never spaces, so the caller submits it as it is.
 */
export function CodeBoxes({
  label,
  value,
  onChange,
  disabled = false,
  invalid = false,
}: {
  label: string;
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const digits = digitsOnly(value);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (at: number) => boxes.current[Math.max(0, Math.min(BOXES - 1, at))]?.focus();

  const typed = (at: number, event: ChangeEvent<HTMLInputElement>) => {
    const fresh = digitsOnly(event.target.value.replace(digits[at] ?? "", ""));
    if (!fresh) {
      onChange(digits.slice(0, at));
      return;
    }
    const next = digitsOnly(digits.slice(0, at) + fresh + digits.slice(at + fresh.length));
    onChange(next);
    focus(at + fresh.length);
  };

  const keyed = (at: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !digits[at] && at > 0) {
      event.preventDefault();
      onChange(digits.slice(0, at - 1));
      focus(at - 1);
    } else if (event.key === "ArrowLeft") {
      focus(at - 1);
    } else if (event.key === "ArrowRight") {
      focus(at + 1);
    }
  };

  const pasted = (event: ClipboardEvent<HTMLInputElement>) => {
    const code = digitsOnly(event.clipboardData.getData("text"));
    if (!code) return;
    event.preventDefault();
    onChange(code);
    focus(code.length);
  };

  return (
    <div data-part="code-boxes" data-part-label={label} className="flex flex-col gap-2">
      <span className="mt-1 text-[12px] font-medium text-secondary">{label}</span>
      <div role="group" aria-label={label} className="flex items-center gap-2">
        {Array.from({ length: BOXES }, (_, at) => (
          <span key={at} className="contents">
            {at === 3 ? (
              <span aria-hidden="true" className="w-3 text-center text-[18px] leading-[64px] text-muted">
                ·
              </span>
            ) : null}
            <input
              ref={(element) => {
                boxes.current[at] = element;
              }}
              aria-label={`Digit ${at + 1}`}
              inputMode="numeric"
              autoComplete={at === 0 ? "one-time-code" : "off"}
              value={digits[at] ?? ""}
              disabled={disabled}
              onChange={(event) => typed(at, event)}
              onKeyDown={(event) => keyed(at, event)}
              onPaste={pasted}
              onFocus={(event) => event.target.select()}
              className={cn(
                "h-16 w-14 rounded-[12px] border bg-black/20 p-0 text-center font-mono text-[26px] font-medium text-foreground outline-none transition-colors focus:border-brand/50 disabled:opacity-50",
                invalid ? "border-destructive" : at === digits.length ? "border-brand/50" : "border-border-dim",
              )}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
