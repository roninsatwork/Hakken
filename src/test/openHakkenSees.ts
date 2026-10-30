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
