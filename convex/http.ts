import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Attach `@convex-dev/auth` endpoints to the Convex HTTP router
// This enables OAuth callbacks and Magic Link verification endpoints
auth.addHttpRoutes(http);

export default http;
