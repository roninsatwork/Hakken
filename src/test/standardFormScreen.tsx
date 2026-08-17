import { expect } from "vitest";

/**
 * The floor every form screen must clear, callable from any screen's test.
 *
 * This exists for the same reason `standardTableScreen.tsx` does. Moving 73
 * screens onto the shared field one at a time, each with its own bespoke test,
 * was measured at roughly two hours a screen and most of that was the test.
 * The assertions worth making are the same on every one of them, so they are
 * written once here and called from each screen instead.
 *
 * What it asserts is the one thing the shared field exists to guarantee and the
 * one thing a conversion can silently get wrong: **every box a person types
 * into has a label that addresses it.** A label that is merely sitting next to
 * an input looks identical on screen, reads as an unlabelled box to a screen
 * reader, and does nothing when clicked. That was true of 88 screens, and it is
 * invisible to whoever built them.
 *
 * Deliberately not asserted here: anything about styling. A static scan already
 * fails the build on a hand-written box, and a test that pins class names would
 * have to be rewritten every time the kit's look changes, which is the opposite
 * of what a shared floor is for.
 *
 * Tick boxes, radios, file pickers, colour swatches, sliders and hidden inputs
 * are outside this, matching the build check: the kit has no part for them, so
 * failing a screen over one would leave no correct fix.
 */

const TYPING_BOXES = [
  "input:not([type])",
  'input[type="text"]',
  'input[type="email"]',
  'input[type="password"]',
  'input[type="search"]',
  'input[type="tel"]',
  'input[type="url"]',
  'input[type="number"]',
  "textarea",
].join(", ");

function accessibleName(box: HTMLInputElement | HTMLTextAreaElement): string {
  const ariaLabel = box.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const labelledBy = box.getAttribute("aria-labelledby")?.trim();
  if (labelledBy) {
    const named = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
      .filter(Boolean)
      .join(" ");
    if (named) return named;
  }

  if (box.id) {
    const forLabel = document.querySelector(`label[for="${CSS.escape(box.id)}"]`);
    const named = forLabel?.textContent?.trim();
    if (named) return named;
  }

  // A wrapping `<label>` is a real association too, and several screens use one
  // where stacking a label above the box would break a single-line row.
  const wrapping = box.closest("label")?.textContent?.trim();
  return wrapping ?? "";
}

function describe(box: HTMLInputElement | HTMLTextAreaElement): string {
  const hint = box.getAttribute("placeholder") ?? box.getAttribute("name") ?? box.id;
  return `<${box.tagName.toLowerCase()}${hint ? ` ${hint}` : ""}>`;
}

/**
 * Every box on the rendered screen carries a name.
 *
 * Call it after rendering. `minBoxes` guards against the assertion passing
 * vacuously when a screen renders nothing — a loading state, a failed mock, or
 * a query that returned `undefined` all produce a page with no boxes at all,
 * and an empty list of unlabelled boxes is not the same as a screen that works.
 */
export function expectStandardFormScreen({ minBoxes = 1 }: { minBoxes?: number } = {}): void {
  const boxes = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(TYPING_BOXES)];

  expect(
    boxes.length,
    `expected at least ${minBoxes} box a person can type into, found ${boxes.length} — did the screen render?`,
  ).toBeGreaterThanOrEqual(minBoxes);

  const unnamed = boxes.filter((box) => accessibleName(box) === "").map(describe);

  expect(unnamed, "these boxes have no label addressing them").toEqual([]);
}
