import { useMemo } from "react";
import {
  leftPanelGroupsFromRail,
  panelVisibilityOverridesFromValues,
  RAIL_REGION_BY_PANEL,
  railFromLeftPanelGroups,
  railRegionForLeftPanelId,
  railVisibilityFor,
} from "@/lib/layout/layout-arrangement";
import { effectiveLayoutValues } from "@/lib/layout/layout-values";
import {
  areLeftPanelGroupsEqual,
  type LeftPanelGroup,
  type LeftPanelId,
  type PanelVisibilityOverrideById,
} from "@/stores/epics/left-panel-store";
import {
  useLayoutStore,
  type LayoutValuePatches,
} from "@/stores/layout/layout-store";

/**
 * The sidebar rail's shape, read and written where it actually lives.
 *
 * `arrangement.rail` and the nine rail regions' `shown` are the layout store's
 * (L-25, L-47), and the sidebar's grouped view is derived from them. This
 * module is that derivation and its writers, beside the bijection itself.
 *
 * It used to hang off `LeftPanelStore` as five members that each reached into
 * the layout store from inside a zustand action. That API lied about
 * ownership - a reader of the panel store believed it held rail shape - and
 * one of them, "clear every override", looped nine separate writes, which is
 * nine renders and, once a gesture is recorded, nine undo steps (G1-09).
 */

/** The rail as the sidebar's group view, subscribed to the rail alone. */
export function useLeftPanelGroups(): ReadonlyArray<LeftPanelGroup> {
  const rail = useLayoutStore((state) => state.arrangement.rail);
  return useMemo(() => leftPanelGroupsFromRail(rail), [rail]);
}

/** The same, for the non-React commit layer (canvas DnD). */
export function currentLeftPanelGroups(): ReadonlyArray<LeftPanelGroup> {
  return leftPanelGroupsFromRail(useLayoutStore.getState().arrangement.rail);
}

/**
 * The nine rail regions' three-state `shown` as the sparse show/hide map every
 * sidebar render path already reads (`isLeftPanelVisible`).
 */
export function usePanelVisibilityOverrides(): PanelVisibilityOverrideById {
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  return useMemo(
    () =>
      panelVisibilityOverridesFromValues(
        effectiveLayoutValues(basePreset, overrides),
      ),
    [basePreset, overrides],
  );
}

/**
 * The grouped view written back as a rail, in one write.
 *
 * Guarded on the GROUPS rather than on the resulting rail, because
 * `railFromLeftPanelGroups` mints a fresh divider id per call: a no-op drop
 * would otherwise advance `dividerSeq` and rewrite the rail with ids nothing
 * asked to change.
 */
export function applyLeftPanelGroups(
  nextGroups: ReadonlyArray<LeftPanelGroup>,
): void {
  if (areLeftPanelGroupsEqual(currentLeftPanelGroups(), nextGroups)) return;
  const arrangement = useLayoutStore.getState().arrangement;
  useLayoutStore.getState().setArrangement({
    ...arrangement,
    rail: railFromLeftPanelGroups(nextGroups, arrangement.dividerSeq),
  });
}

/**
 * One panel's Hide/Show, or `null` to put it back on its own presence rule
 * (L-47). Callers pass `null` whenever the value they are setting already
 * matches that rule, keeping the delta to real preferences.
 */
export function setRailVisibilityOverride(
  panelId: LeftPanelId,
  override: boolean | null,
): void {
  useLayoutStore.getState().setRegionValues(railRegionForLeftPanelId(panelId), {
    shown: railVisibilityFor(override),
  });
}

/** Every panel back on its own rule, as ONE write and one undo step. */
export function clearRailVisibilityOverrides(): void {
  const patches: LayoutValuePatches = Object.fromEntries(
    Object.values(RAIL_REGION_BY_PANEL).map((regionId) => [
      regionId,
      { shown: "auto" },
    ]),
  );
  useLayoutStore.getState().setRegionValuesMany(patches);
}
