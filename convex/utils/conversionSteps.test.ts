import { describe, expect, it } from "vitest";
import { eventKind } from "./conversionSteps";

describe("eventKind", () => {
  it("sorts a shop's events by their names", () => {
    expect(eventKind("purchase")).toBe("sales");
    expect(eventKind("checkout_complete")).toBe("sales");
    expect(eventKind("add_to_cart")).toBe("buying");
    expect(eventKind("begin_checkout")).toBe("buying");
    expect(eventKind("view_cart")).toBe("buying");
  });

  it("sorts ways of getting in touch by their names", () => {
    expect(eventKind("contact_us_submit")).toBe("touch");
    expect(eventKind("contact-us-submit")).toBe("touch");
    expect(eventKind("newsletter_sign_ups")).toBe("touch");
    expect(eventKind("form_submit_prospectus")).toBe("touch");
    expect(eventKind("click_tel")).toBe("touch");
    expect(eventKind("book_a_visit")).toBe("touch");
  });

  it("calls anything else other, rather than guessing", () => {
    expect(eventKind("ua_5__minutes_on_site")).toBe("other");
    expect(eventKind("wholesale_page")).toBe("other");
  });

  it("says an event that isn't happening is that, whatever its name says", () => {
    expect(eventKind("purchase", true)).toBe("quiet");
    expect(eventKind("view_cart", true)).toBe("quiet");
  });
});
