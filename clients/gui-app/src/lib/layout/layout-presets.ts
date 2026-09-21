import { CONTEXT_USAGE_ROW_KEYS } from "@/lib/context-usage-rows";
import {
  minimizeRegionOverride,
  type LayoutOverrides,
  type LayoutValues,
} from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * The three densities, and the arithmetic that turns one of them plus a delta
 * into what the app draws.
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

/** Whether a patch still carries anything after minimizing. */
function hasOverrideKeys(patch: object): boolean {
  return Object.keys(patch).length > 0;
}

type MutableLayoutOverrides = {
  -readonly [K in RegionId]?: Partial<LayoutValues[K]>;
};
