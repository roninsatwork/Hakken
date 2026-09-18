import { describe, expect, it } from "vitest";
import { safeCsvCell } from "./csv";

describe("safeCsvCell", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@SUM(A1:A2)", "  =HYPERLINK(\"https://evil.test\")"])(
    "neutralizes spreadsheet formula input %s",
    (value) => {
      expect(safeCsvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
    },
  );

  it("quotes ordinary text and doubles embedded quotes", () => {
    expect(safeCsvCell('Purpose: "old" to "new"')).toBe('"Purpose: ""old"" to ""new"""');
  });
});
