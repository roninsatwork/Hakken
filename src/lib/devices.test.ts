import { describe, expect, it } from "vitest";

import { describeDevice } from "./devices";

/**
 * The cases that matter are the browsers that impersonate each other. Edge's
 * own string says "Chrome" and "Safari"; Chrome's says "Safari"; an iPad in
 * desktop mode says "Macintosh". Get the order wrong and every Edge user is
 * recorded as using Chrome.
 */

describe("describeDevice", () => {
  it("names the browser and the machine", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      ),
    ).toBe("Chrome on a Mac");
  });

  it("does not call Edge Chrome, though Edge says it is", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0",
      ),
    ).toBe("Edge on Windows");
  });

  it("does not call Chrome Safari, though Chrome says it is", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/149.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("Chrome on an iPhone");
  });

  it("calls a real Safari Safari", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
      ),
    ).toBe("Safari on a Mac");
  });

  it("does not call an iPad a Mac, though an iPad in desktop mode says it is", () => {
    expect(
      describeDevice(
        "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/604.1",
      ),
    ).toBe("Safari on an iPad");
  });

  it("keeps whatever it was given when it recognises nothing", () => {
    // A device nobody anticipated is still evidence about what signed in.
    expect(describeDevice("SomeNewThing/1.0")).toBe("SomeNewThing/1.0");
  });

  it("says so plainly when there is nothing at all", () => {
    expect(describeDevice("")).toBe("Unknown device");
    expect(describeDevice(null)).toBe("Unknown device");
  });
});
