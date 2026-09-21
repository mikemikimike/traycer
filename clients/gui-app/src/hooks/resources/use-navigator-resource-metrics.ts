import { useRegionShown } from "@/lib/layout-overrides";
import {
  NAVIGATOR_RESOURCE_METRICS,
  type NavigatorResourceMetric,
} from "@/stores/settings/settings-store";

/** One shared empty list, so a row with the chips off never allocates. */
const NO_NAVIGATOR_RESOURCE_METRICS: ReadonlyArray<NavigatorResourceMetric> =
  [];

/**
 * Which readings a navigator or sidebar row prints, which is one question with
 * one owner (L-60): the Resource monitor region's Shown switch.
 *
 * Shown means the fixed CPU / memory / processes set and a connected stream;
 * hidden means no chips and no stream, which is the same switch
 * `resources-stream-mount.tsx` gates the subscription on. Without this the
 * chips printed for every user with no control anywhere, and hiding the
 * status-bar segment left them drawing dashes forever (G1-05).
 *
 * Its own module rather than a second export beside the chip components: a
 * file that exports both a hook and components loses fast refresh for the
 * components.
 */
export function useNavigatorResourceMetrics(): ReadonlyArray<NavigatorResourceMetric> {
  return useRegionShown("resourceMonitor")
    ? NAVIGATOR_RESOURCE_METRICS
    : NO_NAVIGATOR_RESOURCE_METRICS;
}
