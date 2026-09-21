import { CONTEXT_USAGE_ROW_KEYS } from "@/lib/context-usage-rows";
import {
  minimizeOverrides,
  type LayoutPresetId,
} from "@/lib/layout/layout-presets";
import {
  isStringList,
  type ContextUsageValues,
  type LayoutOverrides,
  type ModelValues,
  type RailValues,
  type ResourceMonitorValues,
  type ShownValues,
  type SizedValues,
  type UsageLimitsValues,
} from "@/lib/layout/layout-values";

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
