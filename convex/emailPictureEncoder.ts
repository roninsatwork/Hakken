"use node";

import { deflateSync } from "node:zlib";
import { PICTURE_PALETTE, rasterBars, type EmailPicture, type Raster } from "./utils/emailPictures";

/**
 * A picture an email carries, encoded as a PNG for the Email Sender
 * (docs/plans/active/hakken-tasks-plan.md, item 3.2): eight-bit indexed
 * colour from the four-colour palette, compressed with Node's own zlib, so it
 * needs no image library and stays a few kilobytes. What it draws is
 * `utils/emailPictures.ts`.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const typed = Buffer.concat([head.subarray(4), Buffer.from(data)]);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([head.subarray(0, 4), typed, tail]);
}

/** A raster of palette indexes as a PNG. */
export function encodePng(raster: Raster, palette = PICTURE_PALETTE): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(raster.width, 0);
  header.writeUInt32BE(raster.height, 4);
  header[8] = 8; // bit depth
  header[9] = 3; // indexed colour
  // Each row starts with its filter: none.
  const rows = Buffer.alloc((raster.width + 1) * raster.height);
  for (let y = 0; y < raster.height; y += 1) {
    rows[y * (raster.width + 1)] = 0;
    rows.set(raster.pixels.subarray(y * raster.width, (y + 1) * raster.width), y * (raster.width + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("PLTE", Uint8Array.from(palette.flat())),
    chunk("IDAT", deflateSync(rows, { level: 9 })),
    chunk("IEND", new Uint8Array()),
  ]);
}

/** Each picture as the attachment Resend sends inline, by its content id. */
export function pictureAttachments(pictures: EmailPicture[]) {
  return pictures.map((picture) => ({
    filename: `${picture.cid}.png`,
    content: encodePng(rasterBars(picture.bars)).toString("base64"),
    content_type: "image/png",
    content_id: picture.cid,
  }));
}
