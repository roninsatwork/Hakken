"use client";

import type { ReactNode } from "react";
import Image from "next/image";

import { CompactList, type CompactListColumn } from "./CompactList";

/**
 * A ranked list of who used the most of something.
 *
 * The same row — a picture, a name, a quieter line under it, and figures on the
 * right — was written out nine times across three screens: three on AI Running
 * Costs, three on a company's AI Usage, three on the client Settings screen.
 * None of them had copied the kit, so no rule saw them; they had copied each
 * other, and by 2026-08-23 they no longer agreed.
 *
 * The AI Costs three drew their dividing line with a hard-coded
 * `#0000000d`/`#ffffff0d` that ignores the theme, and the other six used the
 * token. Two screens had a `LeaderboardAvatar` that falls back to initials; the
 * third inlined `next/image` and passed it an empty `src`, which makes the
 * browser re-request the page. Three of the nine had the class words in a
 * different order. Two spelled the empty state one way and one another way.
 *
 * What it owns:
 *
 * - **The column headings, said once.** Every copy printed "MESSAGES" and
 *   "COST" inside each row, because there was no header row to put them in. A
 *   list of six then reads the word "COST" six times.
 * - **The rank.** Optional, because two of the nine are a provider breakdown
 *   rather than a race, and they used the same row without a number.
 * - **The picture, and its absence.** A row with no picture is the normal case,
 *   not a broken one: agents and people carry an empty avatar string until
 *   somebody uploads something. The initials stand in and no image element is
 *   rendered at all.
 * - **One empty state.**
 *
 * It is built on `CompactList` rather than `DataTable` for the reason that part
 * exists: this is a run of rows inside a panel that has already introduced
 * itself, not a screen's own records. `CompactList` also reports the row count,
 * which none of the nine did — a leaderboard of six and a leaderboard of sixty
 * read identically until you counted them yourself.
 */

export type LeaderboardStat<Row> = {
  key: string;
  /** Said once at the top of the column, never on the row. */
  header: string;
  cell: (row: Row) => ReactNode;
  /** Emphasis the figure needs — cost reads in the destructive tone. */
  className?: string;
};

type LeaderboardProps<Row> = {
  /** `undefined` while the query is still out, which draws the loading line. */
  rows: Row[] | undefined;
  rowKey: (row: Row) => string;
  /** The heading over the name column. */
  nameHeader: string;
  name: (row: Row) => ReactNode;
  /** The quieter second line — a company, an email, "Autonomous process". */
  sub?: (row: Row) => ReactNode;
  /**
   * The picture. Omit entirely for a list that has none; the rows then start at
   * the name and nothing reserves space for a frame that never arrives.
   */
  avatar?: {
    src: (row: Row) => string | undefined;
    /** Circle for a person, rounded for a workspace or an agent. */
    shape: "circle" | "rounded";
  };
  stats: LeaderboardStat<Row>[];
  empty: string;
  loading?: string;
  /**
   * A numbered ranking.
   *
   * On for "top companies", off for a provider breakdown: the providers list is
   * everything there is rather than the leaders of a longer list, and numbering
   * it implies a race it is not in.
   */
  ranked?: boolean;
};

type Ranked<Row> = { row: Row; rank: number };

const AVATAR_FRAME = "w-8 h-8 bg-foreground/10 border border-border-dim/50 shrink-0";

function LeaderboardAvatar({
  src,
  name,
  shape,
}: {
  src?: string;
  name: string;
  shape: "circle" | "rounded";
}) {
  const frame = `${AVATAR_FRAME} ${shape === "circle" ? "rounded-full" : "rounded-[8px]"}`;

  if (!src) {
    return (
      <div className={`${frame} flex items-center justify-center text-[10px] font-bold text-foreground`}>
        {name.substring(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <Image src={src} alt={name} width={32} height={32} unoptimized className={`${frame} object-cover`} />
  );
}

/** The name as plain text, for the avatar's initials and its alt text. */
function textOf(value: ReactNode): string {
  return typeof value === "string" ? value : "";
}

export function Leaderboard<Row>({
  rows,
  rowKey,
  nameHeader,
  name,
  sub,
  avatar,
  stats,
  empty,
  loading,
  ranked = true,
}: LeaderboardProps<Row>) {
  const numbered: Ranked<Row>[] | undefined = rows?.map((row, index) => ({ row, rank: index + 1 }));

  const columns: CompactListColumn<Ranked<Row>>[] = [];

  if (ranked) {
    columns.push({
      key: "rank",
      className: "w-8 text-[13px] font-mono font-bold text-muted/40",
      cell: (entry) => `#${entry.rank}`,
    });
  }

  columns.push({
    key: "name",
    header: nameHeader,
    cell: (entry) => (
      <span className="flex min-w-0 items-center gap-3">
        {avatar ? (
          <LeaderboardAvatar
            src={avatar.src(entry.row)}
            name={textOf(name(entry.row))}
            shape={avatar.shape}
          />
        ) : null}
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-semibold leading-tight tracking-wide text-foreground">
            {name(entry.row)}
          </span>
          {sub ? (
            <span className="truncate text-[10px] tracking-wide text-secondary/70">{sub(entry.row)}</span>
          ) : null}
        </span>
      </span>
    ),
  });

  for (const stat of stats) {
    columns.push({
      key: stat.key,
      header: stat.header,
      align: "right",
      className: "w-[92px] whitespace-nowrap",
      cell: (entry) => (
        <span className={`text-[13px] font-bold tracking-tight ${stat.className ?? "text-foreground"}`}>
          {stat.cell(entry.row)}
        </span>
      ),
    });
  }

  return (
    <CompactList<Ranked<Row>>
      rows={numbered}
      rowKey={(entry) => rowKey(entry.row)}
      columns={columns}
      // A leaderboard always sits in a large panel, so its empty line is given
      // room and centred rather than tucked against the left edge — where it
      // read as a stray sentence in an otherwise blank card.
      empty={<span className="block py-8 text-center text-[12px] text-secondary">{empty}</span>}
      loading={
        loading ? (
          <span className="block py-8 text-center text-[12px] text-secondary">{loading}</span>
        ) : undefined
      }
      className="px-2 py-1"
    />
  );
}
