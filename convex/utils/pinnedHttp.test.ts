import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import { fetchWorkflowAction } from "./safeWorkflowHttp";

const { requestMock } = vi.hoisted(() => ({ requestMock: vi.fn() }));
vi.mock("node:https", () => ({ request: requestMock }));
vi.mock("node:http", () => ({ request: requestMock }));

describe("the actual Node socket boundary", () => {
  test("connects to the validated IP with no DNS re-resolution or shared socket", async () => {
    const dns = vi.fn().mockResolvedValueOnce([{ address: "93.184.216.34" }])
      .mockResolvedValue([{ address: "127.0.0.1" }]);
    requestMock.mockImplementation((url, options, onResponse) => {
      expect(url.hostname).toBe("rebind.example"); // Host and TLS identity stay the original host.
      expect(options.agent).toBe(false);
      expect(options.headers["accept-encoding"]).toBe("identity");
      const one = vi.fn();
      options.lookup("rebind.example", {}, one);
      expect(one).toHaveBeenCalledWith(null, "93.184.216.34", 4);
      const all = vi.fn();
      options.lookup("rebind.example", { all: true }, all);
      expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.34", family: 4 }]);
      const request = new EventEmitter() as EventEmitter & { end: () => void };
      request.end = () => {
        const incoming = Object.assign(new PassThrough(), { headers: {}, statusCode: 200 });
        onResponse(incoming);
        incoming.end("checked socket");
      };
      return request;
    });
    const result = await fetchWorkflowAction("https://rebind.example/data", {}, { resolveHostname: dns });
    expect(result.body).toBe("checked socket");
    expect(dns).toHaveBeenCalledOnce();
    expect(requestMock).toHaveBeenCalledOnce();
  });
});
