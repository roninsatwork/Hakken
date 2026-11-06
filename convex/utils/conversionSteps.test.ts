import { describe, expect, it } from "vitest";
import { endingsOf, eventKind, isFirstStep, isShop, serviceSteps, shopSteps, squaresOutOf } from "./conversionSteps";

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

describe("the steps a website's events make", () => {
  it("calls a click a first step and a form the real thing", () => {
    expect(isFirstStep("click-apply-now")).toBe(true);
    expect(isFirstStep("click-footer-email")).toBe(true);
    expect(isFirstStep("Chat Opened")).toBe(true);
    expect(isFirstStep("Chat Shown")).toBe(true);
    expect(isFirstStep("form-submit-contact-us")).toBe(false);
    expect(isFirstStep("form-submit-book-a-visit")).toBe(false);
    expect(isFirstStep("Chat Offline Message Sent")).toBe(false);
    expect(isFirstStep("contact")).toBe(false);
    expect(isFirstStep("Newsletter_Signup")).toBe(false);
    expect(isFirstStep("form_submit")).toBe(false);
  });

  it("goes out of 1,000 only when the thing that counts is rare", () => {
    expect(squaresOutOf(29, 1000)).toBe(100);
    expect(squaresOutOf(28, 1000)).toBe(100);
    expect(squaresOutOf(16, 1000)).toBe(1000);
    expect(squaresOutOf(3, 1000)).toBe(1000);
    expect(squaresOutOf(0, 0)).toBe(100);
  });

  it("knows a shop from the connection, or from anything bought", () => {
    expect(isShop(true, 0, 0)).toBe(true);
    expect(isShop(false, 1, 0)).toBe(true);
    expect(isShop(false, 0, 1)).toBe(true);
    expect(isShop(undefined, null, undefined)).toBe(false);
  });

  it("works out a shop's steps and how its visits ended, on More Handles' October", () => {
    const events = ["purchase", "add_to_cart", "begin_checkout"];
    const steps = shopSteps({ visits: 35739, stayed: 22000, did: [1205, 5000, 2200] }, events);
    expect(steps).toEqual([35739, 22000, 5000, 2200, 1205]);
    expect(endingsOf(steps)).toEqual([13739, 17000, 2800, 995, 1205]);
  });

  it("works out a service website's steps, counting a visit doing two things in both", () => {
    const events = ["click-apply-now", "form-submit-contact-us"];
    expect(serviceSteps({ visits: 1000, stayed: 500, did: [6, 4] }, events)).toEqual([1000, 500, 10, 4]);
  });

  it("never lets a step go below nought, when a visit doing two things makes a later step bigger", () => {
    expect(endingsOf([100, 10, 20, 5])).toEqual([90, 0, 15, 5]);
  });
});
