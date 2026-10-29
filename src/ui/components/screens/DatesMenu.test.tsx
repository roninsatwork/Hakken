import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DatesMenu, spanWords, type DateChoice } from "./DatesMenu";

vi.mock("next-intl", async () => {
  const base = (await import("@/src/test/screenMocks")).nextIntl();
  const en = (await import("@/messages/en.json")).default as unknown as { common: { periods: Record<string, string> } };
  return {
    ...base,
    useLocale: () => "en-GB",
    useTranslations: () => (key: string) => en.common.periods[key] ?? key,
  };
});

// Thursday 29 October 2026 in the UK, the canvas's day.
beforeEach(() => vi.setSystemTime(new Date("2026-10-29T10:00:00Z")));
afterEach(() => vi.useRealTimers());

/** The Dates menu (board 1 of the canvas of 2026-10-29): each choice with the days it covers, and custom dates. */
describe("DatesMenu", () => {
  it("names its choice on the chip, and lists the seven periods with the days each covers to the newest day held", () => {
    const onChange = vi.fn();
    render(<DatesMenu value={{ period: "lastMonth" }} newest="2026-10-28" onChange={onChange} />);
    const chip = screen.getByRole("button", { name: /Dates: Last month/ });
    expect(chip).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(chip);
    const items = screen.getAllByRole("menuitemradio");
    expect(items.map((item) => item.textContent)).toEqual([
      "This week26–28 Oct",
      "Last week19–25 Oct",
      "This month1–28 Oct",
      "Last month1–30 Sept",
      "Last 3 months29 Jul – 28 Oct",
      "Last 6 months29 Apr – 28 Oct",
      "Last 12 months29 Oct 2025 – 28 Oct 2026",
    ]);
    expect(items[3]).toHaveAttribute("aria-checked", "true");
    fireEvent.click(items[4]);
    expect(onChange).toHaveBeenCalledWith({ period: "last3Months" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("offers custom dates: a first and a last day, shown on Show, and says them on the chip", () => {
    const onChange = vi.fn();
    const { rerender } = render(<DatesMenu value={{ period: "lastMonth" }} newest="2026-10-28" oldest="2026-01-01" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /Dates:/ }));
    fireEvent.change(screen.getByLabelText("First day"), { target: { value: "2026-09-15" } });
    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2026-10-14" } });
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(onChange).toHaveBeenCalledWith({ period: "custom", from: "2026-09-15", to: "2026-10-14" });
    const custom: DateChoice = { period: "custom", from: "2026-09-15", to: "2026-10-14" };
    rerender(<DatesMenu value={custom} newest="2026-10-28" onChange={onChange} />);
    expect(screen.getByRole("button", { name: /Dates: 15 Sept – 14 Oct/ })).toBeInTheDocument();
    // Dates the source does not hold cannot be shown.
    fireEvent.click(screen.getByRole("button", { name: /Dates:/ }));
    fireEvent.change(screen.getByLabelText("Last day"), { target: { value: "2026-10-30" } });
    expect(screen.getByRole("button", { name: "Show" })).toBeDisabled();
  });

  it("leaves custom dates out where a section cannot answer them, and closes on Escape", () => {
    render(<DatesMenu value={{ period: "thisWeek" }} newest={null} custom={false} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Dates:/ }));
    expect(screen.queryByText("Custom dates…")).toBeNull();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("says a span's days within a month, a year, or across two", () => {
    expect(spanWords("2026-10-26", "2026-10-28", "en-GB")).toBe("26–28 Oct");
    expect(spanWords("2026-07-29", "2026-10-28", "en-GB")).toBe("29 Jul – 28 Oct");
    expect(spanWords("2025-10-29", "2026-10-28", "en-GB")).toBe("29 Oct 2025 – 28 Oct 2026");
  });
});
