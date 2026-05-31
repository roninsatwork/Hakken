import type { Doc, Id } from "./_generated/dataModel";
import { includesSearchTerm, normalizeSearchTerm, paginateItems } from "./adminQueryService";

export { normalizeSearchTerm, paginateItems };

export function canReadCompanyThreads(admin: Doc<"users">, companyId: Id<"companies">) {
  return admin.role === "SUPER_ADMIN" || (admin.role === "ADMIN" && admin.companyId === companyId);
}

export function threadMatchesSearch(args: {
  thread: Doc<"threads">;
  user: Doc<"users"> | null;
  term: string;
  includeSourceUrl?: boolean;
}) {
  const title = args.thread.title?.toLowerCase() ?? "";
  const userName = args.user?.name?.toLowerCase() ?? "";
  const userEmail = args.user?.email?.toLowerCase() ?? "";
  const sourceUrl = args.includeSourceUrl ? args.thread.sourceUrl?.toLowerCase() ?? "" : "";

  return (
    includesSearchTerm(title, args.term) ||
    includesSearchTerm(userName, args.term) ||
    includesSearchTerm(userEmail, args.term) ||
    includesSearchTerm(sourceUrl, args.term)
  );
}

export function getThreadUserSummary(user: Doc<"users"> | null, fallbackName: string) {
  return user
    ? {
        name: user.name || fallbackName,
        email: user.email || "No Email",
        image: user.image || "https://api.dicebear.com/7.x/notionists/svg",
      }
    : null;
}
