import { formatDate } from "@/src/lib/dates";

/**
 * A calendar day an Admin → Content record keeps ("2026-09-18"), in the
 * reader's own date format. Read at midday UTC so no timezone moves it to the
 * day before or after. Shared by Google updates and the Library.
 */
export const formatContentDay = (day: string) => formatDate(`${day}T12:00:00Z`);
