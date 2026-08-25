import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { act, screen } from "@testing-library/react";
import { useQuery } from "convex/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReceptionPage from "./page";

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());

vi.mock("@/src/ui/components/layout/Header", () => ({
  default: () => <header>Header</header>,
}));

describe("ReceptionPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the header and title while the reception query is unresolved", () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    render(<ReceptionPage />);

    expect(screen.getByRole("banner")).toHaveTextContent("Header");
    expect(screen.getByRole("heading", { name: "Reception" })).toBeInTheDocument();
    expect(screen.queryByText("Your reception screen")).not.toBeInTheDocument();
    expect(screen.queryByText("No reception screen is switched on yet.")).not.toBeInTheDocument();
  });

  it("renders the unchanged empty state after the query resolves", async () => {
    vi.mocked(useQuery).mockReturnValue([] as unknown as ReturnType<typeof useQuery>);

    await act(async () => {
      render(<ReceptionPage />);
      await import("./ReceptionResults");
    });

    expect(screen.getByText("No reception screen is switched on yet.")).toBeInTheDocument();
    expect(
      screen.getByText("An administrator switches one on from the widget's settings. Once it's on, it appears here ready to open.")
    ).toBeInTheDocument();
  });

  it("renders the unchanged reception card, link, and usage details", async () => {
    vi.mocked(useQuery).mockReturnValue([
      {
        widgetId: "front-desk",
        name: "Front desk",
        lastSeenAt: 1_700_000_000_000,
        sessionCount: 12,
      },
    ] as unknown as ReturnType<typeof useQuery>);

    await act(async () => {
      render(<ReceptionPage />);
      await import("./ReceptionResults");
    });

    expect(screen.getByText("Your reception screen")).toBeInTheDocument();
    expect(screen.getByText("Front desk")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the screen" })).toHaveAttribute(
      "href",
      "/kiosk/front-desk"
    );
    expect(screen.getByText(/12 conversations so far/)).toBeInTheDocument();
  });
});
