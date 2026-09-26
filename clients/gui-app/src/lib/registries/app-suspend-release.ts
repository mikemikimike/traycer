import type { IRunnerHost } from "@traycer-clients/shared/platform/runner-host";
import {
  parkUnwatchedEpicsNow,
  rearmParkWindowsAfterAppResume,
} from "@/lib/epics/epic-parking";
import { appLogger } from "@/lib/logger";
import { getTerminalSessionRegistry } from "@/lib/registries/terminal-session-registry";
import { getRetentionProfile } from "@/stores/replica-memory/retention-profile";

/** What one app-suspend release let go of, for the log line and the tests. */
export interface AppSuspendRelease {
  readonly parkedEpics: number;
  readonly disposedTerminals: number;
}

/**
 * Release what nobody is looking at, once the app has stayed in the
 * background.
 *
 * Every retention plane already sheds its hidden sessions on a clock - the
 * five-minute park window and terminal linger - and a suspended runtime's
 * clocks do not run. So on a phone neither fired for as long as the app
 * stayed in the background, and the renderer went into it holding every
 * hidden epic and lingering terminal it had: the footprint the OS weighs when
 * it picks a process to kill.
 *
 * Each plane keeps its own rules about what may go; this only runs them now:
 *
 *  - epics not in a front pane are PARKED, through the same eligibility the
 *    window's end uses (unsynced edits, working agents and unsaved drafts are
 *    refused and wait);
 *  - lease-free plain terminals are disposed (the PTY runs host-side).
 *
 * Warm chats are not touched here. A park disposes that epic's chats
 * outright, and the chat registry's own TTL and cap own the rest.
 */
export function releaseForAppSuspend(): AppSuspendRelease {
  const parkedEpics = releasePlane("epics", parkUnwatchedEpicsNow);
  const disposedTerminals = releasePlane("terminals", () =>
    getTerminalSessionRegistry().disposeLingeringPlainTerminals(),
  );
  return { parkedEpics, disposedTerminals };
}

/**
 * One plane's release, isolated: a plane that throws is logged and counted as
 * having released nothing, and the planes after it still run. This is the last
 * chance before the OS suspends the runtime, so one failure must not keep the
 * others' memory resident for the whole background.
 */
function releasePlane(plane: string, release: () => number): number {
  try {
    return release();
  } catch (error) {
    appLogger.error("[app-suspend] plane release failed", { plane }, error);
    return 0;
  }
}

/**
 * Wire {@link releaseForAppSuspend} to the shell's background, gated by the
 * retention profile's `releaseHiddenAfterBackgroundMs`. Returns a disposer.
 *
 * The release waits for the background to LAST that long rather than running
 * on the pause edge: a quick switch to another app and back must not cold-open
 * every hidden task. The resume half hands the parks it could not make back to
 * their windows ({@link rearmParkWindowsAfterAppResume}).
 */
export function subscribeAppSuspendRelease(
  runnerHost: IRunnerHost | null,
): () => void {
  const afterMs = getRetentionProfile().releaseHiddenAfterBackgroundMs;
  if (runnerHost === null || afterMs === null) return () => undefined;
  const lasted = runnerHost.onSystemBackgroundLasted(afterMs, () => {
    try {
      const release = releaseForAppSuspend();
      appLogger.info("[app-suspend] released hidden sessions", { ...release });
    } catch (error) {
      // A plane that throws must not take the shell's other subscribers with
      // it; the clocks remain as the fallback.
      appLogger.error("[app-suspend] release failed", {}, error);
    }
  });
  const resumed = runnerHost.onSystemResumed(() => {
    rearmParkWindowsAfterAppResume();
  });
  return () => {
    lasted.dispose();
    resumed.dispose();
  };
}
