import { useEffect } from "react";
import { subscribeAppSuspendRelease } from "@/lib/registries/app-suspend-release";
import { useRunnerHostOrNull } from "@/providers/use-runner-host";

/**
 * Releases hidden epics and lingering terminals once the app has stayed in the
 * background for the retention profile's delay (see `releaseForAppSuspend`).
 * A no-op on a profile without one. Mounted once at the app root OUTSIDE
 * `HostReadyGate`, next to `ChatSessionWakeRetryController`, for the same
 * reason: the sessions it releases outlive the gate, so a background landing
 * while the host is unavailable must still be heard.
 */
export function AppSuspendReleaseController() {
  const runnerHost = useRunnerHostOrNull();
  useEffect(() => {
    return subscribeAppSuspendRelease(runnerHost);
  }, [runnerHost]);
  return null;
}
