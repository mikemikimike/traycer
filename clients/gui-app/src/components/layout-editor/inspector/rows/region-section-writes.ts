import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import { RAIL_REGION_IDS } from "@/lib/layout/rail";
import type { RailRegionId, RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * Every write a region's section makes, each as ONE recorded gesture.
 *
 * Shared by the row renderers rather than repeated in them, because a write
 * that skipped `recordGesture` would be a change the editor's undo stack never
 * saw - invisible until someone pressed undo and the wrong thing moved.
 */

export function isRailRegionId(id: RegionId): id is RailRegionId {
  return RAIL_REGION_IDS.some((candidate) => candidate === id);
}

/** The one rule for a region's Shown switch, tri-state rail included (L-47). */
export function setRegionShown(regionId: RegionId, next: boolean): void {
  // A rail panel turned back ON goes to `auto` rather than `shown`: its own
  // presence rule is the default, and pinning it open is a separate answer the
  // three-state control gives (L-47).
  const onValue = isRailRegionId(regionId) ? "auto" : "shown";
  const shown = next ? onValue : "hidden";
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
