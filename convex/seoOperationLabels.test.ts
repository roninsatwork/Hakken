import { describe, expect, it } from "vitest";

import { SEO_OPERATIONS } from "./dataForSeoRegistry";
import en from "../messages/en.json";
import it_ from "../messages/it.json";

/**
 * Every kind of paid call has a name on the collection screens.
 *
 * `domain_competitors` shipped without one and the pipeline printed its raw
 * translation key on the first live run, 2026-09-23. The registry is the list
 * of what can be bought, so it is the list the labels are held against.
 */
describe("collection operation labels", () => {
  const labelled = (messages: typeof en) =>
    new Set(Object.keys(messages.admin.seoCollection.operation));

  it.each([["English", en], ["Italian", it_ as typeof en]])("names every registered operation in %s", (_, messages) => {
    const labels = labelled(messages);
    const missing = SEO_OPERATIONS.map((operation) => operation.id).filter((id) => !labels.has(id));
    expect(missing).toEqual([]);
  });
});
