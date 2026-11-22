/** Bind an uncertain SEO callback to a tag we actually sent to DataForSEO. */
export async function seoPingbackProof(tag: string, password: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`seo-pingback:${tag}`));
  return Array.from(new Uint8Array(signed), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function seoPingbackProofMatches(tag: string, proof: string | null, password: string | undefined): Promise<boolean> {
  if (!password || !proof || !/^[a-f0-9]{64}$/.test(proof)) return false;
  const expected = await seoPingbackProof(tag, password);
  let difference = 0;
  for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ proof.charCodeAt(i);
  return difference === 0;
}
