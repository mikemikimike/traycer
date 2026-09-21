import { useEffect } from "react";
import "@/components/layout-editor/layout-editor.css";
import {
  cancelLayoutDrag,
  layoutDragActive,
} from "@/components/layout-editor/canvas/drag-engine";
import {
  createHoverChip,
  type HoverChipPlacement,
} from "@/components/layout-editor/canvas/hover-chip";
import { armRegionDrag } from "@/components/layout-editor/canvas/region-drag";
import { createSelectionRing } from "@/components/layout-editor/canvas/selection-ring";
import {
  LAYOUT_REGION_IDS,
  regionFacts,
} from "@/components/layout-editor/regions/region-facts";
import { layoutTransitionRunning } from "@/lib/layout/editor-motion";
import type { RegionId } from "@/lib/layout/region-id";
import {
  preferredRegionInstance,
  useLayoutEditorStore,
} from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * The canvas half of an editor session: what the pointer is on, and where the
 * two overlays sit (4.2, 4.3, 4.6).
 *
 * It owns nothing about the app's elements. `use-layout-region.ts` stamps the
 * hover, selection and anchor attributes onto every instance of a region from
 * the same store, so every copy of a setting lights up together (L-23); this
 * hook adds the two things a stylesheet cannot do - the chip that names what
 * the pointer is on, and the one ring that travels between selections.
 *
 * Pointer resolution lives on `document` in the capture phase rather than on
 * the column, because the edit firewall (ticket 07) sits on the column and
 * stops immediate propagation there: a capture listener one level up reads the
 * gesture before the firewall swallows it, whatever order the two mount in.
 *
 * Call it unconditionally - it does nothing until a session opens, and tears
 * every overlay and listener down when one closes.
 */
export function useLayoutCanvas(column: HTMLElement | null): void {
  const live = useLayoutEditorStore((state) => state.session !== null);

  useEffect(() => {
    if (!live || column === null) return;
    // What the decoration CSS scopes everything to. Written here rather than
    // in the shell's markup so it can never outlive the session that needs it.
    column.setAttribute("data-layout-editing", "1");
    const chip = createHoverChip();
    const ring = createSelectionRing();

    const paint = (): void => {
      const state = useLayoutEditorStore.getState();
      const hovered =
        state.hovered === null
          ? null
          : preferredRegionInstance(state, state.hovered);
      if (state.hovered === null || hovered === null) chip.hide();
      else
        chip.show({
          label: regionFacts(state.hovered).name,
          node: hovered.node,
          placement: chipPlacement(state.hovered),
        });
      const selected =
        state.selected === null
          ? null
          : preferredRegionInstance(state, state.selected);
      // Identity-guarded inside the controller, so this costs nothing on the
      // notifications that did not move the selection. What the canvas UNDER
      // the ring does is a separate signal - see the two subscriptions below.
      ring.track(selected?.node ?? null);
    };

    const onPointerMove = (event: PointerEvent): void => {
      // A member in hand owns the pointer: re-hovering whatever it is passing
      // over would move the chip and the selection mid-gesture.
      if (layoutDragActive()) return;
      const target = event.target;
      if (!(target instanceof Node) || !column.contains(target)) return;
      useLayoutEditorStore.getState().setHovered(regionUnder(target, column));
    };

    // The one owner of "this press starts a drag". The firewall swallows
    // `pointerdown` on the column in the capture phase, so the decision is
    // made here, one level up and still in capture, and the drag it arms
    // listens on `window` from then on - never a second listener racing the
    // firewall for the same event.
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || !column.contains(target)) return;
      const state = useLayoutEditorStore.getState();
      state.setKeyboardNav(false);
      const node = regionNodeUnder(target, column);
      const regionId = regionIdOf(node);
      state.select(regionId);
      if (node === null || regionId === null) return;
      // A session on its way out, or a shell still gliding, has boxes that are
      // about to move or are already a snapshot; neither is something to
      // measure a drag against.
      if (state.leaving || layoutTransitionRunning()) return;
      armRegionDrag({ event, node, regionId, onFrame: ring.refresh });
    };

    // Leaving the canvas drops the canvas's own hover. The inspector's rows
    // set it too, and the pointer is already over one by the time this fires.
    const onPointerLeave = (): void => {
      useLayoutEditorStore.getState().setHovered(null);
    };

    paint();
    const unsubscribe = useLayoutEditorStore.subscribe((state, previous) => {
      paint();
      // A preview changes what every region draws, so the ring's own node can
      // move without resizing - which is the one case neither the
      // `ResizeObserver` nor the scroll/resize listeners in the controller
      // would see.
      if (state.previewPreset !== previous.previewPreset) ring.refresh();
    });
    // A layout write is the other way the canvas reflows under a ring that is
    // already parked on the right element.
    const unsubscribeLayout = useLayoutStore.subscribe(() => {
      ring.refresh();
    });
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    column.addEventListener("pointerleave", onPointerLeave);

    return () => {
      unsubscribe();
      unsubscribeLayout();
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      column.removeEventListener("pointerleave", onPointerLeave);
      // An exit under a live gesture: the drag's own listeners, its frame and
      // the transform it put on an element the app owns all go with the
      // session, and it writes nothing on the way out.
      cancelLayoutDrag();
      chip.destroy();
      ring.destroy();
      column.removeAttribute("data-layout-editing");
    };
  }, [column, live]);
}

/**
 * The nearest registered region's ELEMENT at a point, which is what makes the
 * whole element hoverable rather than only the pixel the pointer is over, and
 * is also the thing a drag picks up.
 */
function regionNodeUnder(
  target: Node,
  column: HTMLElement,
): HTMLElement | null {
  const element = target instanceof Element ? target : target.parentElement;
  const node = element?.closest("[data-layout-region]") ?? null;
  if (!(node instanceof HTMLElement) || !column.contains(node)) return null;
  return node;
}

function regionIdOf(node: HTMLElement | null): RegionId | null {
  if (node === null) return null;
  const value = node.getAttribute("data-layout-region");
  return LAYOUT_REGION_IDS.find((id) => id === value) ?? null;
}

function regionUnder(target: Node, column: HTMLElement): RegionId | null {
  return regionIdOf(regionNodeUnder(target, column));
}

/** A top-bar region has nothing above it, so its chip goes underneath (4.3). */
function chipPlacement(regionId: RegionId): HoverChipPlacement {
  return regionFacts(regionId).surface === "topBar" ? "below" : "above";
}
