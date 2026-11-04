import { createElement } from "react";
import { fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { HakkenSeesEye } from "@/src/ui/components/screens/HakkenSeesEye";

/**
 * Open What Hakken sees from the eye, as a reader does
 * (sees-header-and-rolling-dates-plan.md, part one): the box is closed on
 * every screen until the eye opens it, so a test that reads the box's words
 * opens it first. The eye lives in the top bar since 2026-10-30
 * (`Header`, which screen tests leave out), so this mounts one beside the
 * screen when none is on the page — as the top bar would — then waits for it
 * to draw, which it does once the box has published, that is, once the
 * screen's data is in. It is found by its part marker, so a test's wording
 * mocks make no difference. Fails in the default wait when the screen never
 * grows an eye: a box that published nothing, or a screen with none.
 */
export async function openHakkenSees(): Promise<void> {
  if (!document.querySelector("[data-eye-bar]")) {
    const bar = document.createElement("div");
    bar.setAttribute("data-eye-bar", "");
    document.body.appendChild(bar);
    render(createElement(HakkenSeesEye), { container: bar });
  }
  const eye = await waitFor(() => {
    const found = document.querySelector<HTMLButtonElement>('[data-part="sees-eye"] button');
    if (!found) throw new Error("No What Hakken sees eye on this screen yet.");
    return found;
  });
  if (eye.getAttribute("aria-expanded") !== "true") fireEvent.click(eye);
}

/**
 * The sentences in the eye's panel now, as a reader reads them. The words come in one at a time (`SeesWords`, 2026-11-04),
 * each in a piece of its own, so `findByText` can't find a whole sentence, and `queryByText` never finds one: a test that a
 * sentence is missing would pass whatever the panel says. Check that here.
 */
export function saidInPanel(): string[] {
  return [...document.querySelectorAll("[data-part='sees-sentence']")].map((line) => (line.textContent ?? "").trim());
}

/**
 * A sentence in the eye's panel, waited for: fifteen look tests failed with every word on screen until they read it this
 * way. A pattern is looked for in each sentence; plain words must be the whole sentence.
 */
export async function findSaid(words: RegExp | string): Promise<HTMLElement> {
  return await waitFor(() => {
    const lines = [...document.querySelectorAll<HTMLElement>("[data-part='sees-sentence']")];
    const found = lines.find((line) => {
      const said = (line.textContent ?? "").trim();
      return typeof words === "string" ? said === words : words.test(said);
    });
    if (!found) throw new Error(`The eye's panel doesn't say ${String(words)}. It says: ${saidInPanel().join(" | ") || "nothing yet"}`);
    return found;
  });
}
