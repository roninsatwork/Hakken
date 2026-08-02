/**
 * Which extra figure a kind of customer is measured by.
 *
 * A care home and a hotel are sized in beds; a school is sized in pupils. The
 * rule is a small table in code rather than a settings screen — Anthony, asked
 * whether adding a customer type should need a developer: *"Needs me."*
 *
 * It sits in its own file because two things need it and they must not import
 * each other: the CRM, which uses it to decide what the profile shows, and the
 * research agent, which uses it to refuse a bed count offered for a school.
 */

const EXTRA_FIELD_BY_TYPE: Record<string, "bedrooms" | "pupils"> = {
  "CARE HOMES": "bedrooms",
  HOTELS: "bedrooms",
  "EDUCATION - RESIDENTIAL": "pupils",
  "EDUCATION - NON RESIDENTIAL": "pupils",
};

/** Null for a type matching neither rule, which simply shows no extra field. */
export function extraFieldForType(customerTypeKey: string): "bedrooms" | "pupils" | null {
  return EXTRA_FIELD_BY_TYPE[customerTypeKey] ?? null;
}
