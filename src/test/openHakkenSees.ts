import { fireEvent, waitFor } from "@testing-library/react";

/**
 * Open What Hakken sees from the eye in the header, as a reader does
 * (sees-header-and-rolling-dates-plan.md, part one): the box is closed on
 * every screen until the eye opens it, so a test that reads the box's words
 * opens it first. Waits for the eye, which the header draws once the box has
 * published — that is, once the screen's data is in — and is found by its
 * part marker, so a test's wording mocks make no difference. Fails in the
 * default wait when the screen never grows an eye: a box that published
 * nothing, or a screen with none.
 */
export async function openHakkenSees(): Promise<void> {
  const eye = await waitFor(() => {
    const found = document.querySelector<HTMLButtonElement>('[data-part="sees-eye"] button');
    if (!found) throw new Error("No What Hakken sees eye on this screen yet.");
    return found;
  });
  if (eye.getAttribute("aria-expanded") !== "true") fireEvent.click(eye);
}
