import { Suspense } from "react";
import { LocalTestAuthClient } from "./LocalTestAuthClient";

export default function LocalTestAuthPage() {
  const enabled =
    process.env.LOCAL_TEST_AUTH_ENABLED === "1" &&
    process.env.LOCAL_TEST_AUTH_ENVIRONMENT !== "production";

  return (
    <Suspense fallback={null}>
      <LocalTestAuthClient enabled={enabled} />
    </Suspense>
  );
}
