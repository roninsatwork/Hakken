import { describe, expect, it, vi } from "vitest";
import type { Id } from "@/convex/_generated/dataModel";
import GlobalEvalCaseDetailPage from "./page";

const evalCaseDetailScreen = vi.fn();

vi.mock("@/src/app/(dashboard)/admin/_features/evals/EvalCaseDetailScreen", () => ({
  EvalCaseDetailScreen: (props: { evalCaseId: Id<"companyEvalCases"> }) => {
    evalCaseDetailScreen(props);
    return null;
  },
}));

describe("GlobalEvalCaseDetailPage", () => {
  it("passes the resolved route ID to the shared detail screen", async () => {
    const evalCaseId = "eval-case-1" as Id<"companyEvalCases">;
    const result = await GlobalEvalCaseDetailPage({
      params: Promise.resolve({ evalCaseId }),
    });

    expect(result.props).toEqual({ evalCaseId });
  });
});
