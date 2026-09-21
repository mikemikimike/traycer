import {
  type LayoutValues,
  type RegionValueKey,
} from "@/lib/layout/layout-values";
import { PRESET_VALUES } from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The dynamic half of the region grammar: reading and writing one control's
 * value by the registry's own `key`.
 *
 * `ControlSpec<K>.key` is `keyof LayoutValues[K] & string` for the region's
 * OWN `K`, which - as `RegionRowFacts`'s comment on `layout-regions.ts`
 * already states - cannot survive a walk over every region: `keyof` of a
 * union of the twenty-two regions' value shapes collapses to the one field
 * they all share (`shown`). Reading a section's rows generically off a plain
 * `RegionId` is exactly what keeps the grammar renderer un-written-per-region
 * (L-08), so this module reads and writes the dynamic key with `Reflect`
 * rather than a type assertion - the same way `layout-editor-store.ts`'s
 * `persistedDockMode` already reads one dynamic field.
 *
 * Two things make that seam sound rather than a cast in disguise (G1-08).
 *
 * The KEY is `RegionValueKey`, the union of every region's own value keys, so
 * a caller cannot hand this module an arbitrary string; which of those keys
 * belongs to which region is what `layout-regions-completeness.test.ts` holds
 * the registry to.
 *
 * The VALUE is parsed on the way in: `setRegionValues` runs the merged patch
 * through `resolvePersistedOverrides`, the same total resolver a rehydrate
 * uses, so a registry typo cannot persist, render from a default branch for a
 * session and then silently vanish on the next launch.
 */

/** Every shape a `ControlSpec` value can hold. */
export type RegionControlValue = boolean | string | ReadonlyArray<string>;

/** One control's current value, read off a region's own value bag. */
export function readControlValue(
  values: LayoutValues[RegionId],
  key: RegionValueKey,
): RegionControlValue {
  const raw: unknown = Reflect.get(values, key);
  if (typeof raw === "boolean" || typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }
  // A key the region does not have is a registry mistake, not a state:
  // answering `false` draws it as an off switch, which is how such a mistake
  // ships looking like a feature that does nothing (G1-22). Loud where it can
  // be fixed, and still a switch rather than a white screen where it cannot.
  if (import.meta.env.DEV) {
    throw new Error(`layout region has no control value for key: ${key}`);
  }
  return false;
}

/** One control's new value, written through the editor's gesture recording. */
export function writeControlValue(
  region: RegionId,
  key: RegionValueKey,
  value: RegionControlValue,
): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    const patch: Partial<LayoutValues[RegionId]> = {};
    Reflect.set(patch, key, value);
    useLayoutStore.getState().setRegionValues(region, patch);
  });
}

/** One control's value, put back to what the base preset says. */
export function revertControlValue(
  region: RegionId,
  key: RegionValueKey,
): void {
  const snapshot = getLayoutSnapshot();
  const base = PRESET_VALUES[snapshot.basePreset][region];
  writeControlValue(region, key, readControlValue(base, key));
}

/** Whether one control's key differs from the base preset (for its revert icon). */
export function isControlValueChanged(
  region: RegionId,
  key: RegionValueKey,
): boolean {
  return changedControlKeys(region, [key]).length > 0;
}

/**
 * Several of one region's controls at once, for a block that owns more than
 * one key: the Style examples, which write five between them (L-20, G1-17).
 *
 * `ReadonlyArray<string>` rather than `RegionValueKey` here because the caller
 * gets its keys from an example PATCH rather than from a declared control, and
 * the membership test below is a real one (`key in base`) rather than a
 * predicate that only says it is.
 */
export function changedControlKeys(
  region: RegionId,
  keys: ReadonlyArray<string>,
): ReadonlyArray<string> {
  const override = getLayoutSnapshot().overrides[region];
  if (override === undefined) return [];
  const changed = new Set(Object.keys(override));
  return keys.filter((key) => changed.has(key));
}

/** {@link changedControlKeys} put back, as ONE gesture and one undo step. */
export function revertControlValues(
  region: RegionId,
  keys: ReadonlyArray<string>,
): void {
  const base = PRESET_VALUES[getLayoutSnapshot().basePreset][region];
  const patch: Partial<LayoutValues[RegionId]> = {};
  for (const key of keys) {
    if (!(key in base)) continue;
    Reflect.set(patch, key, Reflect.get(base, key));
  }
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setRegionValues(region, patch);
  });
}
