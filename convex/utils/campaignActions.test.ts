import { describe, expect, test } from "vitest";
import { chosenActions } from "./campaignActions";

describe("which things people did get a column", () => {
  test("More Handles' October: the four most counted, with Bought's twin left out", () => {
    const totals = new Map([
      ["add_to_cart", 8778], ["begin_checkout", 3434], ["checkout_complete", 662], ["purchase", 654], ["newsletter_sign_ups", 552],
      ["contact_us_submit", 7], ["contact-us-submit", 7], ["confirmation", 0], ["order_form", 0], ["view_cart", 0],
    ]);
    expect(chosenActions(totals)).toEqual(["add_to_cart", "begin_checkout", "purchase", "newsletter_sign_ups"]);
  });

  test("two spellings of one thing are one column", () => {
    const chosen = chosenActions(new Map([["contact_us_submit", 7], ["contact-us-submit", 7], ["phone_click", 3]]));
    expect(chosen).toHaveLength(2);
    expect(chosen[1]).toBe("phone_click");
  });

  test("a website with no shop keeps its own conversions", () => {
    expect(chosenActions(new Map([["form_submit", 40], ["phone_number_click", 12], ["email_link_click", 9]]))).toEqual(["form_submit", "phone_number_click", "email_link_click"]);
  });

  test("things nobody did get no column, and nothing done means no columns", () => {
    expect(chosenActions(new Map([["purchase", 0], ["contact", 0]]))).toEqual([]);
    expect(chosenActions(new Map())).toEqual([]);
  });

  test("the most it takes is four", () => {
    const totals = new Map([["a", 1000], ["b", 500], ["c", 250], ["d", 120], ["e", 60], ["f", 30]]);
    expect(chosenActions(totals)).toEqual(["a", "b", "c", "d"]);
  });

  test("a purchase is kept, however few, while it's among the four or not", () => {
    const totals = new Map([["a", 1000], ["b", 500], ["c", 250], ["d", 120], ["purchase", 3]]);
    expect(chosenActions(totals)).toEqual(["a", "b", "c", "purchase"]);
  });
});
