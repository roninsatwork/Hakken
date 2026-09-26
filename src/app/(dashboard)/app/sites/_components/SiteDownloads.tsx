"use client";

import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useToast } from "@/src/context/ToastContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Button } from "@/src/ui/components/screens/Button";
import { formatNumber, toCsv } from "./siteFormat";

/**
 * Downloading a Sites table as CSV (docs/plans/active/user-sites-plan.md,
 * "Tables": every table exports to CSV; "Speed": big ones are made on the
 * server, never built in the browser).
 *
 * Two buttons, one look. `ListDownload` is for the lists a page already holds
 * whole — a site's own searches, its folders, a handful of rivals — and writes
 * the rows it is given. `TableDownload` is for the tables paged on the server:
 * the server builds the file and hands it back to be saved.
 */

type SiteExportKind = "keywords" | "pages" | "gap" | "cited" | "backlinks" | "links" | "broken" | "domains" | "anchors" | "ips" | "paid" | "answers";

/** Hand a file to the browser to save. */
function save(href: string, fileName: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Every row the page holds, as CSV, straight away. */
export function ListDownload<Row>({
  fileName,
  rows,
  columns,
}: {
  fileName: string;
  rows: readonly Row[] | undefined;
  columns: Array<{ header: string; value: (row: Row) => string | number | null | undefined }>;
}) {
  const t = useTranslations("sites.downloads");
  return (
    <Button
      variant="quiet"
      disabled={!rows || rows.length === 0}
      onClick={() => {
        if (!rows) return;
        const csv = toCsv(columns.map((column) => column.header), rows.map((row) => columns.map((column) => column.value(row))));
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        save(url, fileName.endsWith(".csv") ? fileName : `${fileName}.csv`);
        URL.revokeObjectURL(url);
      }}
      className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[12px]"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {t("csv")}
    </Button>
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
  const building = isBusy();
  return (
    <Button
      variant="quiet"
      disabled={building}
      onClick={async () => {
        const outcome = await run(() => exportTable({ siteId, kind, ...(sort ? { sort: sort.key, direction: sort.direction } : {}) }), { fallbackMessage: t("failed") });
        if (!outcome.ok) return;
        const file = outcome.data;
        const url = URL.createObjectURL(new Blob([file.csv], { type: "text/csv;charset=utf-8" }));
        save(url, file.fileName);
        URL.revokeObjectURL(url);
        if (!file.complete) showToast(t("cutShort", { rows: formatNumber(file.rows) }), "info");
      }}
      className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[12px]"
      aria-live="polite"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {building ? t("building") : t("all")}
    </Button>
  );
}
