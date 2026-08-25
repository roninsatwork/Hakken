"use node";

import { v } from "convex/values";
import * as ExcelJSNamespace from "exceljs";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { tenantAction } from "./tenantFunctions";
import {
  parseAreasOfInterestSheet,
  parseCategorySheet,
  parseFrequencySheet,
  parseSalesSheet,
  validateSheetMapping,
  type CellValue,
  type SheetRows,
} from "./salesDataImportService";
import { appError } from "./utils/appError";

/**
 * Reading an uploaded workbook.
 *
 * Split from `salesData.ts` because exceljs is a Node library and Convex runs
 * queries and mutations in its own runtime. The action does the reading; every
 * write goes through an internal mutation, which is also where the module and
 * tenant checks happen, since an action cannot reach the database itself.
 *
 * The parsing itself lives in `salesDataImportService.ts` and is tested there.
 * What is left here is I/O: fetch the file, hand the cells over, write the
 * results in batches small enough for a Convex transaction.
 */

/**
 * exceljs, whichever shape the bundler hands over.
 *
 * The package is plain CommonJS — no `module`, `exports` or `type` field — so
 * a namespace import lands either on the module's exports or on a wrapper
 * holding them under `default`, depending on how the bundler does its interop.
 * Convex's does the latter, which made `new ExcelJS.Workbook()` throw
 * `_.Workbook is not a constructor` at run time while typechecking cleanly:
 * the types describe the source module, not the bundled shape.
 *
 * Normalising once here means the call sites cannot be broken by that
 * distinction again.
 */
const ExcelJS =
  (ExcelJSNamespace as unknown as { default?: typeof ExcelJSNamespace }).default ??
  ExcelJSNamespace;

/** Rows per insert mutation. Convex caps what one transaction may write. */
const INSERT_BATCH_SIZE = 200;

/** Stops a runaway purge looping forever if something upstream misbehaves. */
const MAX_PURGE_BATCHES = 200;

type ImportResult = {
  importId: Id<"salesDataImports">;
  salesRowCount: number;
  categoryRowCount: number;
  areasOfInterestRowCount: number;
  frequencyRowCount: number;
  skippedRowCount: number;
  periodLabels: string[];
};

async function loadWorkbook(
  ctx: { storage: { get: (id: Id<"_storage">) => Promise<Blob | null> } },
  storageId: Id<"_storage">
) {
  const blob = await ctx.storage.get(storageId);
  if (!blob) throw appError("NOT_FOUND", "The uploaded file could not be found. Try uploading it again.");

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());
  return workbook;
}

/**
 * A worksheet as a dense array of rows.
 *
 * exceljs is sparse and one-based: `row.values` puts the first cell at index 1
 * and omits empty rows entirely. Both would silently shift every column, so
 * the grid is rebuilt by explicit cell address instead.
 */
// Types come from the namespace, values from the normalised binding above.
function readSheet(worksheet: ExcelJSNamespace.Worksheet): SheetRows {
  const rows: SheetRows = [];
  const columnCount = worksheet.columnCount;

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const values: CellValue[] = [];
    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      values.push(cell.value as CellValue);
    }
    rows[rowNumber - 1] = values;
  });

  for (let index = 0; index < rows.length; index += 1) {
    rows[index] ??= [];
  }

  return rows;
}

/**
 * What is in the workbook, so the user can say which worksheet is which.
 *
 * The sales worksheet is named for the period it covers — `Jan-Jun 2026 Sales`
 * — so its name is different every time and cannot be matched on. Showing the
 * names and a preview of the first row lets the person who has the file make
 * the call, which is more reliable than any guess this code could make.
 */
export const inspectWorkbook = tenantAction({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    const context = await ctx.runQuery(
      internal.salesData.getImportContextInternal,
      { userId: ctx.userId }
    );
    if (!context) throw appError("MODULE_DISABLED", "Sales Data is not enabled for this workspace.");

    const workbook = await loadWorkbook(ctx, args.storageId);

    return {
      worksheets: workbook.worksheets.map((worksheet, index) => {
        const rows = readSheet(worksheet);
        const headings = (rows[0] ?? [])
          .map((cell) =>
            cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "")
          )
          .filter((value) => value.trim() !== "");

        return {
          index,
          name: worksheet.name,
          rowCount: Math.max(rows.length - 1, 0),
          columnCount: worksheet.columnCount,
          headings: headings.slice(0, 8),
        };
      }),
    };
  },
});

/**
 * Read the mapped worksheets and replace the workspace's data.
 *
 * The order matters. Everything is parsed before anything is written, so a
 * malformed file fails without having touched the database. The new rows then
 * go in tagged with this import, and only once all three datasets are in does
 * the previous import's data get dropped.
 */
export const runImport = tenantAction({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    sheetMapping: v.object({
      sales: v.number(),
      categories: v.number(),
      areasOfInterest: v.number(),
      frequency: v.number(),
    }),
  },
  // Annotated because the handler calls its own module's generated API, which
  // TypeScript cannot resolve while it is still inferring this function.
  handler: async (ctx, args): Promise<ImportResult> => {
    const context = await ctx.runQuery(
      internal.salesData.getImportContextInternal,
      { userId: ctx.userId }
    );
    if (!context) throw appError("MODULE_DISABLED", "Sales Data is not enabled for this workspace.");

    const workbook = await loadWorkbook(ctx, args.storageId);
    validateSheetMapping(args.sheetMapping, workbook.worksheets.length);

    // Parsed up front, before the import record exists: a file that cannot be
    // read should not leave a failed import behind to explain.
    const sales = parseSalesSheet(readSheet(workbook.worksheets[args.sheetMapping.sales]));
    const categories = parseCategorySheet(
      readSheet(workbook.worksheets[args.sheetMapping.categories])
    );
    const areasOfInterest = parseAreasOfInterestSheet(
      readSheet(workbook.worksheets[args.sheetMapping.areasOfInterest])
    );
    const frequencies = parseFrequencySheet(
      readSheet(workbook.worksheets[args.sheetMapping.frequency])
    );

    const importId: Id<"salesDataImports"> = await ctx.runMutation(
      internal.salesData.startImportInternal,
      {
        userId: ctx.userId,
        companyId: context.companyId,
        fileName: args.fileName,
        sheetMapping: args.sheetMapping,
      }
    );

    try {
      for (let index = 0; index < sales.rows.length; index += INSERT_BATCH_SIZE) {
        await ctx.runMutation(internal.salesData.insertSalesRowsInternal, {
          companyId: context.companyId,
          importId,
          rows: sales.rows.slice(index, index + INSERT_BATCH_SIZE),
        });
      }

      for (let index = 0; index < categories.length; index += INSERT_BATCH_SIZE) {
        await ctx.runMutation(internal.salesData.insertCategoryLinksInternal, {
          companyId: context.companyId,
          importId,
          rows: categories.slice(index, index + INSERT_BATCH_SIZE),
        });
      }

      for (let index = 0; index < areasOfInterest.length; index += INSERT_BATCH_SIZE) {
        await ctx.runMutation(internal.salesData.insertAreasOfInterestInternal, {
          companyId: context.companyId,
          importId,
          rows: areasOfInterest.slice(index, index + INSERT_BATCH_SIZE),
        });
      }

      for (let index = 0; index < frequencies.length; index += INSERT_BATCH_SIZE) {
        await ctx.runMutation(internal.salesData.insertFrequenciesInternal, {
          companyId: context.companyId,
          importId,
          rows: frequencies.slice(index, index + INSERT_BATCH_SIZE),
        });
      }

      await ctx.runMutation(internal.salesData.completeImportInternal, {
        importId,
        periodLabels: sales.periodLabels,
        salesRowCount: sales.rows.length,
        categoryRowCount: categories.length,
        areasOfInterestRowCount: areasOfInterest.length,
        frequencyRowCount: frequencies.length,
      });
    } catch (error) {
      await purge(() =>
        ctx.runMutation(internal.salesData.failImportInternal, {
          importId,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      throw error;
    }

    // Only now, with the new data live, does the old data go. A failure here
    // leaves superseded rows behind, which costs storage and nothing else —
    // the queries read the current import.
    await purge(() =>
      ctx.runMutation(internal.salesData.purgeSupersededRowsInternal, {
        companyId: context.companyId,
        keepImportId: importId,
      })
    );

    return {
      importId,
      salesRowCount: sales.rows.length,
      categoryRowCount: categories.length,
      areasOfInterestRowCount: areasOfInterest.length,
      frequencyRowCount: frequencies.length,
      skippedRowCount: sales.skippedRowNumbers.length,
      periodLabels: sales.periodLabels,
    };
  },
});

/** Run a batched delete to completion. */
async function purge(runBatch: () => Promise<{ hasMore: boolean }>) {
  for (let batch = 0; batch < MAX_PURGE_BATCHES; batch += 1) {
    const { hasMore } = await runBatch();
    if (!hasMore) return;
  }
}
