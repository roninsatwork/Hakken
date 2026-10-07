import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { encodePng, pictureAttachments } from "./emailPictureEncoder";

/** The chart's picture as a PNG the Email Sender attaches inline (hakken-tasks-plan.md, item 3.2). */
describe("a picture as a PNG", () => {
  it("is a real, small, indexed-colour PNG whose pixels are the raster's", () => {
    const pixels = Uint8Array.from([0, 1, 2, 3, 3, 2]);
    const png = encodePng({ width: 3, height: 2, pixels });
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
    expect(png.readUInt32BE(16)).toBe(3);
    expect(png.readUInt32BE(20)).toBe(2);
    expect(png[25]).toBe(3);
    const idat = png.indexOf("IDAT");
    const length = png.readUInt32BE(idat - 4);
    const rows = inflateSync(png.subarray(idat + 4, idat + 4 + length));
    expect([...rows]).toEqual([0, 0, 1, 2, 0, 3, 3, 2]);
    expect(png.subarray(png.length - 8, png.length - 4).toString("ascii")).toBe("IEND");
  });

  it("goes as an inline attachment, by its content id", () => {
    const [attachment] = pictureAttachments([{ cid: "chart", bars: { values: [3, 9, 1], marked: [false, false, true], line: 5 } }]);
    expect(attachment).toMatchObject({ filename: "chart.png", content_type: "image/png", content_id: "chart" });
    const png = Buffer.from(attachment.content, "base64");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    // A whole four-week chart stays a few kilobytes.
    expect(png.length).toBeLessThan(8_000);
  });
});
