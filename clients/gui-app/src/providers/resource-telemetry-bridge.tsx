import { useEffect } from "react";
import { Analytics, AnalyticsEvent } from "@/lib/analytics";
import { layoutSnapshotProperties } from "@/lib/layout/layout-diff";
import { claimLayoutSnapshotWindow } from "@/lib/layout/layout-snapshot-gate";
import { startResourceTelemetry } from "@/lib/resources/resource-telemetry";
import { getLayoutSnapshot } from "@/stores/layout/layout-store";
import { useTabsStore } from "@/stores/tabs";

/**
 * Starts the periodic resource sampler for the lifetime of the app shell.
 *
 * The workload context is read here rather than inside the sampler so
 * `lib/resources/resource-telemetry.ts` stays store-free and directly
 * testable. It is read at sample time (not subscribed) - a sample is a
 * point-in-time reading, and subscribing would re-render this bridge on every
 * tab change for no benefit.
 *
 * `layout_snapshot` fires from this same mount point (tech-plan section 7)
 * rather than a third app-launch bootstrap: this component is already
 * mounted once for the shell's lifetime, which is exactly the "on app
 * launch" moment the event wants, and the 24h gate is what keeps a remount
 * from re-sending it.
 */
export function ResourceTelemetryBridge(): null {
  useEffect(
    () =>
      startResourceTelemetry(() => ({
        openTabs: useTabsStore.getState().stripOrder.length,
      })),
    [],
  );
  useEffect(() => {
    if (!claimLayoutSnapshotWindow(Date.now())) return;
    Analytics.getInstance().track(
      AnalyticsEvent.LayoutSnapshot,
      layoutSnapshotProperties(getLayoutSnapshot()),
    );
  }, []);
  return null;
}
