import { describe, expect, it, vi } from "vitest";
import {
  MAX_BULK_UPLOAD_FILES,
  buildUploadTitle,
  collectDroppedFiles,
  collectPickedFiles,
  isReservedBundleFile,
  mapWithConcurrency,
  partitionReservedBundleFiles,
} from "./knowledgeUploadUtils";

type EntryStub = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (onSuccess: (file: File) => void) => void;
  createReader?: () => { readEntries: (onSuccess: (entries: EntryStub[]) => void) => void };
};

function fileEntry(name: string): EntryStub {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (onSuccess) => onSuccess(new File(["# body"], name, { type: "text/markdown" })),
  };
}

/** Mimics the real API: at most `batchSize` entries per read, empty batch ends it. */
function directoryEntry(name: string, children: EntryStub[], batchSize = 100): EntryStub {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader: () => {
      let cursor = 0;
      return {
        readEntries: (onSuccess) => {
          const batch = children.slice(cursor, cursor + batchSize);
          cursor += batch.length;
          onSuccess(batch);
        },
      };
    },
  };
}

function dropOf(entries: EntryStub[]) {
  return {
    items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })),
    files: [] as unknown as FileList,
  } as unknown as DataTransfer;
}

describe("collecting dropped folders", () => {
  it("walks nested folders and keeps each file's path", async () => {
    const bundle = directoryEntry("okf-bundle", [
      fileEntry("index.md"),
      directoryEntry("finance", [fileEntry("revenue.md"), directoryEntry("deep", [fileEntry("margin.md")])]),
    ]);

    const collected = await collectDroppedFiles(dropOf([bundle]));

    expect(collected.map((item) => item.path)).toEqual([
      "okf-bundle/index.md",
      "okf-bundle/finance/revenue.md",
      "okf-bundle/finance/deep/margin.md",
    ]);
  });

  it("drains a directory that reads back in batches", async () => {
    // 250 files through a reader that hands back 100 at a time. Reading once
    // would silently return only the first 100.
    const children = Array.from({ length: 250 }, (_, index) => fileEntry(`concept-${index}.md`));
    const collected = await collectDroppedFiles(dropOf([directoryEntry("big", children)]));

    expect(collected).toHaveLength(250);
  });

  it("collects one past the cap so the caller can report the overflow", async () => {
    const children = Array.from({ length: MAX_BULK_UPLOAD_FILES + 50 }, (_, index) => fileEntry(`c-${index}.md`));
    const collected = await collectDroppedFiles(dropOf([directoryEntry("huge", children)]));

    expect(collected.length).toBe(MAX_BULK_UPLOAD_FILES + 1);
  });

  it("falls back to the flat file list when the entry API is missing", async () => {
    const plain = {
      items: [{}],
      files: [new File(["a"], "notes.md", { type: "text/markdown" })] as unknown as FileList,
    } as unknown as DataTransfer;

    const collected = await collectDroppedFiles(plain);
    expect(collected.map((item) => item.path)).toEqual(["notes.md"]);
  });
});

describe("collecting picked files", () => {
  it("uses the folder-relative path when the picker supplies one", () => {
    const withPath = new File(["a"], "revenue.md", { type: "text/markdown" });
    Object.defineProperty(withPath, "webkitRelativePath", { value: "okf-bundle/finance/revenue.md" });
    const withoutPath = new File(["a"], "loose.md", { type: "text/markdown" });

    const collected = collectPickedFiles([withPath, withoutPath] as unknown as FileList);

    expect(collected.map((item) => item.path)).toEqual(["okf-bundle/finance/revenue.md", "loose.md"]);
  });

  it("returns nothing for a null file list", () => {
    expect(collectPickedFiles(null)).toEqual([]);
  });
});

describe("upload titles", () => {
  it("drops the shared top folder but keeps the structure below it", () => {
    expect(
      buildUploadTitle({ file: new File(["a"], "revenue.md"), path: "okf-bundle/finance/revenue.md" }),
    ).toBe("finance/revenue.md");
  });

  it("keeps a bare filename for a loose file", () => {
    expect(buildUploadTitle({ file: new File(["a"], "notes.md"), path: "notes.md" })).toBe("notes.md");
  });

  it("keeps index files distinguishable across folders", () => {
    const finance = buildUploadTitle({ file: new File(["a"], "index.md"), path: "bundle/finance/index.md" });
    const sales = buildUploadTitle({ file: new File(["a"], "index.md"), path: "bundle/sales/index.md" });

    expect(finance).not.toBe(sales);
  });
});

describe("bounded concurrency", () => {
  it("never runs more than the limit at once and keeps result order", async () => {
    let running = 0;
    let peak = 0;

    const results = await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 1));
      running -= 1;
      return item * 2;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(results).toEqual(Array.from({ length: 20 }, (_, i) => i * 2));
  });

  it("handles an empty list without spawning a runner", async () => {
    const worker = vi.fn();
    await expect(mapWithConcurrency([], 4, worker)).resolves.toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });
});

describe("reserved OKF bundle files", () => {
  const file = (path: string) => ({ file: new File(["a"], path.split("/").pop()!), path });

  it("skips index and log files inside a bundle", () => {
    const { uploadable, skipped } = partitionReservedBundleFiles([
      file("bundle/index.md"),
      file("bundle/finance/revenue.md"),
      file("bundle/finance/log.md"),
      file("bundle/finance/index.md"),
    ]);

    expect(skipped).toBe(3);
    expect(uploadable.map((item) => item.path)).toEqual(["bundle/finance/revenue.md"]);
  });

  it("keeps a loose file the person chose deliberately", () => {
    const { uploadable, skipped } = partitionReservedBundleFiles([file("index.md")]);

    expect(skipped).toBe(0);
    expect(uploadable).toHaveLength(1);
  });

  it("does not skip files that merely start with a reserved name", () => {
    expect(isReservedBundleFile(file("bundle/index-of-terms.md"))).toBe(false);
    expect(isReservedBundleFile(file("bundle/catalog.md"))).toBe(false);
    expect(isReservedBundleFile(file("bundle/INDEX.MD"))).toBe(true);
  });
});
