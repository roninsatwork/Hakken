import { describe, expect, test } from "vitest";
import {
  buildVertexProviderConfig,
  DEFAULT_VERTEX_LOCATION,
  DEFAULT_VERTEX_PROJECT,
} from "./vertexProviderService";

describe("vertex provider service", () => {
  test("builds Vertex client config from environment values", () => {
    expect(
      buildVertexProviderConfig({
        env: {
          GOOGLE_CLOUD_PROJECT: "project-a",
          GOOGLE_CLOUD_LOCATION: "europe-west2",
          GOOGLE_CLIENT_EMAIL: "svc@example.com",
          GOOGLE_PRIVATE_KEY: "line-one\\nline-two",
        },
      })
    ).toEqual({
      project: "project-a",
      location: "europe-west2",
      credentials: {
        client_email: "svc@example.com",
        private_key: "line-one\nline-two",
      },
    });
  });

  test("uses stable Vertex defaults when project and location are not configured", () => {
    expect(
      buildVertexProviderConfig({
        env: {
          GOOGLE_CLIENT_EMAIL: "svc@example.com",
          GOOGLE_PRIVATE_KEY: "key",
        },
      })
    ).toMatchObject({
      project: DEFAULT_VERTEX_PROJECT,
      location: DEFAULT_VERTEX_LOCATION,
    });
  });

  test("throws a clear error when Vertex credentials are missing", () => {
    expect(() => buildVertexProviderConfig({ env: {} })).toThrow(
      "Vertex AI credentials are missing GOOGLE_CLIENT_EMAIL or GOOGLE_PRIVATE_KEY."
    );
  });
});
