import {
  barPlacement,
  type BarRegionId,
  type EdgeSide,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import type {
  ContextUsageValues,
  ModelValues,
  RailValues,
  ShownValues,
  SizedValues,
} from "@/lib/layout/layout-values";

/**
 * The one word each region's row reads out beside its name (L-33, L-47).
 *
 * One per value SHAPE rather than one per region: of the twenty-three regions
 * nine are the rail's three-state and six are the Full row / Chip pair (the
 * five dock members and the Access pill), so the tables beside this file point
 * several regions at the same function.
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

/**
 * Both halves of where a bar reading sits, in one phrase: "Header, right"
 * (L-156).
 *
 * One word per axis would leave the index row saying "Header" while the
 * region is drawn at the other end of it, which is half an answer to the only
 * question the row is asked.
 */
export function barPlacementStateWord(
  values: ShownValues,
  arrangement: LayoutArrangement,
  region: BarRegionId,
): string {
  if (values.shown === "hidden") return "Hidden";
  const placement = barPlacement(arrangement, region);
  const bar = placement.host === "header" ? "Header" : "Status bar";
  return `${bar}, ${placement.side}`;
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
