/**
 * Bytes as standard base64, a chunk at a time so a large array never
 * overflows the call stack the way one `String.fromCharCode(...bytes)` can.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  const CHUNK = 0x8000;
  let binary = "";
  for (let start = 0; start < bytes.length; start += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(start, start + CHUNK));
  }
  return btoa(binary);
}
