import { useEffect } from "react";
import "@/components/layout-editor/layout-editor.css";
import {
  createHoverChip,
  type HoverChipPlacement,
} from "@/components/layout-editor/canvas/hover-chip";
import { createSelectionRing } from "@/components/layout-editor/canvas/selection-ring";
import { LAYOUT_REGION_IDS, regionFacts } from "@/lib/layout/layout-regions";
import type { RegionId } from "@/lib/layout/region-id";
import {
  preferredRegionInstance,
  useLayoutEditorStore,
} from "@/stores/layout/layout-editor-store";

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
      // Called on every store change, with the same node as often as not: the
      // ring parks itself once its springs arrive, and this is what wakes it
      // when the canvas underneath may have moved.
      ring.track(selected?.node ?? null);
    };

    const onPointerMove = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || !column.contains(target)) return;
      useLayoutEditorStore.getState().setHovered(regionUnder(target, column));
    };

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node) || !column.contains(target)) return;
      const state = useLayoutEditorStore.getState();
      state.setKeyboardNav(false);
      state.select(regionUnder(target, column));
    };

    // Leaving the canvas drops the canvas's own hover. The inspector's rows
    // set it too, and the pointer is already over one by the time this fires.
    const onPointerLeave = (): void => {
      useLayoutEditorStore.getState().setHovered(null);
    };

    paint();
    const unsubscribe = useLayoutEditorStore.subscribe(paint);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    column.addEventListener("pointerleave", onPointerLeave);

    return () => {
      unsubscribe();
      document.removeEventListener("pointermove", onPointerMove, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      column.removeEventListener("pointerleave", onPointerLeave);
      chip.destroy();
      ring.destroy();
      column.removeAttribute("data-layout-editing");
    };
  }, [column, live]);
}

/**
 * The nearest registered region at a point, which is what makes the whole
 * element hoverable rather than only the pixel the pointer is over.
 */
function regionUnder(target: Node, column: HTMLElement): RegionId | null {
  const element = target instanceof Element ? target : target.parentElement;
  const node = element?.closest("[data-layout-region]") ?? null;
  if (node === null || !column.contains(node)) return null;
  const value = node.getAttribute("data-layout-region");
  return LAYOUT_REGION_IDS.find((id) => id === value) ?? null;
}

/** A top-bar region has nothing above it, so its chip goes underneath (4.3). */
function chipPlacement(regionId: RegionId): HoverChipPlacement {
  return regionFacts(regionId).surface === "topBar" ? "below" : "above";
}
