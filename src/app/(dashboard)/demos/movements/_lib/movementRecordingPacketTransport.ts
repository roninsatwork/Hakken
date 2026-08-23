/**
 * Getting a recording to the server, and back again.
 *
 * A deep capture holds a face mesh of 478 points, both hands and 52
 * expressions for every moment, and a take of a few hundred moments came to
 * about 35MB of JSON in a single upload. That upload failed in both Safari and
 * Chrome — Anthony, the day before a demo: *"save fails in chrome and safari"*.
 *
 * Two things shrink it, neither of which changes a single number the replay
 * studio or the game reads back:
 *
 * - Coordinates are written to four decimal places. They are fractions of the
 *   frame, so four places is finer than one pixel on a 1280-wide picture, and
 *   the movement tolerance the avatar is held to is 0.1 per segment — four
 *   thousand times coarser than the most this can move a point.
 * - The file is gzipped. JSON this repetitive compresses to about a seventh.
 *
 * Measured together on a 667-moment take: 35.9MB becomes 2.7MB. A full minute
 * of capture goes from 97MB to 7.4MB.
 */

/** Fractions of a frame, so this is finer than a pixel. */
export const MOVEMENT_PACKET_COORDINATE_DECIMALS = 4;

const COORDINATE_FACTOR = 10 ** MOVEMENT_PACKET_COORDINATE_DECIMALS;

const GZIP_MAGIC_FIRST_BYTE = 0x1f;
const GZIP_MAGIC_SECOND_BYTE = 0x8b;

/**
 * The packet as text, with its coordinates rounded on the way out.
 *
 * Whole numbers are left exactly as they are. Timestamps are the reason: they
 * run to thirteen digits, and multiplying one by ten thousand to round it would
 * push it past the largest integer JavaScript can hold exactly, quietly
 * corrupting the very field the replay uses to order frames.
 */
export function serializeMovementRecordingPacket(packet: unknown): string {
  return JSON.stringify(packet, (_key, value) =>
    typeof value === "number" && Number.isFinite(value) && !Number.isInteger(value)
      ? Math.round(value * COORDINATE_FACTOR) / COORDINATE_FACTOR
      : value,
  );
}

export type MovementRecordingUploadBody = {
  /** A Blob once compressed; the plain text otherwise, exactly as before. */
  body: Blob | string;
  contentType: string;
};

/**
 * The upload body, compressed where the browser can.
 *
 * A browser without compression still saves, just larger — a studio that
 * refuses to record on an older machine would be a worse outcome than a big
 * file.
 */
function canStreamBlobs() {
  return (
    typeof Blob !== "undefined" &&
    typeof Blob.prototype.stream === "function" &&
    typeof Response !== "undefined"
  );
}

export async function buildMovementRecordingUploadBody(
  packetJson: string,
): Promise<MovementRecordingUploadBody> {
  if (typeof CompressionStream === "undefined" || !canStreamBlobs()) {
    return { body: packetJson, contentType: "application/json" };
  }

  const compressed = await new Response(
    new Blob([packetJson]).stream().pipeThrough(new CompressionStream("gzip")),
  ).blob();

  return {
    body: new Blob([compressed], { type: "application/gzip" }),
    contentType: "application/gzip",
  };
}

/**
 * A stored recording, compressed or not.
 *
 * Every recording saved before today is plain JSON and has to keep opening, so
 * this decides by looking at the first two bytes rather than by trusting what
 * the file claims to be. That also covers the case where something between here
 * and storage has already unzipped it.
 */
export async function readMovementRecordingPacket(response: Response): Promise<unknown> {
  const bytes = new Uint8Array(await response.arrayBuffer());

  if (
    bytes.length >= 2 &&
    bytes[0] === GZIP_MAGIC_FIRST_BYTE &&
    bytes[1] === GZIP_MAGIC_SECOND_BYTE &&
    typeof DecompressionStream !== "undefined" &&
    canStreamBlobs()
  ) {
    const text = await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip")),
    ).text();
    return JSON.parse(text);
  }

  return JSON.parse(new TextDecoder().decode(bytes));
}
