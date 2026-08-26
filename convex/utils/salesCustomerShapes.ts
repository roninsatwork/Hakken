import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema from "../schema";

/**
 * What the customer directory hands back.
 *
 * A prospect and a customer share one row shape on purpose — the list renders
 * one kind of row, and a screen that branched per row would eventually show a
 * prospect a customer's spend. `record` is what says which is which.
 */

const prospectFields = schema.tables.salesDataProspects.validator.fields;

export const prospectOriginShape = v.union(
  v.literal("EXISTING_CHAIN"),
  v.literal("MARKET_DISCOVERY"),
);

const prospectDetailShape = v.object({
  status: prospectFields.status,
  town: v.union(v.string(), v.null()),
  postcode: v.union(v.string(), v.null()),
  conflictNote: v.union(v.string(), v.null()),
  sourceUrl: v.union(v.string(), v.null()),
  sourceName: v.union(v.string(), v.null()),
  reasoning: v.union(v.string(), v.null()),
  foundAt: v.number(),
  origin: prospectOriginShape,
});

export const customerListPageShape = paginationResultValidator(v.object({
  accountNameKey: v.string(),
  accountName: v.string(),
  accountCode: v.string(),
  groupName: v.string(),
  customerType: v.string(),
  totalRevenue: v.number(),
  town: v.union(v.string(), v.null()),
  postcode: v.union(v.string(), v.null()),
  hasDetails: v.boolean(),
  record: v.union(v.literal("CUSTOMER"), v.literal("PROSPECT")),
  origin: v.union(prospectOriginShape, v.null()),
}));

export const customerFilterOptionsShape = v.object({
  customerTypes: v.array(v.string()),
  groupNames: v.array(v.string()),
});

export const customerProfileShape = v.union(v.null(), v.object({
  accountNameKey: v.string(),
  accountName: v.string(),
  accountCode: v.string(),
  groupName: v.string(),
  customerType: v.string(),
  customerTypeKey: v.string(),
  totalRevenue: v.number(),
  productCount: v.number(),
  record: v.union(v.literal("CUSTOMER"), v.literal("PROSPECT")),
  prospect: v.union(prospectDetailShape, v.null()),
  extraField: v.union(v.literal("bedrooms"), v.literal("pupils"), v.null()),
  town: v.union(v.string(), v.null()),
  postcode: v.union(v.string(), v.null()),
  phone: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  contactName: v.union(v.string(), v.null()),
  bedrooms: v.union(v.number(), v.null()),
  pupils: v.union(v.number(), v.null()),
  hasDetails: v.boolean(),
  addressLine1: v.union(v.string(), v.null()),
  addressLine2: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  mobile: v.union(v.string(), v.null()),
  accountsEmail: v.union(v.string(), v.null()),
  website: v.union(v.string(), v.null()),
  contactRole: v.union(v.string(), v.null()),
  notes: v.union(v.string(), v.null()),
  updatedAt: v.union(v.number(), v.null()),
  updatedByName: v.union(v.string(), v.null()),
}));

export const chainMemberListShape = v.array(v.object({
  accountNameKey: v.string(),
  accountName: v.string(),
  totalRevenue: v.number(),
}));

export const customerSalesByMonthShape = v.object({
  months: v.array(v.object({
    periodIndex: v.number(),
    label: v.string(),
    total: v.number(),
  })),
  total: v.number(),
  periodLabels: v.array(v.string()),
});

export const customerSalesForMonthShape = v.array(v.object({
  rowId: v.id("salesDataRows"),
  productCode: v.string(),
  productDescription: v.optional(v.string()),
  productCategory: v.optional(v.string()),
  productType: v.optional(v.string()),
  value: v.number(),
}));

export const customerCountsShape = v.object({
  total: v.number(),
  withDetails: v.number(),
  prospects: v.number(),
  suspects: v.number(),
});
