import { PRESET_VALUES, type LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { getLayoutSnapshot } from "@/stores/layout/layout-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * The dynamic half of the region grammar: reading and writing one control's
 * value by the registry's own `key` string.
 *
 * `ControlSpec<K>.key` is `keyof LayoutValues[K] & string` for the region's
 * OWN `K`, which - as `RegionRowFacts`'s comment on `layout-regions.ts`
 * already states - cannot survive a walk over every region: `keyof` of a
 * union of the twenty-two regions' value shapes collapses to the one field
 * they all share (`shown`). Reading a section's rows generically off a plain
 * `RegionId` is exactly what keeps the grammar renderer un-written-per-region
 * (L-08), so this module reads and writes the dynamic key with `Reflect`
 * rather than a type assertion - the same way `layout-editor-store.ts`'s
 * `persistedDockMode` already reads one dynamic field. Every key this module
 * is ever handed comes straight from that SAME region's own `LAYOUT_REGIONS`
 * entry, which `layout-regions-completeness.test.ts` holds to naming only
 * keys its own `LayoutValues` branch has, so the runtime pairing is sound
 * even though the static type cannot say so.
 */

/** Every shape a `ControlSpec` value can hold. */
export type RegionControlValue = boolean | string | ReadonlyArray<string>;

/** One control's current value, read off a region's own value bag. */
export function readControlValue(
  values: LayoutValues[RegionId],
  key: string,
): RegionControlValue {
  const raw: unknown = Reflect.get(values, key);
  if (typeof raw === "boolean" || typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw.filter((entry): entry is string => typeof entry === "string");
  }
  return false;
}

/** One control's new value, written through the editor's gesture recording. */
export function writeControlValue(
  region: RegionId,
  key: string,
  value: RegionControlValue,
): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    const patch: Partial<LayoutValues[RegionId]> = {};
    Reflect.set(patch, key, value);
    useLayoutStore.getState().setRegionValues(region, patch);
  });
}

/** One control's value, put back to what the base preset says. */
export function revertControlValue(region: RegionId, key: string): void {
  const snapshot = getLayoutSnapshot();
  const base = PRESET_VALUES[snapshot.basePreset][region];
  writeControlValue(region, key, readControlValue(base, key));
}

/** Whether one control's key differs from the base preset (for its revert icon). */
export function isControlValueChanged(region: RegionId, key: string): boolean {
  const snapshot = getLayoutSnapshot();
  const override = snapshot.overrides[region];
  if (override === undefined) return false;
  return Object.keys(override).includes(key);
}
