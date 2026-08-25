/**
 * File collection for bulk knowledge upload.
 *
 * Kept out of KnowledgeManager because the browser's folder APIs have two
 * traps worth testing directly: a directory reader returns entries in batches
 * and must be drained until empty, and a dropped folder arrives through a
 * different API from a picked one.
 *
 * See docs/plans/active/knowledge-markdown-and-bulk-upload-plan.md.
 */

/** A single file plus where it sat inside the dropped folder, if it came from one. */
export type CollectedFile = {
  file: File;
  /** Slash-separated path relative to the dropped or picked folder root. */
  path: string;
};

export const MAX_BULK_UPLOAD_FILES = 500;

export type UploadQueueEntry = {
  key: string;
  title: string;
  status: "waiting" | "uploading" | "queued" | "failed";
  error?: string;
};

export const UPLOAD_STATUS_KEYS: Record<UploadQueueEntry["status"], string> = {
  waiting: "uploadStatus.waiting",
  uploading: "uploadStatus.uploading",
  queued: "uploadStatus.queued",
  failed: "uploadStatus.failed",
};

/**
 * Collect one past the cap so the caller can tell "exactly at the limit" from
 * "more than we will take" and say so, rather than silently dropping the tail.
 */
const COLLECT_LIMIT = MAX_BULK_UPLOAD_FILES + 1;

/** Concurrent browser-side uploads. Keeps a large batch from opening 500 sockets. */
export const UPLOAD_CONCURRENCY = 4;

type DirectoryReaderLike = {
  readEntries: (
    onSuccess: (entries: FileSystemEntryLike[]) => void,
    onError?: (error: unknown) => void,
  ) => void;
};

type FileSystemEntryLike = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (onSuccess: (file: File) => void, onError?: (error: unknown) => void) => void;
  createReader?: () => DirectoryReaderLike;
};

function joinPath(prefix: string, name: string) {
  return prefix ? `${prefix}/${name}` : name;
}

function readEntryFile(entry: FileSystemEntryLike) {
  return new Promise<File | null>((resolve) => {
    if (!entry.file) {
      resolve(null);
      return;
    }
    entry.file(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

/**
 * `readEntries` hands back at most 100 entries per call and signals the end of
 * the directory with an empty batch. Reading once silently truncates any folder
 * holding more than 100 files — which an OKF bundle very often does.
 */
function readAllDirectoryEntries(reader: DirectoryReaderLike) {
  return new Promise<FileSystemEntryLike[]>((resolve) => {
    const entries: FileSystemEntryLike[] = [];

    const readBatch = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        },
        () => resolve(entries),
      );
    };

    readBatch();
  });
}

async function walkEntry(entry: FileSystemEntryLike, prefix: string, collected: CollectedFile[]) {
  if (collected.length >= COLLECT_LIMIT) return;

  if (entry.isFile) {
    const file = await readEntryFile(entry);
    if (file) collected.push({ file, path: joinPath(prefix, entry.name) });
    return;
  }

  if (!entry.isDirectory || !entry.createReader) return;

  const children = await readAllDirectoryEntries(entry.createReader());
  for (const child of children) {
    await walkEntry(child, joinPath(prefix, entry.name), collected);
    if (collected.length >= COLLECT_LIMIT) return;
  }
}

/**
 * Pulls every file out of a drop, walking into folders at any depth. Falls back
 * to the flat file list on browsers that do not expose the entry API.
 */
export async function collectDroppedFiles(dataTransfer: DataTransfer): Promise<CollectedFile[]> {
  const items = Array.from(dataTransfer.items ?? []);
  const entries = items
    .map((item): FileSystemEntryLike | null => {
      const getEntry = (item as { webkitGetAsEntry?: () => unknown }).webkitGetAsEntry;
      if (typeof getEntry !== "function") return null;
      return (getEntry.call(item) as FileSystemEntryLike | null) ?? null;
    })
    .filter((entry): entry is FileSystemEntryLike => entry !== null);

  if (entries.length === 0) {
    return collectPickedFiles(dataTransfer.files);
  }

  const collected: CollectedFile[] = [];
  for (const entry of entries) {
    await walkEntry(entry, "", collected);
  }
  return collected;
}

/**
 * Files chosen through the picker. A folder picked with `webkitdirectory` sets
 * `webkitRelativePath`, which already carries the path we want.
 */
export function collectPickedFiles(fileList: FileList | null): CollectedFile[] {
  if (!fileList) return [];

  return Array.from(fileList)
    .slice(0, COLLECT_LIMIT)
    .map((file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
      return { file, path: relativePath && relativePath.length > 0 ? relativePath : file.name };
    });
}

/**
 * The name a document is listed under. Folder uploads keep their path so a
 * bundle stays readable and two files called `index.md` in different folders
 * do not collide. The top folder is dropped — it is the same for every file in
 * the batch and only adds width to the list.
 */
export function buildUploadTitle(collected: CollectedFile) {
  const segments = collected.path.split("/").filter(Boolean);
  if (segments.length <= 1) return collected.file.name;
  return segments.slice(1).join("/");
}

/**
 * `index.md` and `log.md` are reserved OKF filenames — a directory listing and
 * an update history. They are links and changelog entries, not retrievable
 * facts, so a bundle upload leaves them out.
 *
 * Only inside a folder: a file deliberately dropped on its own is whatever the
 * person meant it to be, and skipping it silently would be baffling.
 */
const RESERVED_OKF_FILENAMES = ["index.md", "log.md"];

export function isReservedBundleFile(collected: CollectedFile) {
  const segments = collected.path.split("/").filter(Boolean);
  if (segments.length < 2) return false;

  const filename = segments[segments.length - 1].toLowerCase();
  return RESERVED_OKF_FILENAMES.includes(filename);
}

export function partitionReservedBundleFiles(collected: CollectedFile[]) {
  const uploadable: CollectedFile[] = [];
  let skipped = 0;

  for (const item of collected) {
    if (isReservedBundleFile(item)) {
      skipped += 1;
      continue;
    }
    uploadable.push(item);
  }

  return { uploadable, skipped };
}

/** Runs `worker` over `items`, never more than `limit` at once, in order. */
export async function mapWithConcurrency<TItem, TResult>(
  items: TItem[],
  limit: number,
  worker: (item: TItem, index: number) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
