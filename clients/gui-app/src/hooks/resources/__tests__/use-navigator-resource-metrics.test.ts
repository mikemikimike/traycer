import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { useNavigatorResourceMetrics } from "@/hooks/resources/use-navigator-resource-metrics";
import { NAVIGATOR_RESOURCE_METRICS } from "@/stores/settings/settings-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * `agentRows` and `shown` used to be one switch (G7); this hook now reads
 * `agentRows` alone, independent of whether the monitor itself is shown.
 */
function setResourceMonitor(values: {
  readonly shown: boolean;
  readonly agentRows: boolean;
}): void {
  useLayoutStore.getState().setRegionValues("resourceMonitor", {
    shown: values.shown ? "shown" : "hidden",
    agentRows: values.agentRows,
  });
}

function resetStore(): void {
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
}

beforeEach(resetStore);
afterEach(() => {
  cleanup();
  resetStore();
});

describe("useNavigatorResourceMetrics", () => {
  it("returns the full metric list when agentRows is on, even with the monitor hidden", () => {
    setResourceMonitor({ shown: false, agentRows: true });

    const { result } = renderHook(() => useNavigatorResourceMetrics());

    expect(result.current).toEqual(NAVIGATOR_RESOURCE_METRICS);
  });

  it("returns no metrics when agentRows is off, even with the monitor shown", () => {
    setResourceMonitor({ shown: true, agentRows: false });

    const { result } = renderHook(() => useNavigatorResourceMetrics());

    expect(result.current).toEqual([]);
  });

  it("returns the full metric list when both agentRows and shown are on", () => {
    setResourceMonitor({ shown: true, agentRows: true });

    const { result } = renderHook(() => useNavigatorResourceMetrics());

    expect(result.current).toEqual(NAVIGATOR_RESOURCE_METRICS);
  });

  it("returns no metrics when both agentRows and shown are off", () => {
    setResourceMonitor({ shown: false, agentRows: false });

    const { result } = renderHook(() => useNavigatorResourceMetrics());

    expect(result.current).toEqual([]);
  });
});
