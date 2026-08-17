import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useQuery } from "convex/react";

import SpokenVoicePage from "./page";

/**
 * Not on the shared table floor, and deliberately.
 *
 * The voices are a fixed list the platform offers, not records that can come
 * back empty, so a "nothing found" state would describe a situation that cannot
 * happen. What this asserts instead is the spinner while the current setting is
 * being read, and a row per voice once it is.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next-intl", async () => (await import("@/src/test/screenMocks")).nextIntl());
vi.mock("next/navigation", async () => (await import("@/src/test/screenMocks")).nextNavigation());

const setting = {
  voice: "Aoede",
  options: [
    { key: "Aoede", description: "Warm and unhurried." },
    { key: "Puck", description: "Brighter, quicker." },
    { key: "Charon", description: "Lower and steady." },
  ],
};

describe("SpokenVoicePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("spins while the current voice is being read", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<SpokenVoicePage />);

    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("gives every voice a row, on the house measurements", () => {
    vi.mocked(useQuery).mockReturnValue(setting);

    const { container } = render(<SpokenVoicePage />);

    const table = container.querySelector("table");
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(3);

    const row = table?.querySelector("tbody tr");
    expect(row).toHaveClass("border-border-dim/50");
    expect(row?.querySelector("td")).toHaveClass("px-4", "py-3");
  });

  it("marks which voice is in use", () => {
    vi.mocked(useQuery).mockReturnValue(setting);

    render(<SpokenVoicePage />);

    expect(document.body.textContent).toContain("Aoede");
  });
});
