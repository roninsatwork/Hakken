import { act, cleanup, renderWithProviders as render, screen } from "@/src/test/renderWithProviders";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMutation, useQuery } from "convex/react";
import { Globe } from "lucide-react";
import { WebsiteNotFound } from "./WebsiteNotFound";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

/**
 * A super admin who opens a website from another workspace is moved into it, not shown an error (Anthony, 2026-11-07: "we should
 * not see an error"). Only the tab being looked at moves the workspace, and a website that went missing while open waits until its
 * tab is come back to: a tab left open on one company's website moved every workspace chosen elsewhere straight back ("why when i
 * impersonate a workspace does it take me back"). Anyone else, and a website that doesn't exist, sees the message.
 */
let visibility: "visible" | "hidden" = "visible";

function opened(holder: string | null | undefined, { wasOpen = false }: { wasOpen?: boolean } = {}) {
  const impersonate = vi.fn(() => Promise.resolve(true));
  vi.mocked(useQuery).mockImplementation((() => holder) as never);
  vi.mocked(useMutation).mockImplementation((() => impersonate) as never);
  render(<WebsiteNotFound siteId="site1" wasOpen={wasOpen} icon={Globe} title="Website not found" description="This website isn't one your company holds." />);
  return impersonate;
}

function lookAgain(now: "visible" | "hidden") {
  visibility = now;
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a website from another workspace", () => {
  it("opened in the tab being looked at: a super admin is moved into its workspace, with no error", () => {
    const impersonate = opened("company2");
    expect(impersonate).toHaveBeenCalledWith({ companyId: "company2" });
    expect(screen.queryByText("Website not found")).toBeNull();
  });

  it("shows anyone else the message, and moves no one", () => {
    const impersonate = opened(null);
    expect(screen.getByText("Website not found")).toBeTruthy();
    expect(impersonate).not.toHaveBeenCalled();
  });

  it("waits while it's still being asked", () => {
    opened(undefined);
    expect(screen.queryByText("Website not found")).toBeNull();
  });
});

describe("a tab that isn't the one being looked at never moves the workspace", () => {
  it("a website open in a background tab, whose workspace was changed in another, waits and moves nothing", () => {
    visibility = "hidden";
    const impersonate = opened("company2", { wasOpen: true });
    expect(impersonate).not.toHaveBeenCalled();
    expect(screen.queryByText("Website not found")).toBeNull();
  });

  it("coming back to that tab opens its website, in its own workspace", () => {
    visibility = "hidden";
    const impersonate = opened("company2", { wasOpen: true });
    lookAgain("visible");
    expect(impersonate).toHaveBeenCalledWith({ companyId: "company2" });
  });

  it("a workspace changed in the very tab showing the website is left as chosen", () => {
    const impersonate = opened("company2", { wasOpen: true });
    expect(impersonate).not.toHaveBeenCalled();
  });

  it("a website opened in a background tab waits until that tab is looked at", () => {
    visibility = "hidden";
    const impersonate = opened("company2");
    expect(impersonate).not.toHaveBeenCalled();
    lookAgain("visible");
    expect(impersonate).toHaveBeenCalledTimes(1);
  });
});
