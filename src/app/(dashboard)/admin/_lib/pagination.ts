export const ADMIN_PAGE_SIZE = 15;

export function normalizeAdminSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

export function matchesAdminSearchTerm(searchTerm: string, values: Array<string | null | undefined>) {
  const normalizedSearch = normalizeAdminSearchTerm(searchTerm);

  if (!normalizedSearch) {
    return true;
  }

  return values.some((value) => value?.toLowerCase().includes(normalizedSearch));
}

export function paginateAdminItems<T>(items: T[], page: number, pageSize: number = ADMIN_PAGE_SIZE) {
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
