function countBy(rows, key) {
  return rows.reduce((counts, row) => {
    const value = row[key] ?? "unknown";
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function topCountEntries(counts, limit = 5) {
  return Object.entries(counts ?? {})
    .filter(([, count]) => Number(count) > 0)
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => {
      if (rightCount !== leftCount) return rightCount - leftCount;
      return leftKey.localeCompare(rightKey);
    })
    .slice(0, limit);
}

function formatTopCountEntries(counts, limit = 5) {
  const entries = topCountEntries(counts, limit);
  return entries.length > 0
    ? entries.map(([key, count]) => `${key}:${count}`).join(", ")
    : "none";
}

export function proofQueueSummaryForRows(rows) {
  const byProofCase = countBy(rows, "proofCase");
  return {
    byBlockerCode: countBy(rows.filter((row) => row.proofBlockerCode), "proofBlockerCode"),
    byProofCase,
    byStatus: countBy(rows, "status"),
    topProofCases: topCountEntries(byProofCase, 5).map(([proofCase, count]) => ({
      count,
      proofCase,
    })),
    totalRows: rows.length,
  };
}

export function proofQueueSummaryText(summary) {
  return [
    `${summary.totalRows ?? 0} row(s)`,
    `top proof cases ${formatTopCountEntries(summary.byProofCase, 5)}`,
  ].join("; ");
}

export function proofQueueSummariesForManifest(manifest) {
  const rows = manifest?.rows ?? [];
  return {
    manualReviewQueueSummary: proofQueueSummaryForRows(
      rows.filter((row) => row.status === "manual-review"),
    ),
    sourceLimitationQueueSummary: proofQueueSummaryForRows(
      rows.filter((row) => row.status === "source-data-limitation" && !row.acceptedProductLimitation),
    ),
  };
}
