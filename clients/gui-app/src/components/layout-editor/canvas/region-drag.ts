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
      const target = resolve();
      if (target === null) return;
      writeArrangement(
        moveCanvasOrderMember({
          arrangement: getLayoutSnapshot().arrangement,
          group,
          visibleIds: target.items.map(memberId),
          fromIndex,
          toIndex,
        }),
      );
    },
  });
  return true;
}

/**
 * The members of one group around a node, and the cluster they are held
 * inside.
 *
 * Found by walking up from the node until an ancestor holds more than one
 * member, rather than by reading `parentElement`: the composer's toolbars wrap
 * each item in a `display: contents` span, so a member's DOM parent is not the
 * cluster it is laid out in. Walking up also scopes the drag to the node's own
 * chat tile, since a second tile's copies live under a different ancestor.
 *
 * That cluster is also the clamp, for every group and not only for the model
 * chip the plan singles out: no member can change which cluster it is in -
 * `normalizeArrangement` puts one back that tries - so pulling any of them
 * out has to give a quarter of the way and spring back rather than promising
 * a drop that would be undone (L-29).
 */
function resolveGroup(
  node: HTMLElement,
  group: CanvasOrderGroupId,
): LayoutDragTarget | null {
  const selector = `[data-layout-group="${group}"]`;
  let scope = node.parentElement;
  while (scope !== null) {
    const items = [...scope.querySelectorAll<HTMLElement>(selector)];
    if (items.length > 1) {
      const index = items.indexOf(node);
      if (index < 0) return null;
      return { items, index, clamp: scope };
    }
    scope = scope.parentElement;
  }
  return null;
}

/**
 * A member's region id off the element. Only ever used to SELECT from the
 * stored order, never to build one, so an id this build does not know selects
 * nothing rather than narrowing something away (G1-23).
 */
function memberId(node: HTMLElement): string {
  return node.getAttribute("data-layout-region") ?? "";
}
