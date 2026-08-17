export const TABLE_PAGE_SIZE = 15;

export function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

export function matchesSearchTerm(searchTerm: string, values: Array<string | null | undefined>) {
  const normalizedSearch = normalizeSearchTerm(searchTerm);

  if (!normalizedSearch) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedSearch));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number = TABLE_PAGE_SIZE) {
  const totalItems = items.length;
  const totalPages = Math.max(Math.ceil(totalItems / pageSize), 1);
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
  };
}
