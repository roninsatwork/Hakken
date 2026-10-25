type E2EEnvironment = {
  E2E_AUTH_ENABLED?: string;
  E2E_AUTH_ENVIRONMENT?: string;
  NODE_ENV?: string;
};

/** The E2E bypass is opt-in only on an explicitly labelled local runtime. */
export function isE2EAuthRuntimeEnabled(environment: E2EEnvironment = process.env): boolean {
  return environment.E2E_AUTH_ENABLED === "1"
    && environment.E2E_AUTH_ENVIRONMENT === "local"
    && environment.NODE_ENV !== "production";
}
