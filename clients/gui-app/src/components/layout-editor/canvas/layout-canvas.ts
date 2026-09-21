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
import { armCanvasDrag } from "@/components/layout-editor/canvas/region-drag";
import { createSelectionRing } from "@/components/layout-editor/canvas/selection-ring";
import {
  LAYOUT_REGION_IDS,
  regionFacts,
  regionStateWord,
} from "@/components/layout-editor/regions/region-facts";
import { decoratedHoverRegion } from "@/components/layout-editor/use-layout-region";
import { layoutTransitionRunning } from "@/lib/layout/editor-motion";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { RegionId } from "@/lib/layout/region-id";
import {
  preferredRegionInstance,
  useLayoutEditorStore,
} from "@/stores/layout/layout-editor-store";
import { getLayoutSnapshot } from "@/stores/layout/layout-store";

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
    // The chip's text, computed per hovered region and only when it can have
    // moved. `paint` runs on EVERY editor-store notification - each pointer
    // move that changes the hovered region, each filter keystroke, each
    // selection change while the pointer rests on a region - and building the
    // label means building the whole 22-region value set to read one region's
    // state word (G1-04's rule, which `inspector-index.tsx` follows in this
    // same commit). The label changes only when the pointer moves to another
    // region or the layout is written, so those are the two things this
    // remembers.
    let lastLabel: {
      readonly regionId: RegionId;
      readonly snapshot: LayoutSnapshot;
      readonly label: string;
    } | null = null;
    const labelFor = (regionId: RegionId): string => {
      const snapshot = getLayoutSnapshot();
      if (
        lastLabel !== null &&
        lastLabel.regionId === regionId &&
        sameLayout(lastLabel.snapshot, snapshot)
      )
        return lastLabel.label;
      const label = hoverChipLabel(regionId, snapshot);
      lastLabel = { regionId, snapshot, label };
      return label;
    };

    const paint = (): void => {
      const state = useLayoutEditorStore.getState();
      const hoveredRegion = decoratedHoverRegion(state);
      const hovered =
        hoveredRegion === null
          ? null
          : preferredRegionInstance(state, hoveredRegion);
      if (hoveredRegion === null || hovered === null) chip.hide();
      else
        chip.show({
          label: labelFor(hoveredRegion),
          node: hovered.node,
          placement: chipPlacement(hoveredRegion),
        });
      const selected =
        state.selected === null
          ? null
          : preferredRegionInstance(state, state.selected);
      // Identity-guarded inside the controller, so this costs nothing on the
      // notifications that did not move the selection. Where the ring's node
      // IS is not this hook's business at all: the controller re-reads the
      // rect every frame, so every reflow of the canvas under it is followed
      // without anything here having to notice one (L-90).
      ring.track(selected?.node ?? null);
    };

    const onPointerMove = (event: PointerEvent): void => {
      // A member in hand owns the pointer: re-hovering whatever it is passing
      // over would move the chip and the selection mid-gesture.
      if (layoutDragActive()) return;
      if (!hoverCapablePointer(event.pointerType)) return;
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
      state.select(regionUnder(target, column));
      // A session on its way out, or a shell still gliding, has boxes that are
      // about to move or are already a snapshot; neither is something to
      // measure a drag against.
      if (state.leaving || layoutTransitionRunning()) return;
      const member = memberNodeUnder(target, column);
      if (member !== null) armCanvasDrag({ event, node: member });
    };

    // Leaving the canvas drops the canvas's own hover. The inspector's rows
    // set it too, and the pointer is already over one by the time this fires.
    const onPointerLeave = (): void => {
      useLayoutEditorStore.getState().setHovered(null);
    };

    paint();
    const unsubscribe = useLayoutEditorStore.subscribe((state, previous) => {
      paint();
      // An exit has started. Every path out of the editor raises `leaving`
      // first, so this is the one edge that catches them all - including a
      // re-open that flushes the old session's teardown before React has
      // re-rendered, where the unmount cleanup below never runs at all.
      if (state.leaving && !previous.leaving) cancelLayoutDrag();
    });
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    column.addEventListener("pointerleave", onPointerLeave);

    return () => {
      unsubscribe();
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

/**
 * The nearest element a canvas drag can pick up, which is NOT the same
 * question as which region is under the pointer: the sidebar rail's dividers
 * are members of the rail's order without being regions of their own (L-115),
 * so the member is resolved off the attribute the drag reads rather than off
 * the region registration.
 */
function memberNodeUnder(
  target: Node,
  column: HTMLElement,
): HTMLElement | null {
  const element = target instanceof Element ? target : target.parentElement;
  const node = element?.closest('[data-layout-draggable="1"]') ?? null;
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

/**
 * What the chip says: the region's name AND the state it is in right now
 * (C-05) - "Browsers · Shown", "Minimap · Right".
 *
 * The name alone made the chip a label for something the pointer was already
 * on. The state word is the answer to the question hovering asks, and it is
 * read through the same `regionStateWord` the inspector's index rows print, so
 * the canvas and the list can never name one region's state two ways. The
 * separator is the app's own middle dot rather than the prototype's ASCII dash.
 *
 * Off the store rather than out of a render: the chip is a DOM element this
 * module owns, and a hover must not re-render a chat tile. Takes the snapshot
 * it is built from rather than reading one, so the caller's cache and this
 * answer can never be about two different layouts.
 */
function hoverChipLabel(regionId: RegionId, snapshot: LayoutSnapshot): string {
  const values = effectiveLayoutValues(snapshot.basePreset, snapshot.overrides);
  const state = regionStateWord(regionId, values, snapshot.arrangement);
  return `${regionFacts(regionId).name} · ${state}`;
}

/**
 * Whether two snapshots are the same layout, by the identity of the three
 * fields the store holds - never a deep compare. Each one is replaced whole on
 * a write, so a reference match IS "nothing was written since".
 */
function sameLayout(left: LayoutSnapshot, right: LayoutSnapshot): boolean {
  return (
    left.basePreset === right.basePreset &&
    left.overrides === right.overrides &&
    left.arrangement === right.arrangement
  );
}

/**
 * Whether this pointer can REST on a region, which is the precondition for
 * hover decoration at all (C-09).
 *
 * The prototype refuses hover unless `(hover: hover) and (pointer: fine)`; a
 * per-event answer is the same rule and is also right on a hybrid machine,
 * where the media query describes the device and this describes the gesture. A
 * touch or a pen reports a move on the way to a tap, which would light a
 * region up and leave a chip sitting behind the finger. The app already
 * answers this question this way for its hover popovers.
 */
function hoverCapablePointer(pointerType: string): boolean {
  return pointerType === "mouse";
}
