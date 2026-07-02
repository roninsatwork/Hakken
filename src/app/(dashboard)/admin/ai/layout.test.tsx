import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import GlobalAiLayout from "./layout";

describe("GlobalAiLayout", () => {
  it("only provides layout spacing so pages can render navigation below their headers", () => {
    render(<GlobalAiLayout><main>AI page</main></GlobalAiLayout>);

    expect(screen.queryByRole("navigation", { name: "Artificial intelligence sections" })).not.toBeInTheDocument();
    expect(screen.getByText("AI page")).toBeInTheDocument();
  });
});
