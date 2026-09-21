import type { QuickVerbId } from "@/components/layout-editor/regions/region-grammar";

/** What the right-click menu on a customizable element says (L-19). */

/** What the context menu calls a verb, with the region named where it reads better. */
export function quickVerbLabel(verb: QuickVerbId, regionName: string): string {
  switch (verb) {
    case "hide":
      return `Hide ${regionName}`;
    case "show":
      return `Show ${regionName}`;
    case "chip":
      return "Show as chip";
    case "full":
      return "Show as full row";
    case "move":
      return "Move";
  }
}

/**
 * What the toast says afterwards, or `null` for the verb that has nothing to
 * announce: `move` hands the region to the editor rather than changing it.
 */
export function quickVerbToast(
  verb: QuickVerbId,
  regionName: string,
): string | null {
  switch (verb) {
    case "hide":
      return `${regionName} hidden`;
    case "show":
      return `${regionName} shown`;
    case "chip":
      return `${regionName} is a chip`;
    case "full":
      return `${regionName} is a full row`;
    case "move":
      return null;
  }
}
