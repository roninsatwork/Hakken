import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import EditGlobalEvalPage from "./page";

vi.mock("@/src/app/(dashboard)/admin/_features/evals/EditEvalScreen", () => ({
  EditEvalScreen: ({ evalCaseId }: { evalCaseId: string }) => (
    <div data-testid="edit-eval-screen">{evalCaseId}</div>
  ),
}));

describe("EditGlobalEvalPage", () => {
  it("forwards the route eval id to the unchanged client screen", async () => {
    render(
      await EditGlobalEvalPage({
        params: Promise.resolve({ evalCaseId: "eval_1" }),
      })
    );

    expect(screen.getByTestId("edit-eval-screen")).toHaveTextContent("eval_1");
  });
});
