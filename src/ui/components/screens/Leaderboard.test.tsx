import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { Leaderboard } from "./Leaderboard";

vi.mock("next/image", () => ({
  default: ({ unoptimized, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { unoptimized?: boolean }) => {
    void unoptimized;
    return React.createElement("img", { ...props, alt: alt ?? "" });
  },
}));

/**
 * The faults this part exists to end, asserted one at a time.
 *
 * Nine copies of this row were written across three screens before it existed,
 * and they disagreed about every one of these: whether the column names sat in
 * the header or were reprinted on each row, what happened to a row with no
 * picture, and how an empty list read. So the tests are the disagreements.
 */

type Person = { id: string; name: string; team: string; image?: string; messages: number };

const PEOPLE: Person[] = [
  { id: "1", name: "Ada Lovelace", team: "Engineering", image: "/ada.png", messages: 272 },
  { id: "2", name: "Grace Hopper", team: "Engineering", messages: 3 },
];

const STATS = [
  { key: "messages", header: "Messages", cell: (person: Person) => person.messages.toLocaleString() },
];

function renderBoard(props: Partial<React.ComponentProps<typeof Leaderboard<Person>>> = {}) {
  return render(
    <Leaderboard<Person>
      rows={PEOPLE}
      rowKey={(person) => person.id}
      nameHeader="Top people"
      name={(person) => person.name}
      sub={(person) => person.team}
      avatar={{ src: (person) => person.image, shape: "circle" }}
      stats={STATS}
      empty="Nobody yet."
      {...props}
    />
  );
}

describe("Leaderboard", () => {
  it("names each column once, in the header, not on every row", () => {
    renderBoard();

    // The fault every copy shared: "MESSAGES" printed inside each of the rows,
    // so a list of six said the word six times.
    expect(screen.getAllByText("Messages")).toHaveLength(1);
    expect(document.querySelectorAll("thead th")).toHaveLength(3);
  });

  it("numbers a ranking", () => {
    renderBoard();

    expect(screen.getByText("#1")).toBeInTheDocument();
    expect(screen.getByText("#2")).toBeInTheDocument();
  });

  it("drops the numbers for a list that is not a race", () => {
    renderBoard({ ranked: false });

    expect(screen.queryByText("#1")).not.toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("stands initials in for a row with no picture", () => {
    // Not a broken row: agents and people carry an empty avatar until somebody
    // uploads one, and passing that empty string to an <img> makes the browser
    // re-request the whole page.
    renderBoard();

    expect(screen.getByText("GR")).toBeInTheDocument();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("says the empty state once, its own way", () => {
    renderBoard({ rows: [] });

    expect(screen.getByText("Nobody yet.")).toBeInTheDocument();
    expect(document.querySelector("tbody")).not.toBeInTheDocument();
  });

  it("waits rather than reporting an empty board while the query is out", () => {
    renderBoard({ rows: undefined, loading: "Counting…" });

    expect(screen.getByText("Counting…")).toBeInTheDocument();
    expect(screen.queryByText("Nobody yet.")).not.toBeInTheDocument();
  });

  it("carries the emphasis a figure asks for", () => {
    renderBoard({
      stats: [
        {
          key: "cost",
          header: "Cost",
          className: "text-destructive",
          cell: (person: Person) => `$${person.messages}.00`,
        },
      ],
    });

    expect(screen.getByText("$272.00")).toHaveClass("text-destructive");
  });
});
