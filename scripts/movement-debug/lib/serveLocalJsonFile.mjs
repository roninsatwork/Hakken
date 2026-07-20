import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export async function serveLocalJsonFile(filePath, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const fileStats = await stat(resolvedPath);
  const token = randomBytes(12).toString("hex");
  const routePath = `/${token}/${options.name || "movement-packet.json"}`;

  const server = createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", "http://127.0.0.1");
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
      "Content-Type": "application/json",
    };

    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        ...headers,
        "Access-Control-Allow-Headers": "content-type",
        "Access-Control-Allow-Methods": "GET,HEAD,OPTIONS",
      });
      response.end();
      return;
    }

    if (requestUrl.pathname !== routePath || !["GET", "HEAD"].includes(request.method || "")) {
      response.writeHead(404, headers);
      response.end(JSON.stringify({ error: "Not found" }));
      return;
    }

    response.writeHead(200, {
      ...headers,
      "Content-Length": String(fileStats.size),
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(resolvedPath)
      .once("error", (error) => {
        response.destroy(error);
      })
      .pipe(response);
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    await close(server);
    throw new Error("Could not start local JSON file server.");
  }

  return {
    close: () => close(server),
    url: `http://127.0.0.1:${address.port}${routePath}`,
  };
}
