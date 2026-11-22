import { Unzip, UnzipInflate, UnzipPassThrough } from "fflate";
import { appError } from "./appError";

const MAX_EXPANDED_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 1_000;

/** Check the actual expanded bytes before handing an Office archive to a parser. */
export function assertOfficeArchiveBudget(bytes: Uint8Array, maxExpandedBytes = MAX_EXPANDED_BYTES): void {
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw appError("INVALID_INPUT", "Invalid Office archive");
  }

  let entries = 0;
  let expanded = 0;
  const archive = new Unzip((file) => {
    entries += 1;
    if (entries > MAX_ENTRIES) throw appError("INVALID_INPUT", "Office archive has too many entries");
    if (file.originalSize !== undefined && expanded + file.originalSize > maxExpandedBytes) {
      throw appError("INVALID_INPUT", "Office archive expanded beyond the safe limit");
    }
    file.ondata = (error, chunk) => {
      if (error) throw error;
      expanded += chunk?.length ?? 0;
      if (expanded > maxExpandedBytes) throw appError("INVALID_INPUT", "Office archive expanded beyond the safe limit");
    };
    file.start();
  });
  archive.register(UnzipInflate);
  archive.register(UnzipPassThrough);
  for (let offset = 0; offset < bytes.length; offset += 1024) {
    archive.push(bytes.subarray(offset, offset + 1024), offset + 1024 >= bytes.length);
  }
  if (entries === 0) throw appError("INVALID_INPUT", "Office archive has no files");
}
