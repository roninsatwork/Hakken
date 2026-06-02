export type ProviderFetch = typeof fetch;

export function assertTextOnlyContents(contents: Array<{ type: string }>, providerName: string) {
  const unsupported = contents.find((part) => part.type !== "text");
  if (unsupported) {
    throw new Error(`${providerName} adapter currently supports text-only generation for this runtime path.`);
  }
}

export async function parseProviderJsonResponse(response: Response, providerName: string) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) as unknown : null;

  if (!response.ok) {
    const errorMessage = payload && typeof payload === "object" && "error" in payload
      ? JSON.stringify((payload as { error: unknown }).error)
      : text || `${providerName} request failed.`;
    throw new Error(`${providerName} request failed: ${errorMessage}`);
  }

  return payload;
}
