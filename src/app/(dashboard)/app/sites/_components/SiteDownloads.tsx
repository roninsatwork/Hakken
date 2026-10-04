"use client";

import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/src/context/ToastContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { formatNumber, toCsv } from "./siteFormat";

/**
 * Downloading a Sites table as CSV (docs/plans/active/user-sites-plan.md,
 * "Tables": every table exports to CSV; "Speed": big ones are made on the
 * server, never built in the browser).
 *
 * Two ways in, one button — the kit's `DownloadButton`. `ListDownload` is for
 * the lists a page already holds whole — a site's own searches, its folders, a
 * handful of rivals — and writes the rows it is given. `TableDownload` is for
 * the tables paged on the server: the server builds the file and hands it back
 * to be saved.
 */

type SiteExportKind = "keywords" | "pages" | "gap" | "cited" | "backlinks" | "links" | "broken" | "domains" | "anchors" | "ips" | "paid" | "answers" | "yourPages";

/** Every row the page holds, as CSV, straight away. */
export function ListDownload<Row>({
  fileName,
  rows,
  columns,
  label,
}: {
  fileName: string;
  rows: readonly Row[] | undefined;
  columns: Array<{ header: string; value: (row: Row) => string | number | null | undefined }>;
  /**
   * The button's words, where a section's tables say it their own way:
   * Search Console's say "Download all (CSV)" whether the file is built here
   * or on the server, as drawn (search-console-plan.md §13.1).
   */
  label?: string;
}) {
  const t = useTranslations("sites.downloads");
  return (
    <DownloadButton
      label={label ?? t("csv")}
      disabled={!rows || rows.length === 0}
      onClick={() => {
        if (!rows) return;
        const csv = toCsv(columns.map((column) => column.header), rows.map((row) => columns.map((column) => column.value(row))));
        saveTextFile(csv, fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
      }}
    />
  );
}

/**
 * A whole server-paged table: the server builds the file from the table's own
 * index and hands it back, and this saves it. A very large table is cut at the
 * server's limit, and the reader is told how many rows the file holds. Given
 * the table's order (`sort`, from `useSiteSort`), the file comes in it
 * (docs/plans/active/sites-table-sorting-plan.md, S5).
 */
export function TableDownload({ siteId, kind, sort }: {
  siteId: Id<"companyWebsites">;
  kind: SiteExportKind;
  sort?: { key: string; direction: "asc" | "desc" };
}) {
  const t = useTranslations("sites.downloads");
  const exportTable = useAction(api.siteExports.exportSiteTable);
  const { run, isBusy } = useAdminAction({ scope: "site-download" });
  const { showToast } = useToast();
  return (
    <DownloadButton
      label={t("all")}
      busyLabel={t("building")}
      busy={isBusy()}
      onClick={async () => {
        const outcome = await run(() => exportTable({ siteId, kind, ...(sort ? { sort: sort.key, direction: sort.direction } : {}) }), { fallbackMessage: t("failed") });
        if (!outcome.ok) return;
        const file = outcome.data;
        saveTextFile(file.csv, file.fileName);
        if (!file.complete) showToast(t("cutShort", { rows: formatNumber(file.rows) }), "info");
      }}
    />
  );
}
