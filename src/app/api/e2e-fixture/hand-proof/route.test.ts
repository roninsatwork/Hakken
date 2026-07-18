import { afterEach, describe, expect, it, vi } from "vitest";

const { readFile } = vi.hoisted(() => ({ readFile: vi.fn() }));
vi.mock("node:fs/promises", () => ({ default: { readFile }, readFile }));

import { GET } from "./route";

const originalE2EAuthEnabled = process.env.E2E_AUTH_ENABLED;
const originalFixturePath = process.env.HAND_PROOF_FIXTURE_PATH;

afterEach(() => {
  process.env.E2E_AUTH_ENABLED = originalE2EAuthEnabled;
  process.env.HAND_PROOF_FIXTURE_PATH = originalFixturePath;
  readFile.mockReset();
});

describe("GET /api/e2e-fixture/hand-proof", () => {
  it("is unavailable outside the deterministic E2E lane", async () => {
    delete process.env.E2E_AUTH_ENABLED;
    process.env.HAND_PROOF_FIXTURE_PATH = "/private/fixture.png";

    expect(await GET()).toMatchObject({ status: 404 });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("does not read an arbitrary path when the fixture is unconfigured", async () => {
    process.env.E2E_AUTH_ENABLED = "1";
    delete process.env.HAND_PROOF_FIXTURE_PATH;

    expect(await GET()).toMatchObject({ status: 404 });
    expect(readFile).not.toHaveBeenCalled();
  });

  it("serves only the environment-owned local PNG fixture without caching", async () => {
    process.env.E2E_AUTH_ENABLED = "1";
    process.env.HAND_PROOF_FIXTURE_PATH = "/private/fixture.png";
    readFile.mockResolvedValue(new Uint8Array([137, 80, 78, 71]));

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(readFile).toHaveBeenCalledWith("/private/fixture.png");
  });
});
