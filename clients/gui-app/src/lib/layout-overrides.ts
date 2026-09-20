import { createContext, use, useMemo } from "react";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import {
  PRESET_VALUES,
  type LayoutOverrides,
  type LayoutValues,
  type RailVisibility,
} from "@/lib/layout/layout-values";
import type { RailRegionId, RegionId } from "@/lib/layout/region-id";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * The ONE seam every layout value is read through, so a picture of an element
 * under a DIFFERENT value can be drawn by the real component rather than by a
 * second, drifting copy of it.
 *
 * The problem it solves: the editor's specimen stages, its style examples and
 * its preset miniatures all have to show what an option WOULD look like.
 * Wrapping the real leaf in an override makes the picture and the shipping
 * element the same implementation (L-11).
 *
 * Its shape is the store's shape one level down: a region's value bag and the
 * arrangement, both as partials. A region is the unit because a region is what
 * a section edits, and every leaf under one is a scalar (`pinnedFields`
 * aside) - so one spread per region IS the merge, and there is no second level
 * for an inner override to drop.
 *
 * ## The passivity contract (D11) - the part that is easy to get wrong
 *
 * An override changes what a mounted component DRAWS. It does not, and must
 * not, change whether one exists. So what may be wrapped is a VISUAL LEAF:
 * something that renders from props and these hooks and performs no app action.
 * A preview mount does no host fetch, opens no stream, registers no keyboard
 * handler, activates no picker and writes to no store. Mounting `AppStatusBar`
 * or a live `HarnessModelPicker` inside an override is not previewing, it is
 * running a second copy of the app's chrome.
 *
 * ## Ancestor seams an override cannot reach
 *
 * Several values decide whether a child is rendered at all, and they are read
 * by ancestors a depiction is nowhere near:
 *
 * - `AppShell` mounts the status-bar strip;
 * - `AppStatusBar` decides the usage cluster and the resource segment exist;
 * - `chat-messages` mounts the turn minimap;
 * - the chat tile decides its dock exists;
 * - `top-level-tab-host`, the mobile drawer and the palette gate on the Home
 *   tab's existence.
 *
 * Those read the same values through the same hooks, which is what makes a
 * region's `shown` one answer rather than two - but they are never WRAPPED: an
 * override above a mount decision would make a depiction mount real chrome.
 */
export interface LayoutOverride {
  /** Per region, then per leaf inside that region's value bag. */
  readonly values?: LayoutOverrides;
  /** Whole fields: an order, a side, a host. Each one is a leaf. */
  readonly arrangement?: Partial<LayoutArrangement>;
}

/**
 * Frozen and shared, so the common case - no provider anywhere above - costs
 * one stable context read. A fresh `{}` default would hand every consumer a new
 * identity on every render.
 */
const NO_OVERRIDE: LayoutOverride = Object.freeze({});

/**
 * Exported for `providers/layout-override-provider.tsx` and nothing else. The
 * provider lives in its own file because a module that exports both a component
 * and hooks breaks fast refresh (`react-refresh/only-export-components`), which
 * is the same three-file split `providers/runner-host-*` uses.
 */
export const LayoutOverrideContext = createContext<LayoutOverride>(NO_OVERRIDE);

/**
 * One override's regions onto another's, per region AND per leaf inside it.
 *
 * Two levels rather than one: the value under a region id is that region's
 * whole value bag, so `{...parent, ...child}` at the region level would let an
 * inner override about the model chip's style drop an outer override of the
 * chip's `shown` beside it.
 *
 * Used by `LayoutOverrideProvider`; not part of the read API.
 */
export function mergeOverrides(
  parent: LayoutOverride,
  child: LayoutOverride,
): LayoutOverride {
  return {
    values: mergeValues(parent.values, child.values),
    arrangement:
      parent.arrangement === undefined && child.arrangement === undefined
        ? undefined
        : { ...parent.arrangement, ...child.arrangement },
  };
}

function mergeValues(
  parent: LayoutOverrides | undefined,
  child: LayoutOverrides | undefined,
): LayoutOverrides | undefined {
  if (parent === undefined) return child;
  if (child === undefined) return parent;
  const merged: Record<string, object> = { ...parent };
  for (const [regionId, patch] of Object.entries(child)) {
    merged[regionId] = { ...merged[regionId], ...patch };
  }
  return merged;
}

/**
 * One region's whole value bag as this subtree should draw it.
 *
 * For a reader that genuinely draws from the whole bag - a usage segment reads
 * five leaves, the resource monitor four.
 */
export function useRegionValues<K extends RegionId>(
  regionId: K,
): LayoutValues[K] {
  const basePreset = useLayoutStore((state) => state.basePreset);
  const stored = useLayoutStore((state) => state.overrides[regionId]);
  const override = use(LayoutOverrideContext).values?.[regionId];
  return useMemo(
    () => layered(PRESET_VALUES[basePreset][regionId], stored, override),
    [basePreset, regionId, stored, override],
  );
}

/**
 * One leaf of one region.
 *
 * Subscribed to the region's own patch rather than to the whole store, which is
 * as fine-grained as the delta can be: an untouched region has no patch at all,
 * so its readers re-render only once the user first changes that region.
 */
export function useRegionValue<
  K extends RegionId,
  Key extends keyof LayoutValues[K] & string,
>(regionId: K, key: Key): LayoutValues[K][Key] {
  const basePreset = useLayoutStore((state) => state.basePreset);
  const stored = useLayoutStore((state) => state.overrides[regionId]);
  const override = use(LayoutOverrideContext).values?.[regionId];
  return (
    override?.[key] ?? stored?.[key] ?? PRESET_VALUES[basePreset][regionId][key]
  );
}

/**
 * Whether a region draws at all, which is the question every mount decision
 * asks. The rail regions are excluded because their `shown` is three-state:
 * `auto` needs the panel's own presence rule to answer (L-47), which is
 * {@link useRailVisibility}'s caller's job.
 */
export function useRegionShown(
  regionId: Exclude<RegionId, RailRegionId>,
): boolean {
  return useRegionValue(regionId, "shown") === "shown";
}

/** One rail panel's three-state visibility (L-47), resolved by its caller. */
export function useRailVisibility(regionId: RailRegionId): RailVisibility {
  return useRegionValue(regionId, "shown");
}

/**
 * The whole arrangement as this subtree should draw it. Prefer the field hook
 * below: this one's result changes whenever any field does.
 */
export function useLayoutArrangement(): LayoutArrangement {
  const stored = useLayoutStore((state) => state.arrangement);
  const override = use(LayoutOverrideContext).arrangement;
  return useMemo(
    () => (override === undefined ? stored : { ...stored, ...override }),
    [stored, override],
  );
}

/** One arrangement field, subscribed to exactly that field. */
export function useArrangementValue<Key extends keyof LayoutArrangement>(
  key: Key,
): LayoutArrangement[Key] {
  const stored = useLayoutStore((state) => state.arrangement[key]);
  const override = use(LayoutOverrideContext).arrangement?.[key];
  return override === undefined ? stored : override;
}

/**
 * The base, then the stored delta, then the subtree's override - the same order
 * the store itself resolves in, with one more layer on top.
 *
 * Generic over the VALUE BAG rather than the region id, so the base argument
 * infers it and the spread of two `Partial<Values>` onto a `Values` is a
 * `Values` rather than an indexed access TypeScript cannot follow.
 */
function layered<Values extends object>(
  base: Values,
  stored: Partial<Values> | undefined,
  override: Partial<Values> | undefined,
): Values {
  if (stored === undefined && override === undefined) return base;
  return { ...base, ...stored, ...override };
}
