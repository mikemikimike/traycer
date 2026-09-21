import type { QuickVerbId } from "@/components/layout-editor/regions/region-grammar";

/** What the right-click menu on a customizable element says (L-19). */

/**
 * The verbs a menu actually renders: the four that write a value and are
 * reversed by the toast. See {@link offeredQuickVerbs} for why `move` is not
 * one of them.
 */
export type WritingQuickVerb = Exclude<QuickVerbId, "move">;

/**
 * Which of a region's verbs its menu offers right now.
 *
 * Two of the five are a pair the region's current state picks between, so the
 * registry's list is what a region CAN do and this is what it can do from
 * here: `hide` and `show` are never both offered, and the size pair is offered
 * only while the region is there to be resized.
 *
 * `move` is deliberately not among them. Every other verb changes a value and
 * is reversed by the toast; a move is a drag on the canvas, which is the one
 * thing that cannot happen without entering - so the menu renders it as
 * "Customize layout...", which opens the editor on this very region (L-19),
 * rather than as a second item that would do the same thing under a different
 * word. This is also the owner-approved prototype's own menu.
 */
export function offeredQuickVerbs(
  verbs: ReadonlyArray<QuickVerbId>,
  state: { readonly hidden: boolean; readonly chip: boolean },
): ReadonlyArray<WritingQuickVerb> {
  if (state.hidden) return verbs.includes("show") ? ["show"] : [];
  const offered: Array<WritingQuickVerb> = [];
  const sizeVerb: WritingQuickVerb = state.chip ? "full" : "chip";
  if (verbs.includes(sizeVerb)) offered.push(sizeVerb);
  if (verbs.includes("hide")) offered.push("hide");
  return offered;
}

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
