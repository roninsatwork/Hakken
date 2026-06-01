import { describe, expect, test, vi } from "vitest";
import { parseDocuments } from "./fileParser";

function blobFor(text: string, type: string) {
  return new Blob([text], { type });
}

describe("file parser", () => {
  test("returns empty text for missing file ids and compiles plain text uploads", async () => {
    expect(await parseDocuments({ storage: { get: vi.fn() } } as never, [])).toBe("");

    const ctx = {
      storage: {
        get: vi.fn(async () => blobFor("hello from upload", "text/plain")),
      },
    };

    await expect(parseDocuments(ctx as never, ["storage-id" as never])).resolves.toContain("hello from upload");
    expect(ctx.storage.get).toHaveBeenCalledWith("storage-id");
  });

  test("skips missing blobs, reports unsupported files, and keeps processing after storage errors", async () => {
    const ctx = {
      storage: {
        get: vi
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(blobFor("binary", "application/octet-stream"))
          .mockRejectedValueOnce(new Error("storage failed")),
      },
    };

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await parseDocuments(ctx as never, ["missing" as never, "unsupported" as never, "broken" as never]);

    expect(result).toContain("Unsupported document type uploaded: application/octet-stream");
    expect(consoleError).toHaveBeenCalledWith("Failed to process document broken:", expect.any(Error));
    consoleError.mockRestore();
  });
});
