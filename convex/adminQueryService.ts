export function normalizeSearchTerm(searchTerm?: string) {
  const term = searchTerm?.trim().toLowerCase() ?? "";
  return term.length > 0 ? term : null;
}

export function includesSearchTerm(value: string | null | undefined, term: string) {
  return (value || "").toLowerCase().includes(term);
}

export function paginateItems<T>(
  items: T[],
  page: number,
  pageSize: number,
  options: { minTotalPages?: number } = {}
) {
  const minTotalPages = options.minTotalPages ?? 1;
  const totalCount = items.length;
  const totalPages = Math.max(minTotalPages, Math.ceil(totalCount / pageSize));
  const startIndex = (page - 1) * pageSize;

  return {
    data: items.slice(startIndex, startIndex + pageSize),
    totalCount,
    totalPages,
  };
}
