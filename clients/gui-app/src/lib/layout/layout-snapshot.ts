import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutPresetId } from "@/lib/layout/layout-presets";
import type { LayoutOverrides, LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * The whole layout as three fields, and the multi-region patch that writes it.
 *
 * Here rather than in the store because they are the MODEL's shapes: the diff,
 * the undo stack and the editor's session all take a snapshot in and give one
 * back, and none of them is about zustand. `LayoutStoreState` extends the
 * snapshot, so the store is still the one thing that holds a live one.
 */

/**
 * Three fields rather than a slice per surface, because the editor's own
 * gestures are all three at once - a preset applies values and leaves the
 * arrangement alone, Discard restores a whole snapshot, and the header's
 * "Compact + 3 changes" is a count over the delta. Effective values are
 * computed (`effectiveLayoutValues`) rather than stored, so a preset switch
 * keeps every change a user made on top of it.
 */
export interface LayoutSnapshot {
  readonly basePreset: LayoutPresetId;
  readonly overrides: LayoutOverrides;
  readonly arrangement: LayoutArrangement;
}

/** Several regions' patches applied as ONE write, one render and one undo step. */
export type LayoutValuePatches = {
  readonly [K in RegionId]?: Partial<LayoutValues[K]>;
};

/**
 * The same shape for a REVERT: which of each region's keys to take back out of
 * the delta (L-133), as one write.
 *
 * Stringly-typed keys for the same reason `clearRegionValues` takes them: a
 * caller's keys come from a patch or a registry row rather than from one
 * region's declared value shape, and the resolver on the write path is what
 * keeps the result sound.
 */
export type LayoutValueKeysByRegion = {
  readonly [K in RegionId]?: ReadonlyArray<string>;
};
