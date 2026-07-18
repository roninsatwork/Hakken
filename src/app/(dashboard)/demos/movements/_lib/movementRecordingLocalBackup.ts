import type { MovementFrameEnvelope } from "./movementTypes";

function slugifyBackupTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

export function createMovementRecordingBackupFilename({
  now = new Date(),
  schemaVersion,
  title,
}: {
  now?: Date;
  schemaVersion: number;
  title: string;
}) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-");
  return `sonae-movement-schema-v${schemaVersion}-${slugifyBackupTitle(title)}-${timestamp}.json`;
}

export function serializeMovementRecordingBackupPacket(packet: MovementFrameEnvelope) {
  return JSON.stringify(packet);
}

export function downloadMovementRecordingLocalBackup({
  documentObject = document,
  now,
  packet,
  title,
  urlObject = URL,
}: {
  documentObject?: Pick<Document, "body" | "createElement">;
  now?: Date;
  packet: MovementFrameEnvelope;
  title: string;
  urlObject?: Pick<typeof URL, "createObjectURL" | "revokeObjectURL">;
}) {
  const filename = createMovementRecordingBackupFilename({
    now,
    schemaVersion: packet.schemaVersion ?? 1,
    title,
  });
  const blob = new Blob([serializeMovementRecordingBackupPacket(packet)], {
    type: "application/json",
  });
  const objectUrl = urlObject.createObjectURL(blob);
  const anchor = documentObject.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.hidden = true;
  documentObject.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => urlObject.revokeObjectURL(objectUrl), 0);

  return { filename, packetHash: packet.sourcePacketHash };
}
