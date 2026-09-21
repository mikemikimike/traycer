import type { ContextUsageRowKey } from "@/lib/context-usage-rows";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * What every region SHOWS, as one value per region: how much of itself it
 * spells out, and whether it is there at all.
 *
 * The line this file draws is the one that makes L-20 a type-level fact rather
 * than a promise: a preset is a complete `LayoutValues`, and `LayoutValues`
 * contains no order, no side and no host - so a density can only ever change
 * how much a region says, never where it lives. Everything positional is in
 * `layout-arrangement.ts`.
 *
 * The shapes and the per-key comparisons only. The three presets and the
 * effective value are in `layout-presets.ts`, and reading a stored delta back
 * is `layout-values-persist.ts`.
 */

export type Visibility = "shown" | "hidden";

/**
 * Rail panels with a presence rule (L-47). `auto` follows the panel's own rule
 * - a Pull requests icon that appears once the repo has pull requests - and is
 * the default, so a panel nobody has touched behaves exactly as it shipped.
 */
export type RailVisibility = "auto" | "shown" | "hidden";

/** An element that shrinks rather than disappears: the chip keeps every verb. */
export type RegionSize = "full" | "chip";

/** How the model chip draws the thinking effort. */
export type ModelStyle = "text" | "bars" | "bars-text";

/** How the context chip draws what is left of the window. */
export type ContextStyle = "text" | "ring" | "ring-only";

/** Whether a usage reading is consumed or headroom. */
export type AmountMode = "used" | "remaining";

/**
 * One row of the pinned context breakdown. The breakdown's own row keys, so
 * the picker can only name a row the strip knows how to draw.
 */
export type ContextBreakdownField = ContextUsageRowKey;

/**
 * Every enum value some `LayoutValues` leaf can hold, as one list.
 *
 * A `Record` per enum rather than an array of each union, because a `Record`
 * is what makes a new member a COMPILE error here - an array typed as the
 * union does not have to be complete. The keys merge, so a value two enums
 * share is named once.
 *
 * `lib/analytics.ts` validates every `layout_<region>_<key>` property against
 * this set. Hand-listing it there let a fourth `ModelStyle` land with the
 * allowlist behind, and a declared value that fails its validator drops the
 * WHOLE `layout_snapshot` event for every user with nothing red anywhere
 * (G3-03).
 */
export const LAYOUT_VALUE_ENUM_MEMBERS: ReadonlyArray<string> = Object.keys({
  ...({ shown: true, hidden: true } satisfies Record<Visibility, true>),
  ...({ auto: true, shown: true, hidden: true } satisfies Record<
    RailVisibility,
    true
  >),
  ...({ full: true, chip: true } satisfies Record<RegionSize, true>),
  ...({ text: true, bars: true, "bars-text": true } satisfies Record<
    ModelStyle,
    true
  >),
  ...({ text: true, ring: true, "ring-only": true } satisfies Record<
    ContextStyle,
    true
  >),
  ...({ used: true, remaining: true } satisfies Record<AmountMode, true>),
});

export interface ShownValues {
  readonly shown: Visibility;
}

export interface SizedValues extends ShownValues {
  readonly size: RegionSize;
}

export interface RailValues {
  readonly shown: RailVisibility;
}

export interface UsageLimitsValues extends ShownValues {
  readonly bar: boolean;
  readonly percent: boolean;
  readonly word: boolean;
  readonly reset: boolean;
  readonly amount: AmountMode;
}

/** Shipped default is cpu + processes on, memory and ramShare off. */
export interface ResourceMonitorValues extends ShownValues {
  readonly cpu: boolean;
  readonly memory: boolean;
  readonly processes: boolean;
  readonly ramShare: boolean;
}

/** The four readings the monitor can print, in the order it prints them. */
export type ResourceMetric = "cpu" | "memory" | "processes" | "ramShare";

const RESOURCE_METRIC_IDS: ReadonlyArray<ResourceMetric> = [
  "cpu",
  "memory",
  "processes",
  "ramShare",
];

/**
 * Which readings are on, in canonical order rather than in toggle order, so
 * the segment reads the same whichever order they were switched on in.
 */
export function shownResourceMetrics(
  values: ResourceMonitorValues,
): ReadonlyArray<ResourceMetric> {
  return RESOURCE_METRIC_IDS.filter((metric) => values[metric]);
}

export interface ContextUsageValues extends ShownValues {
  readonly style: ContextStyle;
  readonly pinBreakdown: boolean;
  readonly pinnedFields: ReadonlyArray<ContextBreakdownField>;
  readonly compactButton: Visibility;
}

export interface ModelValues extends ShownValues {
  readonly style: ModelStyle;
}

export interface LayoutValues {
  readonly homeTab: ShownValues;
  readonly usageLimits: UsageLimitsValues;
  readonly resourceMonitor: ResourceMonitorValues;
  readonly minimap: ShownValues;
  readonly contextUsage: ContextUsageValues;
  readonly runningAgents: SizedValues;
  readonly changedFiles: SizedValues;
  readonly background: SizedValues;
  readonly queue: SizedValues;
  readonly todo: SizedValues;
  readonly attachImage: ShownValues;
  readonly access: SizedValues;
  readonly model: ModelValues;
  readonly mic: ShownValues;
  readonly railAgents: RailValues;
  readonly railTerminals: RailValues;
  readonly railBrowsers: RailValues;
  readonly railArtifacts: RailValues;
  readonly railGitDiff: RailValues;
  readonly railPullRequests: RailValues;
  readonly railFileTree: RailValues;
  readonly railSharing: RailValues;
  readonly railComments: RailValues;
}

/**
 * The delta against the base preset, and only the delta: a key whose value
 * equals the base's is dropped rather than written, both on the setter and on
 * rehydration. That is what makes the change count a count of this map's keys
 * and per-row revert a `delete`.
 */
export type LayoutOverrides = {
  readonly [K in RegionId]?: Partial<LayoutValues[K]>;
};

/**
 * Every key some region's value bag has, as one union.
 *
 * The UNION and not the intersection, which is what `keyof LayoutValues[RegionId]`
 * gives (`shown`, the only key all twenty-three share). It is the type a caller
 * walking every region can still name a control's key with - the registry's
 * own `ControlSpec<K>.key` stays tied to its region - so `region-control-io.ts`
 * takes this rather than a bare `string` and a typo cannot be passed at all
 * (G1-08).
 */
export type RegionValueKey = {
  readonly [K in RegionId]: keyof LayoutValues[K] & string;
}[RegionId];

/** The one non-scalar leaf's comparator, order-sensitive because it is drawn in order. */
export function sameFieldList(
  left: ReadonlyArray<string>,
  right: ReadonlyArray<string>,
): boolean {
  return (
    left.length === right.length &&
    left.every((field, index) => field === right[index])
  );
}

/**
 * Per-key equality over a region's value bag.
 *
 * Every leaf but `pinnedFields` is a scalar, which is the whole reason the
 * four resource metrics are booleans rather than a list (C-10), so `===` is
 * the rule and the one list gets the one declared comparator.
 */
export function sameRegionValue(
  key: string,
  left: unknown,
  right: unknown,
): boolean {
  if (key !== "pinnedFields") return left === right;
  return isStringList(left) && isStringList(right)
    ? sameFieldList(left, right)
    : left === right;
}

/**
 * The keys a patch actually carries.
 *
 * A patch is only ever built from parsed values - a setter's argument, or the
 * persisted resolver's output - so its keys ARE that value bag's keys; the
 * predicate states that, because `Object.keys` cannot.
 */
export function overrideKeys<Values extends object>(
  patch: Partial<Values>,
): ReadonlyArray<keyof Values & string> {
  return Object.keys(patch).filter(
    (key): key is keyof Values & string => key in patch,
  );
}

export function isStringList(value: unknown): value is ReadonlyArray<string> {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}
