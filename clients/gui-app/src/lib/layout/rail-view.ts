import { useMemo } from "react";
import {
  leftPanelGroupsFromRail,
  panelVisibilityOverridesFromValues,
  RAIL_REGION_BY_PANEL,
  railFromLeftPanelGroups,
  railRegionForLeftPanelId,
  railVisibilityFor,
  type RailEntry,
} from "@/lib/layout/rail";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import {
  areLeftPanelGroupsEqual,
  type LeftPanelGroup,
  type LeftPanelId,
  type PanelVisibilityOverrideById,
} from "@/lib/left-panel-ids";
import type { LayoutValueKeysByRegion } from "@/lib/layout/layout-snapshot";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

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
 *
 * The two WRITERS go through `recordGesture`, like every other writer of the
 * same values (`inspector/region-control-io.ts`, `region-quick-verbs.tsx`).
 * That is not decoration: `watchExternalLayoutWrites` reads a write made
 * outside the editor's own depth as ANOTHER WINDOW's and rebases the entry
 * snapshot onto it, so a hide made from the rail's menu during a session was
 * neither undoable nor discardable (L-18, L-150(1)). `recordGesture` with no
 * session open is a pass-through, so the real sidebar's behaviour at rest is
 * exactly what it was.
 *
 * That the editor store is imported from here rather than the write being
 * recorded at the menu is the layering this module already sits in:
 * `lib/layout/editor-session.ts` and `editor-lease.ts` are the session's own
 * seams and import the same store, and putting the recording at the two menu
 * call sites instead would leave the next caller of these functions with the
 * same hole.
 */

/** The rail as the sidebar's group view, subscribed to the rail alone. */
export function useLeftPanelGroups(): ReadonlyArray<LeftPanelGroup> {
  const rail = useLayoutStore((state) => state.arrangement.rail);
  return useMemo(() => leftPanelGroupsFromRail(rail), [rail]);
}

/**
 * The rail's own entries, for the two surfaces that DRAW it rather than
 * consume its group view: the epic sidebar's icon column and the sample
 * workspace's copy of it.
 *
 * A boundary is an entry with an id of its own and the group view drops it
 * (L-25, L-115), so a rail that draws its dividers has to see the entries. It
 * is served here, beside the derivation, because this module is the rail's own
 * ancestor seam - what it answers is which panels EXIST and in what order, and
 * D11 keeps a specimen's preview out of a read that decides a mount.
 */
export function useLayoutRail(): ReadonlyArray<RailEntry> {
  return useLayoutStore((state) => state.arrangement.rail);
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
 *
 * `null` is not a pick, it is the ABSENCE of one, so it is a revert and takes
 * the answer out of the delta (L-133): recording `auto` would store a pick
 * that pins the panel against the day a preset sets a rail region to anything
 * else, and would put nine such records in a user's delta every time they
 * reset panel visibility.
 */
export function setRailVisibilityOverride(
  panelId: LeftPanelId,
  override: boolean | null,
): void {
  const regionId = railRegionForLeftPanelId(panelId);
  useLayoutEditorStore.getState().recordGesture(() => {
    if (override === null) {
      useLayoutStore.getState().clearRegionValues(regionId, ["shown"]);
      return;
    }
    useLayoutStore
      .getState()
      .setRegionValues(regionId, { shown: railVisibilityFor(override) });
  });
}

/** Every panel back on its own rule, as ONE write and one undo step. */
export function clearRailVisibilityOverrides(): void {
  const keysByRegion: LayoutValueKeysByRegion = Object.fromEntries(
    Object.values(RAIL_REGION_BY_PANEL).map((regionId) => [
      regionId,
      ["shown"],
    ]),
  );
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().clearRegionValuesMany(keysByRegion);
  });
}
