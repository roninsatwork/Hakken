import { describe, expect, test } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { TableFilterSelect } from "./TableControls";
import { LAYER, layerValue } from "@/src/ui/lib/layers";

/**
 * The filter dropdown opened underneath the rows below it.
 *
 * The Comax customers screen stacks three control bars, each correctly on
 * `PAGE_CHROME` and each blurred — and a blurred, positioned element is a
 * stacking context, which traps whatever it contains. So the panel could not
 * rise above the two bars beneath it however large its own z-index, and equal
 * siblings are settled by document order: the bars below won, and the chain
 * names showed through them.
 *
 * The fix is a portal, which is easy to undo by accident — moving the panel
 * back beside its trigger looks tidier and reads fine in review. These tests
 * are the reason not to.
 */

const CHAINS = ["ALLEGRA CARE", "COLTEN CARE", "DAISH'S HOTELS"];

function renderSelect(props: Partial<Parameters<typeof TableFilterSelect>[0]> = {}) {
  const onChange = props.onChange ?? (() => {});
  render(
    <div style={{ backdropFilter: "blur(4px)" }} className={LAYER.PAGE_CHROME}>
      <TableFilterSelect
        label="Chain"
        options={CHAINS}
        value={null}
        onChange={onChange}
        allLabel="All"
        filterPlaceholder="Type to narrow..."
        noMatchesLabel="No matches"
        {...props}
      />
    </div>
  );
  return screen.getByRole("button", { name: /Chain/ });
}

describe("TableFilterSelect", () => {
  test("opens its panel outside the bar that contains the trigger", () => {
    const trigger = renderSelect();
    fireEvent.click(trigger);

    const list = screen.getByRole("listbox");
    // The trigger's bar is the thing that trapped it. Escaping to the body is
    // the whole fix: anywhere still inside that subtree is the old bug.
    expect(trigger.closest("div")?.contains(list)).toBe(false);
    expect(document.body.contains(list)).toBe(true);
  });

  test("puts the panel on a layer that clears sibling page chrome", () => {
    const trigger = renderSelect();
    fireEvent.click(trigger);

    const panel = screen.getByRole("listbox").parentElement;
    expect(panel?.className).toContain(LAYER.PAGE_MENU);
    // Above every bar on the page, and still below the account menu.
    expect(layerValue("PAGE_MENU")).toBeGreaterThan(layerValue("PAGE_CHROME"));
    expect(layerValue("PAGE_MENU")).toBeLessThan(layerValue("HEADER"));
  });

  test("still reports a choice once the panel is no longer inside the trigger", () => {
    // Guards the half of the portal that is easy to miss: the outside-click
    // handler now has two insides. Miss the second and mousedown in the list
    // unmounts the option before its click lands, so every choice is ignored.
    const chosen: (string | null)[] = [];
    const trigger = renderSelect({ onChange: (next) => chosen.push(next) });
    fireEvent.click(trigger);

    const option = screen.getByRole("option", { name: /COLTEN CARE/ });
    fireEvent.mouseDown(option);
    fireEvent.click(option);

    expect(chosen).toEqual(["COLTEN CARE"]);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  test("closes on a mousedown that is outside both the trigger and the panel", () => {
    const trigger = renderSelect();
    fireEvent.click(trigger);
    expect(screen.getByRole("listbox")).toBeTruthy();

    fireEvent.mouseDown(document.body);

    expect(screen.queryByRole("listbox")).toBeNull();
  });
});
