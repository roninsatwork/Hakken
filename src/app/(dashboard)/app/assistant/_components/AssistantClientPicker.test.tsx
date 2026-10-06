import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithProviders, screen } from "@/src/test/renderWithProviders";
import type { Id } from "@/convex/_generated/dataModel";
import { AssistantClientPicker, clientThreadArgs } from "./AssistantClientPicker";

const conterra = "company_conterra" as Id<"companies">;
const korda = "company_korda" as Id<"companies">;

vi.mock("convex/react", () => ({
  useQuery: () => [
    { _id: "company_conterra", name: "Conterra Ops" },
    { _id: "company_korda", name: "Korda" },
  ],
}));

/** The client picker above Ask Hakken's message box (assistant-foundation-plan.md, item 8). */
describe("the client picker", () => {
  it("opens on the company being viewed as, and lists the clients and the platform", () => {
    const onChoose = vi.fn();
    renderWithProviders(<AssistantClientPicker choice={null} viewingAs={conterra} onChoose={onChoose} />);

    expect(screen.getByText("Answering for")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Conterra Ops/ }));
    expect(screen.getByRole("option", { name: "Conterra Ops", selected: true })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "Korda" }));
    expect(onChoose).toHaveBeenCalledWith({ kind: "company", companyId: korda });
  });

  it("tells createThread nothing for the company being viewed as, the client or the platform otherwise", () => {
    expect(clientThreadArgs(null, conterra)).toEqual({});
    expect(clientThreadArgs({ kind: "company", companyId: conterra }, conterra)).toEqual({});
    expect(clientThreadArgs({ kind: "company", companyId: korda }, conterra)).toEqual({ forCompanyId: korda });
    expect(clientThreadArgs({ kind: "platform" }, conterra)).toEqual({ forPlatform: true });
  });
});
