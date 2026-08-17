"use client";

import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { TableHeaderCell, TableHeaderRow, TableLoadingRow, TableShell } from "@/src/ui/components/screens/Table";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import type { Id } from "@/convex/_generated/dataModel";
import { formatDate } from "@/src/lib/dates";

/**
 * Uploading a workbook and saying which worksheet is which.
 *
 * The mapping step exists because the worksheet holding the sales figures is
 * named for the period it covers — `Jan-Jun 2026 Sales` — so its name is
 * different in every file and nothing can reliably match on it. Rather than
 * guess and be quietly wrong, the screen shows what the file contains and asks
 * the person who has it.
 *
 * Upload and import are deliberately two steps. Reading the workbook is fast
 * and harmless; replacing the workspace's data is neither, and it should take
 * a second deliberate click after seeing what was found.
 */

type WorksheetSummary = {
  index: number;
  name: string;
  rowCount: number;
  columnCount: number;
  headings: string[];
};

type Mapping = {
  sales: number;
  categories: number;
  areasOfInterest: number;
  frequency: number;
};

type ImportOutcome = {
  salesRowCount: number;
  categoryRowCount: number;
  areasOfInterestRowCount: number;
  frequencyRowCount: number;
  skippedRowCount: number;
  periodLabels: string[];
};

/** One entry per worksheet the import expects — four tabs, four datasets. */
const DATASETS = [
  { key: "sales" as const, labelKey: "datasetSales" },
  { key: "categories" as const, labelKey: "datasetCategories" },
  { key: "areasOfInterest" as const, labelKey: "datasetAreasOfInterest" },
  { key: "frequency" as const, labelKey: "datasetFrequency" },
];

export default function SalesDataImportPage() {
  const t = useTranslations("salesData");
  const fileInput = useRef<HTMLInputElement>(null);

  const generateUploadUrl = useMutation(api.salesData.generateUploadUrl);
  const inspectWorkbook = useAction(api.salesDataImportActions.inspectWorkbook);
  const runImport = useAction(api.salesDataImportActions.runImport);
  const imports = useQuery(api.salesData.listImports, { limit: 10 });

  const [storageId, setStorageId] = useState<Id<"_storage"> | null>(null);
  const [fileName, setFileName] = useState("");
  const [worksheets, setWorksheets] = useState<WorksheetSummary[] | null>(null);
  const [mapping, setMapping] = useState<Mapping>({
    sales: 0,
    categories: 1,
    areasOfInterest: 2,
    frequency: 3,
  });
  const [isUploading, setIsUploading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const reset = () => {
    setStorageId(null);
    setFileName("");
    setWorksheets(null);
    setError("");
    setOutcome(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleFile = async (file: File) => {
    setIsUploading(true);
    setError("");
    setOutcome(null);

    try {
      const uploadUrl = await generateUploadUrl();
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error(t("errors.uploadFailed"));

      const { storageId: uploaded } = (await response.json()) as {
        storageId: Id<"_storage">;
      };

      const inspected = await inspectWorkbook({ storageId: uploaded });
      setStorageId(uploaded);
      setFileName(file.name);
      setWorksheets(inspected.worksheets);

      // Defaults follow the order of the file seen so far. They are only a
      // starting point — the point of this screen is that they can be changed.
      const last = inspected.worksheets.length - 1;
      setMapping({
        sales: 0,
        categories: Math.min(1, last),
        areasOfInterest: Math.min(2, last),
        frequency: Math.min(3, last),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("errors.uploadFailed"));
      reset();
    } finally {
      setIsUploading(false);
    }
  };

  const handleImport = async () => {
    if (!storageId) return;

    setIsImporting(true);
    setError("");

    try {
      const result = await runImport({ storageId, fileName, sheetMapping: mapping });
      setOutcome(result);
      setWorksheets(null);
      setStorageId(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("errors.importFailed"));
    } finally {
      setIsImporting(false);
    }
  };

  const duplicateChoice =
    new Set(Object.values(mapping)).size !== Object.values(mapping).length;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-brand" />
            {t("importTitle")}
          </h1>
          <p className="text-[13px] text-secondary mt-1">{t("importSubtitle")}</p>
        </div>

        {error && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-[12px] border border-[#ef4444]/30 bg-[#ef4444]/10 text-[13px] text-foreground">
            <AlertTriangle className="w-4 h-4 text-[#ef4444] mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {outcome && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-[12px] border border-[#22c55e]/30 bg-[#22c55e]/10 text-[13px] text-foreground">
            <CheckCircle2 className="w-4 h-4 text-[#22c55e] mt-0.5 shrink-0" />
            <div className="flex flex-col gap-1">
              <span>
                {t("importComplete", {
                  sales: outcome.salesRowCount,
                  categories: outcome.categoryRowCount,
                  interest: outcome.areasOfInterestRowCount,
                  frequency: outcome.frequencyRowCount,
                })}
              </span>
              {outcome.periodLabels.length > 0 && (
                <span className="text-secondary">
                  {t("importPeriods", { periods: outcome.periodLabels.join(", ") })}
                </span>
              )}
              {outcome.skippedRowCount > 0 && (
                <span className="text-secondary">
                  {t("importSkipped", { count: outcome.skippedRowCount })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Step one: the file */}
        <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">{t("uploadTitle")}</h2>
            <p className="text-[13px] text-secondary mt-1">{t("uploadHint")}</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
              className="hidden"
              id="sales-data-file"
            />
            <label
              htmlFor="sales-data-file"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-brand text-white text-[14px] font-medium cursor-pointer hover:opacity-90 transition-opacity"
            >
              <Upload className="w-4 h-4" />
              {isUploading ? t("uploading") : t("chooseFile")}
            </label>
            {fileName && <span className="text-[13px] text-secondary">{fileName}</span>}
          </div>
        </div>

        {/* Step two: which worksheet is which */}
        {worksheets && (
          <div className="bg-sidebar/40 border border-border-dim rounded-[24px] backdrop-blur-xl p-6 flex flex-col gap-5">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">{t("mapTitle")}</h2>
              <p className="text-[13px] text-secondary mt-1">{t("mapHint")}</p>
            </div>

            <div className="flex flex-col gap-3">
              {DATASETS.map((dataset) => (
                <label key={dataset.key} className="flex flex-col gap-1.5">
                  <span className="text-[13px] text-foreground">{t(dataset.labelKey)}</span>
                  <select
                    value={mapping[dataset.key]}
                    onChange={(event) =>
                      setMapping({ ...mapping, [dataset.key]: Number(event.target.value) })
                    }
                    className="px-3 py-2 bg-background border border-border-dim rounded-[10px] text-[14px] text-foreground outline-none focus:border-brand/50"
                  >
                    {worksheets.map((worksheet) => (
                      <option key={worksheet.index} value={worksheet.index}>
                        {worksheet.name} ({t("rowCount", { count: worksheet.rowCount })})
                      </option>
                    ))}
                  </select>
                  <span className="text-[12px] text-muted truncate">
                    {worksheets[mapping[dataset.key]]?.headings.join(" · ")}
                  </span>
                </label>
              ))}
            </div>

            {duplicateChoice && (
              <p className="text-[13px] text-[#f59e0b]">{t("errors.duplicateSheets")}</p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => void handleImport()}
                disabled={isImporting || duplicateChoice}
                className="px-4 py-2 rounded-[10px] bg-brand text-white text-[14px] font-medium disabled:opacity-50 hover:opacity-90 transition-opacity"
              >
                {isImporting ? t("importing") : t("replaceData")}
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={isImporting}
                className="px-4 py-2 rounded-[10px] border border-border-dim text-[14px] text-secondary hover:text-foreground transition-colors"
              >
                {t("cancelUpload")}
              </button>
            </div>

            <p className="text-[12px] text-muted">{t("replaceWarning")}</p>
          </div>
        )}

        {/* History */}
        <TableShell
          minWidthClassName="min-w-[720px]"
          header={
            <div className="px-4 py-3 border-b border-border-dim">
              <h2 className="text-[15px] font-semibold text-foreground">{t("historyTitle")}</h2>
            </div>
          }
        >
              <thead>
                <TableHeaderRow>
                  <TableHeaderCell className="px-6">{t("historyFile")}</TableHeaderCell>
                  <TableHeaderCell className="px-6">{t("historyStatus")}</TableHeaderCell>
                  <TableHeaderCell className="px-6">{t("historyRows")}</TableHeaderCell>
                  <TableHeaderCell className="px-6">{t("historyPeriods")}</TableHeaderCell>
                  <TableHeaderCell className="px-6">{t("historyWhen")}</TableHeaderCell>
                </TableHeaderRow>
              </thead>
              <tbody>
                {imports === undefined ? (
                  /* The kit's spinner rather than a line of text
                     sitting where a row goes. */
                  <TableLoadingRow colSpan={5} />
                ) : imports.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-0 border-none">
                      <SonaeEmptyState
                        title={t("historyEmptyTitle")}
                        description={t("historyEmptyDescription")}
                      />
                    </td>
                  </tr>
                ) : (
                  imports.map((record) => (
                    <tr key={record._id} className="border-b border-border-dim/50">
                      <td className="px-4 py-3 text-[13px] text-foreground">
                        <div className="flex flex-col">
                          <span>{record.fileName}</span>
                          {record.importedByName && (
                            <span className="text-[12px] text-muted">{record.importedByName}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[13px]">
                        <StatusLabel
                          status={record.status}
                          superseded={record.supersededAt !== null}
                          error={record.error}
                          t={t}
                        />
                      </td>
                      <td className="px-4 py-3 text-[13px] text-secondary tabular-nums">
                        {record.status === "COMPLETED"
                          ? `${record.salesRowCount.toLocaleString()} · ${record.categoryRowCount} · ${record.areasOfInterestRowCount} · ${record.frequencyRowCount}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-secondary">
                        {record.periodLabels.length > 0 ? record.periodLabels.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3 text-[13px] text-secondary whitespace-nowrap">
                        {formatDate(record.startedAt)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
        </TableShell>
      </div>
    </>
  );
}

function StatusLabel({
  status,
  superseded,
  error,
  t,
}: {
  status: string;
  superseded: boolean;
  error: string | null;
  t: (key: string) => string;
}) {
  if (status === "FAILED") {
    return (
      <span className="text-[#ef4444]" title={error ?? undefined}>
        {t("statusFailed")}
      </span>
    );
  }
  if (status === "RUNNING") return <span className="text-[#f59e0b]">{t("statusRunning")}</span>;
  if (superseded) return <span className="text-muted">{t("statusSuperseded")}</span>;
  return <span className="text-[#22c55e]">{t("statusCurrent")}</span>;
}
