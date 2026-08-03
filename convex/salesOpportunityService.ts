/**
 * The sums behind the opportunity report: what a prospect would be worth as a
 * customer, and what a chain member's missing categories would be worth.
 *
 * Kept pure and out of the Convex functions so each rule can be tested on its
 * own, because the rules are the whole feature — the same decision the
 * prospect matcher made, for the same reason. The agent that runs the report
 * never touches these numbers; it reads what this file computed and writes
 * prose about it. An estimate that cannot be reproduced by hand from the rows
 * on screen is worth nothing to the person defending it in front of a client.
 *
 * Money in and out is the six-month figure the workbook holds. There is no
 * longer history anywhere in the schema, so "what they spend" always means
 * "what they spent across the six imported months".
 */

import { extraFieldForType } from "./salesDataCustomerFields";

/** A customer as the estimator sees one: type, chain, six-month spend, size. */
export type ComparableCustomer = {
  accountNameKey: string;
  accountName: string;
  groupNameKey: string;
  groupName: string;
  customerTypeKey: string;
  /** Six-month spend from `salesDataAccounts.totalRevenue`. */
  totalRevenueGBP: number;
  /** Bedrooms or pupils, whichever the type carries. Null when not on file. */
  size: number | null;
};

/** A prospect waiting to be priced. Size comes the same way a customer's does. */
export type ProspectSubject = {
  prospectKey: string;
  siteName: string;
  groupNameKey: string;
  groupName: string;
  customerTypeKey: string;
  customerType: string;
  size: number | null;
};

/**
 * How an estimate was reached, strongest first. The tier is shown beside the
 * figure because a rate from two sized siblings and a straight average of the
 * whole customer type are not the same kind of claim.
 */
export type EstimateConfidence =
  /** Per-bed or per-pupil rate from sized customers in the same chain. */
  | "GROUP_SIZED"
  /** Per-unit rate widened to every sized customer of the type. */
  | "TYPE_SIZED"
  /** No size on file: the plain average of its chain's customers. */
  | "GROUP_AVERAGE"
  /** No size and no chain spend: the average of its customer type. */
  | "TYPE_AVERAGE"
  /** Nothing to compare against. Listed as an exception, not priced. */
  | "NONE";

export type ProspectOpportunity = {
  prospectKey: string;
  siteName: string;
  groupName: string;
  customerType: string;
  /** What the type is measured in. Null for types with no size rule. */
  sizeUnit: "bedrooms" | "pupils" | null;
  size: number | null;
  /** Null only when confidence is NONE. */
  estimateGBP: number | null;
  confidence: EstimateConfidence;
  /** The median six-month spend per bed or pupil the estimate multiplied. */
  ratePerUnitGBP: number | null;
  /** The customers the number came from, so the working is on the screen. */
  comparedTo: Array<{
    accountName: string;
    totalRevenueGBP: number;
    size: number | null;
  }>;
  /** The sum in one plain sentence, reproducible with a calculator. */
  basis: string;
};

/** A chain member's category spending, for the gap pass. */
export type GroupMemberSpend = {
  accountNameKey: string;
  accountName: string;
  groupNameKey: string;
  groupName: string;
  size: number | null;
  /** Six-month spend per product category, only categories with any sale. */
  categories: Array<{ categoryKey: string; category: string; spendGBP: number }>;
};

export type GroupGapOpportunity = {
  accountNameKey: string;
  accountName: string;
  groupName: string;
  categoryKey: string;
  category: string;
  /** How many of its siblings buy the category, out of how many siblings. */
  buyersCount: number;
  siblingCount: number;
  estimateGBP: number;
  /** True when both sides had sizes and the figure was scaled per unit. */
  scaledBySize: boolean;
  comparedTo: Array<{ accountName: string; spendGBP: number }>;
  basis: string;
};

/** Pennies matter to nobody here, but ragged floats on a report do. */
function round2(value: number): number {
  return Number(value.toFixed(2));
}

/**
 * The middle value, so one odd customer cannot bend an estimate. A chain with
 * one enormous flagship home would poison a mean; it barely moves a median.
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** A customer whose size can carry a per-unit rate. */
function hasUsableSize(customer: ComparableCustomer): customer is ComparableCustomer & { size: number } {
  return typeof customer.size === "number" && customer.size > 0;
}

const describeComparable = (customer: ComparableCustomer) => ({
  accountName: customer.accountName,
  totalRevenueGBP: round2(customer.totalRevenueGBP),
  size: customer.size,
});

/**
 * What one prospect would be worth as a customer, over six months.
 *
 * The rules, in the order they are tried:
 *
 * 1. **Sized, against its own chain.** Spend per bed (or pupil) for each sized
 *    customer in the same group, take the median rate, multiply by the
 *    prospect's size. Per-unit rates rather than nearest-neighbour spend, so a
 *    60-bed prospect compared against 40-bed customers is scaled honestly.
 * 2. **Sized, against its type.** The same sum when the chain has fewer than
 *    two sized customers to stand on, widened to every sized customer of the
 *    type — and the confidence says the comparison widened.
 * 3. **Unsized, against its chain.** No size on file: the plain average
 *    six-month spend of the chain's customers. Marked, counted, and the
 *    advert for running the research agent again.
 * 4. **Unsized, against its type.** The average of the whole customer type.
 * 5. **Nothing to compare against.** Priced at nothing, listed as an
 *    exception. A made-up number here would be the exact failure this report
 *    exists to avoid.
 *
 * Types with no size rule — nothing in `extraFieldForType` — skip straight to
 * the averages, because "beds" means nothing to them.
 */
export function estimateProspect(
  prospect: ProspectSubject,
  customers: ComparableCustomer[]
): ProspectOpportunity {
  const sizeUnit = extraFieldForType(prospect.customerTypeKey);
  const ofType = customers.filter(
    (customer) => customer.customerTypeKey === prospect.customerTypeKey
  );
  const ofGroup = ofType.filter(
    (customer) => customer.groupNameKey === prospect.groupNameKey
  );

  const base = {
    prospectKey: prospect.prospectKey,
    siteName: prospect.siteName,
    groupName: prospect.groupName,
    customerType: prospect.customerType,
    sizeUnit,
    size: prospect.size,
  };

  if (sizeUnit && typeof prospect.size === "number" && prospect.size > 0) {
    const sizedGroup = ofGroup.filter(hasUsableSize);
    const sizedType = ofType.filter(hasUsableSize);
    // Two sized siblings make a chain rate worth trusting; one is an anecdote,
    // and the type-wide pool it widens to includes that one anyway.
    const pool = sizedGroup.length >= 2 ? sizedGroup : sizedType;

    if (pool.length > 0) {
      const rate = median(pool.map((customer) => customer.totalRevenueGBP / customer.size));
      const confidence: EstimateConfidence =
        pool === sizedGroup ? "GROUP_SIZED" : "TYPE_SIZED";
      const scope =
        confidence === "GROUP_SIZED"
          ? `sized ${prospect.groupName} customers`
          : `sized ${prospect.customerType} customers`;
      return {
        ...base,
        estimateGBP: round2(rate * prospect.size),
        confidence,
        ratePerUnitGBP: round2(rate),
        comparedTo: pool.map(describeComparable),
        basis:
          `Median £${round2(rate)} per ${unitWord(sizeUnit)} across `
          + `${pool.length} ${scope} × ${prospect.size} ${sizeUnit}.`,
      };
    }
  }

  // No usable size on either side of the sum: fall back to plain averages,
  // chain first, and say so.
  const averagePool = ofGroup.length > 0 ? ofGroup : ofType;
  if (averagePool.length > 0) {
    const average = mean(averagePool.map((customer) => customer.totalRevenueGBP));
    const confidence: EstimateConfidence =
      averagePool === ofGroup && ofGroup.length > 0 ? "GROUP_AVERAGE" : "TYPE_AVERAGE";
    const scope =
      confidence === "GROUP_AVERAGE"
        ? `${prospect.groupName} customers`
        : `${prospect.customerType} customers`;
    return {
      ...base,
      estimateGBP: round2(average),
      confidence,
      ratePerUnitGBP: null,
      comparedTo: averagePool.map(describeComparable),
      basis: `Average six-month spend of ${averagePool.length} ${scope}.`,
    };
  }

  return {
    ...base,
    estimateGBP: null,
    confidence: "NONE",
    ratePerUnitGBP: null,
    comparedTo: [],
    basis: `No ${prospect.customerType} customers to compare against.`,
  };
}

function unitWord(sizeUnit: "bedrooms" | "pupils"): string {
  return sizeUnit === "bedrooms" ? "bedroom" : "pupil";
}

/**
 * Every gap inside every chain: categories a member's siblings buy that it
 * does not.
 *
 * A category counts as bought only when it carries actual revenue — the
 * workbook writes a blank for "no sale", and a zero-value row must not make a
 * gap disappear. Chains of one have no siblings and are skipped; the report
 * counts them so the screen can say how many groups the pass examined.
 *
 * The price of a gap is the median of what the buying siblings spend on the
 * category — scaled per bed or pupil when both the member and at least one
 * buyer have sizes on file, plain when they do not, and the row says which.
 */
export function findGroupGaps(members: GroupMemberSpend[]): {
  gaps: GroupGapOpportunity[];
  groupsExamined: number;
} {
  const byGroup = new Map<string, GroupMemberSpend[]>();
  for (const member of members) {
    const group = byGroup.get(member.groupNameKey) ?? [];
    group.push(member);
    byGroup.set(member.groupNameKey, group);
  }

  const gaps: GroupGapOpportunity[] = [];
  let groupsExamined = 0;

  for (const group of byGroup.values()) {
    if (group.length < 2) continue;
    groupsExamined += 1;

    // Who buys what, across the chain — one pass, then read per member.
    const buyersByCategory = new Map<
      string,
      { category: string; buyers: Array<{ member: GroupMemberSpend; spendGBP: number }> }
    >();
    for (const member of group) {
      for (const { categoryKey, category, spendGBP } of member.categories) {
        if (spendGBP <= 0) continue;
        const entry = buyersByCategory.get(categoryKey) ?? { category, buyers: [] };
        entry.buyers.push({ member, spendGBP });
        buyersByCategory.set(categoryKey, entry);
      }
    }

    for (const member of group) {
      const buys = new Set(
        member.categories
          .filter((category) => category.spendGBP > 0)
          .map((category) => category.categoryKey)
      );

      for (const [categoryKey, { category, buyers }] of buyersByCategory) {
        if (buys.has(categoryKey)) continue;

        const sizedBuyers = buyers.filter(
          (buyer) => typeof buyer.member.size === "number" && buyer.member.size > 0
        );
        const memberSized = typeof member.size === "number" && member.size > 0;
        const scaledBySize = memberSized && sizedBuyers.length > 0;

        const estimateGBP = scaledBySize
          ? round2(
              median(sizedBuyers.map((buyer) => buyer.spendGBP / (buyer.member.size as number)))
                * (member.size as number)
            )
          : round2(median(buyers.map((buyer) => buyer.spendGBP)));

        gaps.push({
          accountNameKey: member.accountNameKey,
          accountName: member.accountName,
          groupName: member.groupName,
          categoryKey,
          category,
          buyersCount: buyers.length,
          siblingCount: group.length - 1,
          estimateGBP,
          scaledBySize,
          comparedTo: buyers
            .map((buyer) => ({
              accountName: buyer.member.accountName,
              spendGBP: round2(buyer.spendGBP),
            }))
            .sort((a, b) => b.spendGBP - a.spendGBP),
          basis: scaledBySize
            ? `Median per-unit ${category} spend of ${sizedBuyers.length} sized `
              + `siblings, scaled to this site's size.`
            : `Median ${category} spend of the ${buyers.length} siblings who buy it.`,
        });
      }
    }
  }

  // Strong coverage outranks a big number from one sibling: a category four of
  // five buy is a pattern, a category one of five buys is a lead. Coverage
  // first, then money inside each band.
  gaps.sort((a, b) => {
    const coverageA = a.buyersCount / a.siblingCount;
    const coverageB = b.buyersCount / b.siblingCount;
    if (coverageB !== coverageA) return coverageB - coverageA;
    return b.estimateGBP - a.estimateGBP;
  });

  return { gaps, groupsExamined };
}

/**
 * Every pound figure the computed report contains, for checking prose against.
 *
 * The agent writes the summary, and the save path refuses one that names a
 * figure the sections do not hold — the "claimed, not recorded" rule applied
 * at write time. This is the list of what it may claim.
 */
export function collectReportFigures(
  headline: ReturnType<typeof summariseOpportunities>,
  prospects: ProspectOpportunity[],
  gaps: GroupGapOpportunity[]
): number[] {
  const figures = new Set<number>([
    headline.totalOpportunityGBP,
    headline.prospectOpportunityGBP,
    headline.gapOpportunityGBP,
  ]);
  for (const prospect of prospects) {
    if (prospect.estimateGBP !== null) figures.add(prospect.estimateGBP);
    if (prospect.ratePerUnitGBP !== null) figures.add(prospect.ratePerUnitGBP);
    for (const comparable of prospect.comparedTo) figures.add(comparable.totalRevenueGBP);
  }
  for (const gap of gaps) {
    figures.add(gap.estimateGBP);
    for (const comparable of gap.comparedTo) figures.add(comparable.spendGBP);
  }
  return [...figures];
}

/**
 * The pound amounts a summary names that the computed report does not hold.
 *
 * `£9,000`, `£9000` and `£9,000.00` are one figure; a stated figure matches
 * when it lands within 50p of a computed one, so quoting a rounded penny
 * value is fine and an invented number is not. `£9k` is parsed as £9,000 —
 * an agent told to quote figures exactly gets no rounding allowance beyond
 * that, because "roughly £13k" against a computed £13,300 is exactly the kind
 * of drift this exists to stop.
 */
export function findUnsupportedFigures(summary: string, allowed: number[]): string[] {
  const unsupported: string[] = [];
  const pattern = /£\s?([\d,]+(?:\.\d+)?)\s*(k\b)?/gi;
  for (const match of summary.matchAll(pattern)) {
    const value = Number(match[1].replace(/,/g, "")) * (match[2] ? 1000 : 1);
    if (Number.isNaN(value)) continue;
    const supported = allowed.some((figure) => Math.abs(figure - value) < 0.5);
    if (!supported) unsupported.push(match[0].trim());
  }
  return unsupported;
}

/** The headline boxes, computed once here so no screen re-derives a total. */
export function summariseOpportunities(
  prospects: ProspectOpportunity[],
  gaps: GroupGapOpportunity[],
  groupsExamined: number
): {
  totalOpportunityGBP: number;
  prospectOpportunityGBP: number;
  gapOpportunityGBP: number;
  prospectCount: number;
  prospectsSized: number;
  prospectsUnsized: number;
  prospectsUnpriced: number;
  gapCount: number;
  groupsExamined: number;
} {
  const prospectOpportunityGBP = round2(
    prospects.reduce((sum, prospect) => sum + (prospect.estimateGBP ?? 0), 0)
  );
  const gapOpportunityGBP = round2(gaps.reduce((sum, gap) => sum + gap.estimateGBP, 0));
  const sized = prospects.filter(
    (prospect) => prospect.confidence === "GROUP_SIZED" || prospect.confidence === "TYPE_SIZED"
  ).length;
  const unpriced = prospects.filter((prospect) => prospect.confidence === "NONE").length;
  return {
    totalOpportunityGBP: round2(prospectOpportunityGBP + gapOpportunityGBP),
    prospectOpportunityGBP,
    gapOpportunityGBP,
    prospectCount: prospects.length,
    prospectsSized: sized,
    prospectsUnsized: prospects.length - sized - unpriced,
    prospectsUnpriced: unpriced,
    gapCount: gaps.length,
    groupsExamined,
  };
}
