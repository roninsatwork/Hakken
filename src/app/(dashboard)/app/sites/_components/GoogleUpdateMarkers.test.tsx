import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import { chartDates, datedRow } from "./datedRows";
import {
  GOOGLE_UPDATE_LOOK,
  GoogleUpdateCard,
  GoogleUpdateKey,
  GoogleUpdateMarks,
  dayX,
  placeMarkers,
  type GoogleUpdate,
} from "./GoogleUpdateMarkers";

/**
 * The approved look of Google's updates on the Sites charts, number by number
 * (docs/plans/active/knowledge-news-and-digest-plan.md, "The approved look —
 * build exactly this", approved 2026-09-30). A failure here means the look
 * changed: change the plan's table first, with a date, then this.
 */

const MARCH: GoogleUpdate = {
  _id: "update-march" as GoogleUpdate["_id"],
  title: "March 2025 core update",
  description: "Google improved how it finds the most helpful pages for a search. It took two weeks to roll out.",
  startedOn: "2025-03-13",
  finishedOn: "2025-03-27",
  url: "https://status.search.google.com/",
};

const inWords = (children: ReactNode) => (
  <NextIntlClientProvider locale="en" messages={en}>{children}</NextIntlClientProvider>
);

describe("the approved numbers", () => {
  it("are the plan's table", () => {
    expect(GOOGLE_UPDATE_LOOK.line).toEqual({ width: 1, dash: "4 4", opacity: 0.55 });
    expect(GOOGLE_UPDATE_LOOK.logo).toBe(14);
    expect(GOOGLE_UPDATE_LOOK.circle).toBe(22);
    expect(GOOGLE_UPDATE_LOOK.circleEdgeOpacity).toBe(0.2);
    expect(GOOGLE_UPDATE_LOOK.apart).toBe(24);
    expect(GOOGLE_UPDATE_LOOK.card).toMatchObject({ width: 300, radius: 12, paddingX: 14, paddingY: 12 });
    expect(GOOGLE_UPDATE_LOOK.cardLogo).toBe(16);
    expect(GOOGLE_UPDATE_LOOK.keyLogo).toBe(12);
  });
});

describe("where a marker goes along the axis", () => {
  const monthly = [
    { day: "2025-02-01", x: 0 },
    { day: "2025-03-01", x: 100 },
    { day: "2025-04-01", x: 200 },
  ];

  it("puts 13 March about two-fifths of the way from March to April, never on a point", () => {
    const x = dayX("2025-03-13", monthly, 1000);
    expect(x).toBeCloseTo(100 + (12 / 31) * 100, 5);
    expect(x).not.toBe(100);
  });

  it("goes on from the last point at the same pace, never past the plot's right edge", () => {
    expect(dayX("2025-04-15", monthly, 1000)).toBeCloseTo(200 + (14 / 31) * 100, 5);
    expect(dayX("2025-04-28", monthly, 220)).toBe(220);
  });

  it("marks nothing before the first point", () => {
    expect(dayX("2025-01-31", monthly, 1000)).toBeNull();
    expect(placeMarkers([{ startedOn: "2025-01-31" }], monthly, { left: 0, right: 1000 })).toEqual([]);
  });

  it("moves the later of two close logos right to 24px from the earlier, each line staying at its date", () => {
    const daily = [
      { day: "2025-03-12", x: 0 },
      { day: "2025-03-13", x: 10 },
      { day: "2025-03-14", x: 20 },
      { day: "2025-03-15", x: 30 },
    ];
    const placed = placeMarkers([{ startedOn: "2025-03-14" }, { startedOn: "2025-03-13" }], daily, { left: 0, right: 1000 });
    expect(placed.map((mark) => [mark.update.startedOn, mark.lineX, mark.logoX])).toEqual([
      ["2025-03-13", 10, 10],
      ["2025-03-14", 20, 34],
    ]);
  });

  it("draws close logos back in from the right edge, still 24px apart", () => {
    const daily = [
      { day: "2025-03-13", x: 90 },
      { day: "2025-03-14", x: 100 },
    ];
    const placed = placeMarkers([{ startedOn: "2025-03-13" }, { startedOn: "2025-03-14" }], daily, { left: 0, right: 100 });
    expect(placed.map((mark) => mark.logoX)).toEqual([76, 100]);
  });
});

describe("which charts run over dates", () => {
  it("is every chart whose every row carries its day, to the newest day its last row covers", () => {
    const rows = [datedRow({ day: "2025-03-01", lastDay: "2025-03-31" }, { a: 1 }), datedRow({ day: "2025-04-01", lastDay: "2025-04-12" }, { a: 2 })];
    expect(chartDates(rows)).toEqual({ days: ["2025-03-01", "2025-04-01"], from: "2025-03-01", to: "2025-04-12" });
  });

  it("is never a chart of named things", () => {
    expect(chartDates([{ label: "ChatGPT", share: 40 }])).toBeNull();
    expect(chartDates([])).toBeNull();
  });
});

describe("the marker", () => {
  const draw = () => render(
    <svg>
      <GoogleUpdateMarks
        marks={[{ update: MARCH, lineX: 120, logoX: 120 }]}
        top={8}
        axis={230}
        openId={null}
        label={(update) => `Google update: ${update.title}`}
        onOpen={vi.fn()}
        onClose={vi.fn()}
      />
    </svg>,
  );

  it("is a 1px line dashed 4 on 4 off, in the foreground at 55%, from the plot's top to the x-axis line", () => {
    const { container } = draw();
    const line = container.querySelector("[data-google-update-line]")!;
    expect(line.getAttribute("stroke")).toBe("currentColor");
    expect(line.parentElement!.getAttribute("class")).toContain("text-foreground");
    expect([line.getAttribute("stroke-width"), line.getAttribute("stroke-dasharray"), line.getAttribute("stroke-opacity")]).toEqual(["1", "4 4", "0.55"]);
    expect([line.getAttribute("x1"), line.getAttribute("x2"), line.getAttribute("y1"), line.getAttribute("y2")]).toEqual(["120", "120", "8", "230"]);
  });

  it("has the 14px G centred on a 22px circle in the card colour, edged 1px at 20%, centred on the x-axis line", () => {
    const { container } = draw();
    const circle = container.querySelector("[data-google-update-logo]")!;
    expect([circle.getAttribute("cx"), circle.getAttribute("cy"), circle.getAttribute("r")]).toEqual(["120", "230", "11"]);
    expect([circle.getAttribute("fill"), circle.getAttribute("stroke-width"), circle.getAttribute("stroke-opacity")]).toEqual(["var(--color-card)", "1", "0.2"]);
    const mark = circle.nextElementSibling!;
    expect([mark.tagName, mark.getAttribute("width"), mark.getAttribute("x"), mark.getAttribute("y")]).toEqual(["svg", "14", "113", "223"]);
  });

  it("is named for a screen reader and opens its card from the keyboard", () => {
    draw();
    expect(screen.getByRole("button", { name: "Google update: March 2025 core update" }).getAttribute("tabindex")).toBe("0");
  });
});

describe("the hover card", () => {
  it("is 300px of card colour with a 1px dim edge, 12px corners, the popover shadow and 12px by 14px padding, above the logo", () => {
    const { container } = render(inWords(<GoogleUpdateCard update={MARCH} x={400} y={230} width={900} />));
    const card = container.querySelector<HTMLElement>("[data-google-update-card]")!;
    for (const name of ["rounded-[12px]", "border", "border-border-dim", "bg-card", "shadow-lg", "-translate-y-full"]) {
      expect(card.className.split(" ")).toContain(name);
    }
    expect(card.style.width).toBe("300px");
    expect(card.style.padding).toBe("12px 14px");
    expect(card.style.left).toBe("250px");
    expect(card.style.top).toBe(`${230 - 11 - 8}px`);
  });

  it("holds the 16px G and the title, then when it started and finished, then the description, and nothing else", () => {
    const { container } = render(inWords(<GoogleUpdateCard update={MARCH} x={400} y={230} width={900} />));
    const card = container.querySelector("[data-google-update-card]")!;
    const [heading, dates, description] = Array.from(card.children);
    expect(card.children).toHaveLength(3);
    expect(heading.querySelector("svg")!.getAttribute("width")).toBe("16");
    expect(heading.textContent).toBe("March 2025 core update");
    expect(heading.querySelector("span")!.className).toContain("text-[13px] font-medium");
    expect(dates.textContent).toBe("Started 13 Mar 2025 · Finished 27 Mar 2025");
    expect(dates.className).toContain("text-[12px] text-secondary");
    expect(description.textContent).toBe(MARCH.description);
    expect(description.className).toContain("text-[12px] text-foreground");
  });

  it("says it is still rolling out when no finish date is set", () => {
    const { container } = render(inWords(<GoogleUpdateCard update={{ ...MARCH, finishedOn: null }} x={400} y={230} width={900} />));
    expect(container.querySelector("[data-google-update-card] p")!.textContent).toBe("Started 13 Mar 2025 · Still rolling out");
  });

  it("stays inside the chart's edges", () => {
    const left = render(inWords(<GoogleUpdateCard update={MARCH} x={20} y={230} width={900} />));
    expect(left.container.querySelector<HTMLElement>("[data-google-update-card]")!.style.left).toBe("0px");
    left.unmount();
    const right = render(inWords(<GoogleUpdateCard update={MARCH} x={890} y={230} width={900} />));
    expect(right.container.querySelector<HTMLElement>("[data-google-update-card]")!.style.left).toBe("600px");
    right.unmount();
    const narrow = render(inWords(<GoogleUpdateCard update={MARCH} x={100} y={230} width={240} />));
    expect(narrow.container.querySelector<HTMLElement>("[data-google-update-card]")!.style.width).toBe("240px");
  });
});

describe("the key", () => {
  it("is the 12px G and \"Google update\"", () => {
    const { container } = render(<GoogleUpdateKey label={en.sites.googleUpdates.legend} />);
    expect(container.querySelector("svg")!.getAttribute("width")).toBe("12");
    expect(container.textContent).toBe("Google update");
  });
});
