import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

export async function GET() {
  if (process.env.E2E_AUTH_ENABLED !== "1") {
    return new NextResponse("Not found", { status: 404 });
  }

  const fixturePath = process.env.HAND_PROOF_FIXTURE_PATH;
  if (!fixturePath) {
    return new NextResponse("Hand proof fixture is not configured", { status: 404 });
  }

  try {
    const image = await readFile(fixturePath);
    return new NextResponse(image, {
      headers: {
        "cache-control": "no-store",
        "content-type": "image/png",
      },
    });
  } catch {
    return new NextResponse("Hand proof fixture is unavailable", { status: 404 });
  }
}
