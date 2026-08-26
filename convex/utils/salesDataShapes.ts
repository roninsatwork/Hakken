import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";
import { rowShape } from "./rowShape";

/** What the sales-data screens hand back. */

const importFields = schema.tables.salesDataImports.validator.fields;

const importSummaryShape = v.object({
  _id: v.id("salesDataImports"),
  fileName: importFields.fileName,
  periodLabels: v.array(v.string()),
  salesRowCount: v.number(),
  categoryRowCount: v.number(),
  areasOfInterestRowCount: v.number(),
  frequencyRowCount: v.number(),
  completedAt: v.union(v.number(), v.null()),
});

export const salesSectionOverviewShape = v.union(
  v.object({
    enabled: v.literal(false),
    companyName: v.null(),
    currentImport: v.null(),
  }),
  v.object({
    enabled: v.literal(true),
    companyName: v.union(v.string(), v.null()),
    currentImport: v.union(importSummaryShape, v.null()),
  }),
);

export const salesImportListShape = v.array(v.object({
  _id: v.id("salesDataImports"),
  fileName: importFields.fileName,
  status: importFields.status,
  periodLabels: v.array(v.string()),
  salesRowCount: v.number(),
  categoryRowCount: v.number(),
  areasOfInterestRowCount: v.number(),
  frequencyRowCount: v.number(),
  error: v.union(v.string(), v.null()),
  supersededAt: v.union(v.number(), v.null()),
  startedAt: importFields.startedAt,
  completedAt: v.union(v.number(), v.null()),
  importedByName: v.string(),
}));

export const salesRowPageShape = paginationResultValidator(rowShape.salesDataRows);

export const categoryLinkPageShape = paginationResultValidator(rowShape.salesDataCategoryLinks);

export const areaOfInterestPageShape = paginationResultValidator(rowShape.salesDataAreasOfInterest);

export const frequencyPageShape = paginationResultValidator(rowShape.salesDataFrequencies);

export const salesFilterOptionsShape = v.object({
  customerTypes: v.array(v.string()),
  accountNames: v.array(v.string()),
  groupNames: v.array(v.string()),
});

export const tableFilterOptionsShape = v.object({
  customerTypes: v.array(v.string()),
  productCategories: v.array(v.string()),
  productTypes: v.array(v.string()),
  frequencies: v.array(v.string()),
});
