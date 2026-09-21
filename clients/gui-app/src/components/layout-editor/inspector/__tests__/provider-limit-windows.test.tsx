import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  StatusBarProviderSegmentModel,
  StatusBarRateLimitWindow,
} from "@/hooks/rate-limits/use-status-bar-rate-limit-segments";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * The passivity contract, pinned where it is actually decided.
 *
 * Every other suite mocks `useProviderLimitWindows` itself - which is right
 * for what those suites are about and leaves the one promise this module
 * makes untested: opening a provider's level must not be able to start a
 * fetch, warm a cold provider, or report on a reading it caused (L-96). So
 * here the DEPENDENCY is mocked and the module under test is real, and what is
 * asserted is the argument it subscribes with.
 */

/** The half of the hook's argument this suite is about - see the loop below. */
interface SegmentsCall {
  readonly mode: string;
  readonly editing: boolean;
}

// The parameter is DECLARED so `segments.mock.calls` is a tuple with an
// element at 0; a `vi.fn(() => ...)` types its calls as `[]` and reading the
// argument is a compile error.
const segments = vi.hoisted(() =>
  vi.fn((_input: SegmentsCall) => ({
    cluster: { kind: "segments" as const, segments: CLUSTER_SEGMENTS },
    mountTargets: [],
    refresh: null,
  })),
);

vi.mock("@/hooks/rate-limits/use-status-bar-rate-limit-segments", () => ({
  useStatusBarRateLimitSegments: segments,
  useStatusBarWindowedProviders: () => [],
}));
vi.mock("@/hooks/host-scope/use-watch-host-scope", () => ({
  useWatchHostScope: () => ({
    scope: { hostId: "host-1" },
    hasExplicitPick: false,
  }),
}));
vi.mock("@/hooks/rate-limits/use-rate-limit-profile-selection", () => ({
  useRateLimitProfileSelection: () => ({ kind: "all" }),
}));

import { useProviderLimitWindows } from "@/components/layout-editor/inspector/provider-limit-windows";

const PROVIDER: RateLimitProviderId = "claude-code";
const OTHER: RateLimitProviderId = "codex";

function limitWindow(windowKey: string): StatusBarRateLimitWindow {
  return {
    windowKey,
    label: windowKey,
    labelIsDuration: true,
    kind: "session",
    usedPercent: 40,
    resetsAt: null,
    severity: "healthy",
  };
}

function segment(
  providerId: RateLimitProviderId,
  profileId: string | null,
  windowKeys: ReadonlyArray<string>,
  shownKeys: ReadonlyArray<string>,
): StatusBarProviderSegmentModel {
  const windows = windowKeys.map(limitWindow);
  const shown = shownKeys.map(limitWindow);
  return {
    providerId,
    profileId,
    account: null,
    hidden: false,
    state: "live",
    reason: null,
    windows,
    shown,
    tightest: shown.at(0) ?? null,
  };
}

/**
 * Two accounts of the same provider plus a second provider: both segments of
 * the first describe the same windows, and one of them is what the strip is
 * drawing right now.
 */
const CLUSTER_SEGMENTS: ReadonlyArray<StatusBarProviderSegmentModel> = [
  segment(PROVIDER, null, ["5h", "week"], ["5h"]),
  segment(PROVIDER, "profile-2", ["5h", "week"], ["5h"]),
  segment(OTHER, null, ["month"], ["month"]),
];

afterEach(() => {
  segments.mockClear();
});

describe("the provider level's window read (L-96)", () => {
  it("observes the strip's own segments passively, never a read of its own", () => {
    renderHook(() => useProviderLimitWindows(PROVIDER));

    expect(segments).toHaveBeenCalled();
    for (const [input] of segments.mock.calls) {
      expect(input).toMatchObject({ mode: "passive", editing: true });
    }
  });

  it("offers each window once, and says which of them is drawn", () => {
    const { result } = renderHook(() => useProviderLimitWindows(PROVIDER));

    // One entry per window however many accounts report it, and only this
    // provider's - the checklist is one provider's own limits.
    expect(result.current.windows.map((window) => window.windowKey)).toEqual([
      "5h",
      "week",
    ]);
    expect(result.current.drawnKeys).toEqual(["5h"]);
  });
});
