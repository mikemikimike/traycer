import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics, AnalyticsEvent } from "@/lib/analytics";
import { persistKey, STORE_KEYS } from "@/lib/persist";
import { ResourceTelemetryBridge } from "@/providers/resource-telemetry-bridge";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

const LAYOUT_SNAPSHOT_KEY = persistKey(STORE_KEYS.layoutSnapshot);

// The periodic sampler is exercised by its own suite; this one is about the
// second effect this bridge owns, `layout_snapshot`'s firing site.
vi.mock("@/lib/resources/resource-telemetry", () => ({
  startResourceTelemetry: () => () => undefined,
}));

beforeEach(() => {
  window.localStorage.removeItem(LAYOUT_SNAPSHOT_KEY);
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("<ResourceTelemetryBridge /> layout_snapshot firing (tech-plan section 7)", () => {
  it("fires layout_snapshot for the current layout on mount", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");

    render(<ResourceTelemetryBridge />);

    expect(trackSpy).toHaveBeenCalledExactlyOnceWith(
      AnalyticsEvent.LayoutSnapshot,
      expect.objectContaining({ base_preset: "default" }),
    );
  });

  it("does not fire a second time within the same 24h window on a remount", () => {
    const trackSpy = vi.spyOn(Analytics.getInstance(), "track");

    const first = render(<ResourceTelemetryBridge />);
    first.unmount();
    render(<ResourceTelemetryBridge />);

    expect(trackSpy).toHaveBeenCalledOnce();
  });
});
