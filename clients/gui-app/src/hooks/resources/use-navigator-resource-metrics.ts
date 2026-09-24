import { useRegionValue } from "@/lib/layout-overrides";
import {
  NAVIGATOR_RESOURCE_METRICS,
  type NavigatorResourceMetric,
} from "@/stores/settings/settings-store";

/** One shared empty list, so a row with the chips off never allocates. */
const NO_NAVIGATOR_RESOURCE_METRICS: ReadonlyArray<NavigatorResourceMetric> =
  [];

/**
 * Which readings a navigator or sidebar row prints, which is one question with
 * one owner: the Resource monitor's "Agent rows" switch (`agentRows`, G7).
 *
 * On means the fixed CPU / memory / processes set and a connected stream; off
 * means no chips. It is independent of the monitor's own Shown: the two used
 * to be one switch, so the rows could not be turned off without losing the
 * status bar reading too. `resources-stream-mount.tsx` connects the stream
 * while either of them wants it.
 *
 * Its own module rather than a second export beside the chip components: a
 * file that exports both a hook and components loses fast refresh for the
 * components.
 */
export function useNavigatorResourceMetrics(): ReadonlyArray<NavigatorResourceMetric> {
  return useRegionValue("resourceMonitor", "agentRows")
    ? NAVIGATOR_RESOURCE_METRICS
    : NO_NAVIGATOR_RESOURCE_METRICS;
}
