import { renderWithProviders as render } from "@/src/test/renderWithProviders";
import { describe, it, vi } from "vitest";
import { useQuery } from "convex/react";
import { getFunctionName } from "convex/server";

import { expectApprovedLook } from "@/src/test/lookOutline";
import AssistantWelcomePage from "./page";

/**
 * Ask Hakken holds to the look Anthony signed off on the "Ask Hakken — your
 * websites" canvas, 2026-10-07 (docs/plans/active/keep-less-history-plan.md,
 * part 6; design-drift-plan D4): rendered in English as a super admin viewing
 * as Period House Group, it reads as the outline saved beside the board in
 * docs/plans/assets/keep-less-history/look/.
 */

vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
vi.mock("next/navigation", () => ({
  usePathname: () => "/app/assistant",
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("next/link", async () => (await import("@/src/test/screenMocks")).nextLink());
vi.mock("@/src/context/SystemSettingsContext", () => ({ useSystemSettings: () => ({ platformName: "Hakken" }) }));
vi.mock("@/src/hooks/useVoiceToText", () => ({
  useVoiceToText: () => ({ isRecording: false, isTranscribing: false, permissionError: false, setPermissionError: vi.fn(), toggleRecording: vi.fn() }),
}));

const ANSWERS: Record<string, unknown> = {
  "users:getMe": { _id: "user_1", name: "Anthony Basker", role: "SUPER_ADMIN", impersonatingCompanyId: "company_phg" },
  "aiModels:getActiveModels": [{ _id: "model_1", modelId: "model-fast", displayName: "Fast", isEnabled: true, isDefault: true }],
  "sites:listPickerHolds": [
    { siteId: "hold_own", host: "morehandles.co.uk", relationship: "OWNED", ofHost: null, ofSiteId: null, iconUrl: null },
    { siteId: "hold_rival", host: "corston.com", relationship: "TRACKED", ofHost: "morehandles.co.uk", ofSiteId: "hold_own", iconUrl: null },
  ],
};

const nameOf = (reference: unknown) => {
  try {
    return getFunctionName(reference as never);
  } catch {
    return "";
  }
};

describe("Ask Hakken's signed-off look", () => {
  it("as Period House Group: answering for its own website, under Hakken's mark, with questions about Hakken", async () => {
    vi.mocked(useQuery).mockImplementation(((reference: unknown, args?: unknown) => (args === "skip" ? undefined : ANSWERS[nameOf(reference)])) as never);
    const { container } = render(<AssistantWelcomePage />);
    await expectApprovedLook(container, "keep-less-history", "Main", "Ask Hakken");
  });
});
