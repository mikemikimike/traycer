import {
  CONTEXT_USAGE_ROW_KEYS,
  type ContextUsageRowKey,
} from "@/components/chat/context-usage";
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
 * The values are held as a BASE PRESET plus a minimal override delta
 * (`LayoutOverrides`), so "Compact + 3 changes" is readable off the store
 * rather than re-derived, and a preset switch keeps the three changes.
 */

export type LayoutPresetId = "default" | "compact" | "detailed";

export const LAYOUT_PRESET_IDS: ReadonlyArray<LayoutPresetId> = [
  "default",
  "compact",
  "detailed",
];

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

export const RESOURCE_METRIC_IDS: ReadonlyArray<ResourceMetric> = [
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
  readonly attachImage: ShownValues;
  readonly access: SizedValues;
  readonly agent: ShownValues;
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
 * Every region exactly as the app ships it, which is also the Default preset.
 *
 * One constant rather than two, so "Default is the defaults" cannot drift into
 * a copy that lags - and so analytics can say "differs from the SHIPPED
 * Default" (L-46) by reading the same object the preset reads.
 */
export const SHIPPED_DEFAULT_VALUES: LayoutValues = {
  homeTab: { shown: "hidden" },
  usageLimits: {
    shown: "shown",
    bar: true,
    percent: true,
    word: true,
    reset: true,
    amount: "used",
  },
  // CPU and process count, not memory: on a fresh install the host's memory
  // figure is the one a reader cannot act on, and it cost the scarcest row in
  // the app a third chip.
  resourceMonitor: {
    shown: "shown",
    cpu: true,
    memory: false,
    processes: true,
    ramShare: false,
  },
  minimap: { shown: "shown" },
  contextUsage: {
    shown: "shown",
    style: "text",
    pinBreakdown: false,
    pinnedFields: CONTEXT_USAGE_ROW_KEYS,
    compactButton: "shown",
  },
  runningAgents: { shown: "shown", size: "full" },
  changedFiles: { shown: "shown", size: "full" },
  background: { shown: "shown", size: "full" },
  attachImage: { shown: "shown" },
  access: { shown: "shown", size: "full" },
  agent: { shown: "shown" },
  model: { shown: "shown", style: "text" },
  mic: { shown: "shown" },
  railAgents: { shown: "auto" },
  railTerminals: { shown: "auto" },
  railBrowsers: { shown: "auto" },
  railArtifacts: { shown: "auto" },
  railGitDiff: { shown: "auto" },
  railPullRequests: { shown: "auto" },
  railFileTree: { shown: "auto" },
  railSharing: { shown: "auto" },
  railComments: { shown: "auto" },
};

/**
 * The least chrome that still says everything: every reading present, none of
 * it spelled out.
 *
 * The usage reading keeps its percentage and drops the three things that make
 * it long (the mode word, the bar, the countdown). The composer folds its dock
 * rows and its access picker to chips - each keeps every verb it had - and
 * hides the two elements that have a full route elsewhere: the dictation chord
 * starts voice input, and the palette and `/compact` compact a conversation.
 *
 * Attach image stays shown, alone among the composer's buttons: paste and
 * drag-drop both need the image already in hand, so hiding the button would
 * remove the only way to attach a file from disk. Density shortens a reading;
 * it does not cost a gesture.
 */
const COMPACT_VALUES: LayoutValues = {
  ...SHIPPED_DEFAULT_VALUES,
  usageLimits: {
    shown: "shown",
    bar: false,
    percent: true,
    word: false,
    reset: false,
    amount: "used",
  },
  resourceMonitor: {
    shown: "shown",
    cpu: true,
    memory: false,
    processes: false,
    ramShare: false,
  },
  contextUsage: {
    shown: "shown",
    style: "ring-only",
    pinBreakdown: false,
    // Left at the full set even though the strip is unpinned: the fields only
    // read while the pin is on, so narrowing them here would be a change
    // nothing on screen shows and one a user would meet later, unexplained.
    pinnedFields: CONTEXT_USAGE_ROW_KEYS,
    compactButton: "hidden",
  },
  runningAgents: { shown: "shown", size: "chip" },
  changedFiles: { shown: "shown", size: "chip" },
  background: { shown: "shown", size: "chip" },
  access: { shown: "shown", size: "chip" },
  model: { shown: "shown", style: "bars" },
  mic: { shown: "hidden" },
};

/**
 * Everything the chrome can say, said: every reading in its long form, and
 * every element the composer can show shown.
 */
const DETAILED_VALUES: LayoutValues = {
  ...SHIPPED_DEFAULT_VALUES,
  usageLimits: {
    shown: "shown",
    bar: true,
    percent: true,
    word: true,
    reset: true,
    amount: "used",
  },
  resourceMonitor: {
    shown: "shown",
    cpu: true,
    memory: true,
    processes: true,
    ramShare: true,
  },
  contextUsage: {
    shown: "shown",
    style: "text",
    pinBreakdown: true,
    pinnedFields: CONTEXT_USAGE_ROW_KEYS,
    compactButton: "shown",
  },
  model: { shown: "shown", style: "bars-text" },
};

export const PRESET_VALUES: Readonly<Record<LayoutPresetId, LayoutValues>> = {
  default: SHIPPED_DEFAULT_VALUES,
  compact: COMPACT_VALUES,
  detailed: DETAILED_VALUES,
};

/** The base preset's values with the override delta laid over them. */
export function effectiveLayoutValues(
  basePreset: LayoutPresetId,
  overrides: LayoutOverrides,
): LayoutValues {
  const base = PRESET_VALUES[basePreset];
  return {
    homeTab: { ...base.homeTab, ...overrides.homeTab },
    usageLimits: { ...base.usageLimits, ...overrides.usageLimits },
    resourceMonitor: { ...base.resourceMonitor, ...overrides.resourceMonitor },
    minimap: { ...base.minimap, ...overrides.minimap },
    contextUsage: { ...base.contextUsage, ...overrides.contextUsage },
    runningAgents: { ...base.runningAgents, ...overrides.runningAgents },
    changedFiles: { ...base.changedFiles, ...overrides.changedFiles },
    background: { ...base.background, ...overrides.background },
    attachImage: { ...base.attachImage, ...overrides.attachImage },
    access: { ...base.access, ...overrides.access },
    agent: { ...base.agent, ...overrides.agent },
    model: { ...base.model, ...overrides.model },
    mic: { ...base.mic, ...overrides.mic },
    railAgents: { ...base.railAgents, ...overrides.railAgents },
    railTerminals: { ...base.railTerminals, ...overrides.railTerminals },
    railBrowsers: { ...base.railBrowsers, ...overrides.railBrowsers },
    railArtifacts: { ...base.railArtifacts, ...overrides.railArtifacts },
    railGitDiff: { ...base.railGitDiff, ...overrides.railGitDiff },
    railPullRequests: {
      ...base.railPullRequests,
      ...overrides.railPullRequests,
    },
    railFileTree: { ...base.railFileTree, ...overrides.railFileTree },
    railSharing: { ...base.railSharing, ...overrides.railSharing },
    railComments: { ...base.railComments, ...overrides.railComments },
  };
}

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
 * One region's patch with every key that agrees with the base preset removed,
 * which is the invariant the whole delta rests on.
 *
 * Generic over the VALUE BAG rather than the region id, so the base argument
 * infers it and a caller never spells out which region it is holding.
 */
export function minimizeRegionOverride<Values extends object>(
  patch: Partial<Values>,
  base: Values,
): Partial<Values> {
  const minimized: Partial<Values> = { ...patch };
  for (const key of overrideKeys(minimized)) {
    if (sameRegionValue(key, minimized[key], base[key])) delete minimized[key];
  }
  return minimized;
}

/** Whether a patch still carries anything after minimizing. */
function hasOverrideKeys(patch: object): boolean {
  return Object.keys(patch).length > 0;
}

/**
 * Every region's patch minimized, and a region left with nothing dropped.
 *
 * Spelled out region by region rather than walked: a walk over
 * `Object.entries` loses which region a patch belongs to, and writing it back
 * under a dynamic key can only be typed through a cast. The round-trip test
 * covers every region, so a region left out of this table fails there rather
 * than silently losing its overrides.
 */
export function minimizeOverrides(
  overrides: LayoutOverrides,
  basePreset: LayoutPresetId,
): LayoutOverrides {
  const base = PRESET_VALUES[basePreset];
  const minimized: MutableLayoutOverrides = {
    homeTab: keptOverride(overrides.homeTab, base.homeTab),
    usageLimits: keptOverride(overrides.usageLimits, base.usageLimits),
    resourceMonitor: keptOverride(
      overrides.resourceMonitor,
      base.resourceMonitor,
    ),
    minimap: keptOverride(overrides.minimap, base.minimap),
    contextUsage: keptOverride(overrides.contextUsage, base.contextUsage),
    runningAgents: keptOverride(overrides.runningAgents, base.runningAgents),
    changedFiles: keptOverride(overrides.changedFiles, base.changedFiles),
    background: keptOverride(overrides.background, base.background),
    attachImage: keptOverride(overrides.attachImage, base.attachImage),
    access: keptOverride(overrides.access, base.access),
    agent: keptOverride(overrides.agent, base.agent),
    model: keptOverride(overrides.model, base.model),
    mic: keptOverride(overrides.mic, base.mic),
    railAgents: keptOverride(overrides.railAgents, base.railAgents),
    railTerminals: keptOverride(overrides.railTerminals, base.railTerminals),
    railBrowsers: keptOverride(overrides.railBrowsers, base.railBrowsers),
    railArtifacts: keptOverride(overrides.railArtifacts, base.railArtifacts),
    railGitDiff: keptOverride(overrides.railGitDiff, base.railGitDiff),
    railPullRequests: keptOverride(
      overrides.railPullRequests,
      base.railPullRequests,
    ),
    railFileTree: keptOverride(overrides.railFileTree, base.railFileTree),
    railSharing: keptOverride(overrides.railSharing, base.railSharing),
    railComments: keptOverride(overrides.railComments, base.railComments),
  };
  // The table above states every region, so a region with nothing left is
  // present and `undefined`; dropping those is what keeps `Object.keys` over
  // the delta a count of the regions that actually changed.
  const writable: Record<string, unknown> = minimized;
  for (const region of Object.keys(writable)) {
    if (writable[region] === undefined) delete writable[region];
  }
  return minimized;
}

/** One region's minimized patch, or `undefined` when nothing is left of it. */
function keptOverride<Values extends object>(
  patch: Partial<Values> | undefined,
  base: Values,
): Partial<Values> | undefined {
  if (patch === undefined) return undefined;
  const kept = minimizeRegionOverride(patch, base);
  return hasOverrideKeys(kept) ? kept : undefined;
}

type MutableLayoutOverrides = {
  -readonly [K in RegionId]?: Partial<LayoutValues[K]>;
};

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

function isStringList(value: unknown): value is ReadonlyArray<string> {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

// ── Resolution ──────────────────────────────────────────────────────────────

/**
 * The override delta as some build of the app wrote it, key by key against
 * this build's unions.
 *
 * Re-derived rather than shallow-merged for the reason every resolver in this
 * app is: each value picks a branch on a render path, so a hand-edited
 * `"compact"` on a row that only hides would ask a leaf for a shape it has no
 * case for. Minimized at the end through the same function the setters use, so
 * a key that agrees with the base preset cannot survive a rehydrate either.
 */
export function resolvePersistedOverrides(
  value: unknown,
  basePreset: LayoutPresetId,
): LayoutOverrides {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  return minimizeOverrides(
    {
      homeTab: shownPatch(stored.homeTab),
      usageLimits: usageLimitsPatch(stored.usageLimits),
      resourceMonitor: resourceMonitorPatch(stored.resourceMonitor),
      minimap: shownPatch(stored.minimap),
      contextUsage: contextUsagePatch(stored.contextUsage),
      runningAgents: sizedPatch(stored.runningAgents),
      changedFiles: sizedPatch(stored.changedFiles),
      background: sizedPatch(stored.background),
      attachImage: shownPatch(stored.attachImage),
      access: sizedPatch(stored.access),
      agent: shownPatch(stored.agent),
      model: modelPatch(stored.model),
      mic: shownPatch(stored.mic),
      railAgents: railPatch(stored.railAgents),
      railTerminals: railPatch(stored.railTerminals),
      railBrowsers: railPatch(stored.railBrowsers),
      railArtifacts: railPatch(stored.railArtifacts),
      railGitDiff: railPatch(stored.railGitDiff),
      railPullRequests: railPatch(stored.railPullRequests),
      railFileTree: railPatch(stored.railFileTree),
      railSharing: railPatch(stored.railSharing),
      railComments: railPatch(stored.railComments),
    },
    basePreset,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function shownPatch(value: unknown): Partial<ShownValues> {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  return stored.shown === "shown" || stored.shown === "hidden"
    ? { shown: stored.shown }
    : {};
}

function sizedPatch(value: unknown): Partial<SizedValues> {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  return {
    ...shownPatch(value),
    ...(stored.size === "full" || stored.size === "chip"
      ? { size: stored.size }
      : {}),
  };
}

function railPatch(value: unknown): Partial<RailValues> {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  return stored.shown === "auto" ||
    stored.shown === "shown" ||
    stored.shown === "hidden"
    ? { shown: stored.shown }
    : {};
}

function usageLimitsPatch(value: unknown): Partial<UsageLimitsValues> {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  return {
    ...shownPatch(value),
    ...(typeof stored.bar === "boolean" ? { bar: stored.bar } : {}),
    ...(typeof stored.percent === "boolean" ? { percent: stored.percent } : {}),
    ...(typeof stored.word === "boolean" ? { word: stored.word } : {}),
    ...(typeof stored.reset === "boolean" ? { reset: stored.reset } : {}),
    ...(stored.amount === "used" || stored.amount === "remaining"
      ? { amount: stored.amount }
      : {}),
  };
}

function resourceMonitorPatch(value: unknown): Partial<ResourceMonitorValues> {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  return {
    ...shownPatch(value),
    ...(typeof stored.cpu === "boolean" ? { cpu: stored.cpu } : {}),
    ...(typeof stored.memory === "boolean" ? { memory: stored.memory } : {}),
    ...(typeof stored.processes === "boolean"
      ? { processes: stored.processes }
      : {}),
    ...(typeof stored.ramShare === "boolean"
      ? { ramShare: stored.ramShare }
      : {}),
  };
}

function contextUsagePatch(value: unknown): Partial<ContextUsageValues> {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  const storedFields = stored.pinnedFields;
  // Held in the breakdown's canonical order rather than in toggle order, so
  // two selections of the same rows can never read as different.
  const pinnedFields = isStringList(storedFields)
    ? CONTEXT_USAGE_ROW_KEYS.filter((key) => storedFields.includes(key))
    : [];
  return {
    ...shownPatch(value),
    ...(stored.style === "text" ||
    stored.style === "ring" ||
    stored.style === "ring-only"
      ? { style: stored.style }
      : {}),
    ...(typeof stored.pinBreakdown === "boolean"
      ? { pinBreakdown: stored.pinBreakdown }
      : {}),
    // An empty selection is not a state the pinned strip has - it would draw
    // an empty row - so it resolves to no override at all.
    ...(pinnedFields.length === 0 ? {} : { pinnedFields }),
    ...(stored.compactButton === "shown" || stored.compactButton === "hidden"
      ? { compactButton: stored.compactButton }
      : {}),
  };
}

function modelPatch(value: unknown): Partial<ModelValues> {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  return {
    ...shownPatch(value),
    ...(stored.style === "text" ||
    stored.style === "bars" ||
    stored.style === "bars-text"
      ? { style: stored.style }
      : {}),
  };
}
