import type {
  EdgeSide,
  LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import type {
  ContextUsageValues,
  ModelValues,
  RailValues,
  ShownValues,
  SizedValues,
  UsageLimitsValues,
} from "@/lib/layout/layout-values";

/**
 * The one word each region's row reads out beside its name (L-33, L-47).
 *
 * One per value SHAPE rather than one per region: eight of the twenty-two
 * regions are plain shown/hidden and nine are the rail's three-state, so the
 * tables beside this file point several regions at the same function.
 */

export function shownStateWord(values: ShownValues): string {
  return values.shown === "shown" ? "Shown" : "Hidden";
}

export function sizedStateWord(values: SizedValues): string {
  if (values.shown === "hidden") return "Hidden";
  return values.size === "chip" ? "Chip" : "Full row";
}

export function sideStateWord(values: ShownValues, side: EdgeSide): string {
  if (values.shown === "hidden") return "Hidden";
  return side === "left" ? "Left" : "Right";
}

export function railStateWord(values: RailValues): string {
  if (values.shown === "auto") return "Auto";
  return values.shown === "shown" ? "Shown" : "Hidden";
}

export function usageLimitsStateWord(
  values: UsageLimitsValues,
  arrangement: LayoutArrangement,
): string {
  if (values.shown === "hidden") return "Hidden";
  return arrangement.usageHost === "header" ? "Header" : "Status bar";
}

export function contextUsageStateWord(values: ContextUsageValues): string {
  if (values.shown === "hidden") return "Hidden";
  if (values.style === "text") return "Text";
  return values.style === "ring" ? "Ring" : "Ring only";
}

export function modelStateWord(values: ModelValues): string {
  if (values.shown === "hidden") return "Hidden";
  if (values.style === "text") return "Text";
  return values.style === "bars" ? "Bars" : "Bars + text";
}
