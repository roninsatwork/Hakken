"use client";

import { useTranslations } from "next-intl";
import { Button } from "./Button";
import { Checkbox } from "./Checkbox";
import type { DataTableColumn } from "./DataTable";

/**
 * Tick boxes down a table, how many are ticked, and Clear all and Select top as buttons beside its download (Anthony, 2026-11-05:
 * "we need a deleted all and select all again", "this needs to be a standard table component that we can reuse"; his Way 3). A
 * table whose ticks choose what something else on the page shows takes these parts whole: Funnel's route chart and All pages' chart do.
 *
 * Select top takes the first rows in the order the table is showing, so a reader can sort by a column and then take its top
 * ten. It reads the page of the table in view, as that's all the screen holds. The page owns where the ticks are kept.
 */
export type TableTicks = {
  /** The rows ticked, by their keys. */
  keys: readonly string[];
  /** The whole new list of ticks. */
  set: (keys: string[]) => void;
  /** The most that can be ticked at once. */
  most: number;
  /** Why a row can't be ticked once the most are: said on its box. */
  limit: string;
};

type TickRows<Row> = {
  rowKey: (row: Row) => string;
  /** A row with nothing to choose, such as a page nobody viewed in these dates: no box. Every row has one if left out. */
  canTick?: (row: Row) => boolean;
};

/** The first column of a table with ticks. */
export function tickColumn<Row>(ticks: TableTicks, { rowKey, canTick, label, heading }: TickRows<Row> & {
  /** What the box does, for whoever is listening: "Draw this page on the chart". */
  label: (row: Row) => string;
  /** The column's name, for whoever is listening. */
  heading: string;
}): DataTableColumn<Row> {
  return {
    key: "tick",
    header: "",
    hiddenHeader: heading,
    className: "w-11",
    cell: (row) => {
      if (canTick && !canTick(row)) return null;
      const key = rowKey(row);
      const checked = ticks.keys.includes(key);
      const reason = !checked && ticks.keys.length >= ticks.most ? ticks.limit : undefined;
      return (
        // The tick is the row's own control: its click must not open the row.
        <span className="flex" title={reason} onClick={(event) => event.stopPropagation()}>
          <Checkbox
            label={label(row)}
            labelHidden
            checked={checked}
            disabled={Boolean(reason)}
            title={reason}
            onChange={(next) => ticks.set(next ? [...ticks.keys.filter((one) => one !== key), key] : ticks.keys.filter((one) => one !== key))}
          />
        </span>
      );
    },
  };
}

/** How many are ticked, for the table's bar, beside its count. */
export function TickCount({ ticks }: { ticks: Pick<TableTicks, "keys" | "most"> }) {
  const t = useTranslations("ui.tableTicks");
  return <span className="text-[12px] text-secondary">{t("onChart", { count: ticks.keys.length, most: ticks.most })}</span>;
}

/** The look of the table's download beside them: buttons, the same height, so they read as a set (Anthony, 2026-11-05). */
const BAR_BUTTON = "inline-flex items-center whitespace-nowrap px-3 py-2";

/** Clear all and Select top, for the table's bar, beside its download. */
export function TickActions<Row>({ ticks, rows, rowKey, canTick }: TickRows<Row> & {
  ticks: TableTicks;
  /** The rows in view, in the order the table is showing them. */
  rows: readonly Row[];
}) {
  const t = useTranslations("ui.tableTicks");
  const top = rows.filter((row) => !canTick || canTick(row)).slice(0, ticks.most).map(rowKey);
  const held = new Set(ticks.keys);
  const topTicked = top.length > 0 && top.length === ticks.keys.length && top.every((key) => held.has(key));
  return (
    <>
      <Button variant="quiet" className={BAR_BUTTON} disabled={ticks.keys.length === 0} onClick={() => ticks.set([])}>{t("clearAll")}</Button>
      <Button variant="quiet" className={BAR_BUTTON} disabled={top.length === 0 || topTicked} onClick={() => ticks.set(top)}>{t("selectTop", { most: ticks.most })}</Button>
    </>
  );
}
