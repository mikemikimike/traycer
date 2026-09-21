import {
  armLayoutDrag,
  type LayoutDragTarget,
} from "@/components/layout-editor/canvas/drag-engine";
import { writeArrangement } from "@/components/layout-editor/layout-gestures";
import {
  canvasOrderGroupForRegion,
  moveCanvasOrderMember,
  type CanvasOrderGroupId,
} from "@/lib/layout/layout-arrangement";
import type { RegionId } from "@/lib/layout/region-id";
import { getLayoutSnapshot } from "@/stores/layout/layout-store";

/**
 * Dragging the real thing (L-24): the canvas half of the reorder.
 *
 * The user picks up the element they are looking at, its siblings reflow
 * around it live, and the arrangement is written once when they let go. What
 * this module owns is the translation between the two vocabularies - an
 * element and its siblings on one side, an order group and its ids on the
 * other - so `drag-engine.ts` never learns what a region is and
 * `layout-arrangement.ts` never learns what an element is.
 */

/**
 * The box a surface lays one cluster of draggable regions out in: the dock's
 * rows card, the composer's compact chip strip, each composer toolbar cluster.
 *
 * Stamped by the surface because only it knows which of its elements is that
 * box - see {@link resolveGroup}, which is the one reader.
 */
export const LAYOUT_CLUSTER_ATTRIBUTE = "data-layout-cluster";

/**
 * Arm a drag on the region element under a press, if that region is one the
 * canvas can reorder. Returns whether it armed, which is what tells the caller
 * the press was only ever a selection.
 */
export function armRegionDrag(input: {
  readonly event: PointerEvent;
  readonly node: HTMLElement;
  readonly regionId: RegionId;
  /** The overlays that have to keep up with an element that is moving. */
  readonly onFrame: () => void;
}): boolean {
  const { event, node, regionId, onFrame } = input;
  const group = canvasOrderGroupForRegion(regionId);
  if (group === null) return false;
  const resolve = (): LayoutDragTarget | null => resolveGroup(node, group);
  armLayoutDrag({
    event,
    onFrame,
    resolve,
    onDrop: (fromIndex, toIndex) => {
      const items = resolve()?.items ?? [];
      const from = items.at(fromIndex);
      const to = items.at(toIndex);
      if (from === undefined || to === undefined) return;
      writeArrangement(
        moveCanvasOrderMember({
          arrangement: getLayoutSnapshot().arrangement,
          group,
          fromId: memberId(from),
          toId: memberId(to),
          // The engine counts up the drawn order, so a member that ended at a
          // LATER slot than it started from was dropped past the member now
          // standing there.
          placeAfter: toIndex > fromIndex,
        }),
      );
    },
  });
  return true;
}

/**
 * The siblings a press can reorder against, and the box they are laid out in.
 *
 * The scope is the PRESSED member's own container - the element the surface
 * marked `data-layout-cluster` - and never an ancestor found by counting
 * members upwards (G3-01). One group is drawn in two containers whenever a
 * dock region is sized to Chip: that region stands in the composer's compact
 * strip while its full-size siblings stay in the dock, with the whole
 * transcript between them. A scope resolved by walking up would then be the
 * tile root, where the axis is inferred across that gap, the clamp is the
 * whole tile and the drawn order is not the stored order.
 *
 * So a gesture reorders what is drawn beside it and nothing else: the members
 * in the other container are simply not part of it, and the drop still places
 * by id, so the region the user had hold of is the one that moves. A container
 * holding a single member yields one item, which `armLayoutDrag` refuses -
 * there is nothing there to reorder against.
 *
 * The container is also the clamp, for every group and not only for the model
 * chip the plan singles out: no member can change which cluster it is in -
 * `normalizeArrangement` puts one back that tries - so pulling any of them
 * out has to give a quarter of the way and spring back rather than promising
 * a drop that would be undone (L-29).
 *
 * Marked rather than computed, because the DOM alone cannot tell a layout
 * container from a wrapper: the composer's toolbars put each item inside a
 * `display: contents` span, so a member's parent is not the box it is laid out
 * in, and only the surface drawing the row knows which element that is.
 */
function resolveGroup(
  node: HTMLElement,
  group: CanvasOrderGroupId,
): LayoutDragTarget | null {
  const scope = node.closest<HTMLElement>(`[${LAYOUT_CLUSTER_ATTRIBUTE}]`);
  if (scope === null) return null;
  const items = [
    ...scope.querySelectorAll<HTMLElement>(`[data-layout-group="${group}"]`),
  ];
  const index = items.indexOf(node);
  if (index < 0) return null;
  return { items, index, clamp: scope };
}

/**
 * A member's region id off the element. Only ever used to SELECT from the
 * stored order, never to build one, so an id this build does not know selects
 * nothing rather than narrowing something away (G1-23).
 */
function memberId(node: HTMLElement): string {
  return node.getAttribute("data-layout-region") ?? "";
}
