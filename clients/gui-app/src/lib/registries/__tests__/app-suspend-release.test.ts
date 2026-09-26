import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockRunnerHost } from "@traycer-clients/shared/host-client/mock/mock-runner-host";
import {
  DESKTOP_RETENTION_PROFILE,
  MOBILE_RETENTION_PROFILE,
  setRetentionProfile,
} from "@/stores/replica-memory/retention-profile";
import {
  releaseForAppSuspend,
  subscribeAppSuspendRelease,
} from "@/lib/registries/app-suspend-release";

const calls = vi.hoisted(() => ({
  order: [] as string[],
  /** Planes whose release throws, by the name each records in `order`. */
  throwing: new Set<string>(),
}));

function record(plane: string, released: number): number {
  calls.order.push(plane);
  if (calls.throwing.has(plane)) throw new Error(`${plane} failed`);
  return released;
}

vi.mock("@/lib/epics/epic-parking", () => ({
  parkUnwatchedEpicsNow: () => record("park-epics", 2),
  rearmParkWindowsAfterAppResume: () => {
    calls.order.push("rearm-park-windows");
  },
}));

vi.mock("@/lib/registries/terminal-session-registry", () => ({
  getTerminalSessionRegistry: () => ({
    disposeLingeringPlainTerminals: () => record("drop-terminals", 1),
  }),
}));

function makeRunnerHost(): MockRunnerHost {
  return new MockRunnerHost({
    signInUrl: "https://auth.traycer.invalid/sign-in",
    authnBaseUrl: "http://localhost:5005",
    localHost: null,
    hosts: [],
    workspaceFolderPickerPaths: undefined,
    hasLocalHost: undefined,
    traycerCli: undefined,
  });
}

describe("subscribeAppSuspendRelease", () => {
  beforeEach(() => {
    calls.order.length = 0;
    calls.throwing.clear();
  });

  afterEach(() => {
    setRetentionProfile(DESKTOP_RETENTION_PROFILE);
  });

  it("releases once the background lasts the profile's delay, epics first", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const afterMs = MOBILE_RETENTION_PROFILE.releaseHiddenAfterBackgroundMs;
    if (afterMs === null) throw new Error("mobile profile releases");
    const runnerHost = makeRunnerHost();
    const dispose = subscribeAppSuspendRelease(runnerHost);

    runnerHost.emitSystemBackgroundLasted(afterMs);

    expect(calls.order).toEqual(["park-epics", "drop-terminals"]);
    dispose();
    runnerHost.emitSystemBackgroundLasted(afterMs);
    expect(calls.order).toHaveLength(2);
  });

  it("leaves a background shorter than the delay alone", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const afterMs = MOBILE_RETENTION_PROFILE.releaseHiddenAfterBackgroundMs;
    if (afterMs === null) throw new Error("mobile profile releases");
    const runnerHost = makeRunnerHost();
    const dispose = subscribeAppSuspendRelease(runnerHost);

    runnerHost.emitSystemBackgroundLasted(afterMs - 1);

    expect(calls.order).toEqual([]);
    dispose();
  });

  it("hands refused parks back to their windows on every resume", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const runnerHost = makeRunnerHost();
    const dispose = subscribeAppSuspendRelease(runnerHost);

    runnerHost.emitSystemResumed({ backgroundedForMs: 30_000 });

    expect(calls.order).toEqual(["rearm-park-windows"]);
    dispose();
    runnerHost.emitSystemResumed({ backgroundedForMs: 30_000 });
    expect(calls.order).toHaveLength(1);
  });

  it("does nothing on a profile without a release delay", () => {
    const runnerHost = makeRunnerHost();
    const dispose = subscribeAppSuspendRelease(runnerHost);

    runnerHost.emitSystemBackgroundLasted(Number.MAX_SAFE_INTEGER);
    runnerHost.emitSystemResumed({ backgroundedForMs: 30_000 });

    expect(calls.order).toEqual([]);
    dispose();
  });

  it("does nothing without a runner host", () => {
    setRetentionProfile(MOBILE_RETENTION_PROFILE);
    const dispose = subscribeAppSuspendRelease(null);
    expect(calls.order).toEqual([]);
    dispose();
  });

  // The last chance before the OS suspends the runtime: one plane failing
  // must not keep the others' memory resident for the whole background.
  it("still runs the later planes when an earlier one throws", () => {
    calls.throwing.add("park-epics");

    expect(releaseForAppSuspend()).toEqual({
      parkedEpics: 0,
      disposedTerminals: 1,
    });
    expect(calls.order).toEqual(["park-epics", "drop-terminals"]);
  });
});
