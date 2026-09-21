import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { RailVisibility } from "@/lib/layout/layout-values";
import { RAIL_REGION_IDS } from "@/lib/layout/rail";
import type { RailRegionId, RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * Every write an editor session makes, each as ONE recorded gesture.
 *
 * One module above both surfaces rather than one per surface: the inspector's
 * rows and the canvas's drag change the same two things, and a write that
 * skipped `recordGesture` would be a change the undo stack never saw -
 * invisible until someone pressed undo and the wrong thing moved. It is also
 * what makes a whole drag one step: the reflow is paint, and the drop calls
 * {@link writeArrangement} exactly once.
 */

export function isRailRegionId(id: RegionId): id is RailRegionId {
  return RAIL_REGION_IDS.some((candidate) => candidate === id);
}

/**
 * What a region's `shown` becomes when it is turned ON.
 *
 * A rail panel goes to `auto` rather than `shown`: its own presence rule is the
 * default, and pinning it open is a separate answer the three-state control
 * gives (L-47). One function because two surfaces turn a region on - the
 * inspector's switch and a right-click quick verb - and a second copy of this
 * rule would be a rail panel that comes back pinned from one of them.
 */
export function regionShownOnValue(regionId: RegionId): RailVisibility {
  return isRailRegionId(regionId) ? "auto" : "shown";
}

/** The one rule for a region's Shown switch, tri-state rail included (L-47). */
export function setRegionShown(regionId: RegionId, next: boolean): void {
  const shown = next ? regionShownOnValue(regionId) : "hidden";
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setRegionValues(regionId, { shown });
  });
}

/** Every arrangement write from a section, as one recorded gesture. */
export function writeArrangement(arrangement: LayoutArrangement): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setArrangement(arrangement);
  });
}
