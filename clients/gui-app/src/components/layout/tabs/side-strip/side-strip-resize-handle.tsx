import { useRef, type ReactNode, type RefObject } from "react";
import {
  pointerDragHandleAxisClassName,
  usePointerDragCommit,
} from "@/components/epic-canvas/canvas/use-pointer-drag-commit";
import type { EdgeSide } from "@/lib/layout/layout-arrangement";
import { cn } from "@/lib/utils";
import { useSideTabStripStore } from "@/stores/layout/side-tab-strip-store";
import {
  SIDE_STRIP_MAX_WIDTH_PX,
  SIDE_STRIP_MIN_WIDTH_PX,
  SIDE_STRIP_RAIL_WIDTH_PX,
  SIDE_STRIP_SNAP_TO_RAIL_BELOW_PX,
} from "./side-strip-tokens";

/** One arrow-key press moves the edge by this much. */
const KEYBOARD_RESIZE_STEP_PX = 24;

/** Which side of the strip faces the content, where the handle sits. */
const HANDLE_EDGE_CLASS: Record<EdgeSide, string> = {
  left: "right-0",
  right: "left-0",
};

interface StripDragState {
  readonly strip: HTMLElement;
  readonly startWidth: number;
  /** The inline width React last rendered, put back before the store write. */
  readonly initialStyleWidth: string;
  latestWidth: number;
}

/**
 * The strip's width handle on its content-facing edge (S-20), on the shared
 * `usePointerDragCommit` machine: `style.width` is written per frame with no
 * React render, and the store once on release. The drag and the arrow nudge
 * are negated for a right-edge strip, so moving toward the content always
 * grows it. A release below the snap point collapses the strip and keeps the
 * stored width; from the rail, a release past it expands. Double-click resets
 * to the default width.
 */
export function SideStripResizeHandle(props: {
  readonly edge: EdgeSide;
  readonly stripRef: RefObject<HTMLElement | null>;
}): ReactNode {
  const { edge, stripRef } = props;
  const widthPx = useSideTabStripStore((state) => state.widthPx);
  const collapsed = useSideTabStripStore((state) => state.collapsed);
  const dragRef = useRef<StripDragState | null>(null);
  const sign = edge === "right" ? -1 : 1;

  const sliderProps = usePointerDragCommit({
    axis: "horizontal",
    onDragStart: () => {
      const strip = stripRef.current;
      if (strip === null) return false;
      const startWidth = strip.getBoundingClientRect().width;
      dragRef.current = {
        strip,
        startWidth,
        initialStyleWidth: strip.style.width,
        latestWidth: startWidth,
      };
      return true;
    },
    onDragFrame: (deltaPx) => {
      const drag = dragRef.current;
      if (drag === null) return;
      const nextWidth = previewWidthOf(drag.startWidth + deltaPx * sign);
      drag.latestWidth = nextWidth;
      drag.strip.style.width = `${nextWidth}px`;
    },
    onDragCommit: () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag === null) return;
      // The width as rendered after the last frame, so a floor or cap the
      // strip's own classes apply (S-43, the 40vw cap) is what gets stored.
      const renderedWidth = drag.strip.getBoundingClientRect().width;
      // Back to what React rendered, so a release that changes no store value
      // (a rail dragged but not past the snap point) leaves no stray width.
      drag.strip.style.width = drag.initialStyleWidth;
      commitReleasedWidth(drag.latestWidth, renderedWidth);
    },
    onDragCancel: () => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag === null) return;
      drag.strip.style.width = drag.initialStyleWidth;
    },
    onReset: () => {
      const state = useSideTabStripStore.getState();
      state.resetWidth();
      state.setCollapsed(false);
    },
    onKeyNudge: (direction) => {
      nudgeWidth(direction === sign ? 1 : -1);
    },
  });

  return (
    <div
      {...sliderProps}
      aria-valuenow={collapsed ? SIDE_STRIP_RAIL_WIDTH_PX : widthPx}
      aria-valuemin={SIDE_STRIP_RAIL_WIDTH_PX}
      aria-valuemax={SIDE_STRIP_MAX_WIDTH_PX}
      aria-valuetext={collapsed ? "Collapsed" : undefined}
      aria-label="Resize tabs"
      data-testid="side-tab-strip-resize-handle"
      className={cn(
        "absolute inset-y-0 z-20 transition-colors hover:bg-border focus-visible:bg-ring focus-visible:outline-hidden [-webkit-app-region:no-drag]",
        HANDLE_EDGE_CLASS[edge],
        pointerDragHandleAxisClassName("horizontal"),
      )}
    />
  );
}

/**
 * The width a drag frame shows: below the snap point it tracks the pointer
 * down to the rail, above it never goes under the minimum, so the preview is
 * the width a release there commits.
 */
function previewWidthOf(rawWidth: number): number {
  const floor =
    rawWidth < SIDE_STRIP_SNAP_TO_RAIL_BELOW_PX
      ? SIDE_STRIP_RAIL_WIDTH_PX
      : SIDE_STRIP_MIN_WIDTH_PX;
  return Math.min(SIDE_STRIP_MAX_WIDTH_PX, Math.max(floor, rawWidth));
}

/**
 * A released drag: below the snap point collapses, anything else expands at
 * the width the strip rendered.
 */
function commitReleasedWidth(
  draggedWidth: number,
  renderedWidth: number,
): void {
  const state = useSideTabStripStore.getState();
  if (draggedWidth < SIDE_STRIP_SNAP_TO_RAIL_BELOW_PX) {
    state.setCollapsed(true);
    return;
  }
  state.setWidthPx(Math.round(renderedWidth));
  state.setCollapsed(false);
}

/**
 * One arrow press, `grow` already signed for the edge: from the rail a grow
 * expands; expanded, the width steps and a step below the minimum collapses.
 */
function nudgeWidth(grow: 1 | -1): void {
  const state = useSideTabStripStore.getState();
  if (state.collapsed) {
    if (grow === 1) state.setCollapsed(false);
    return;
  }
  const next = state.widthPx + grow * KEYBOARD_RESIZE_STEP_PX;
  if (next < SIDE_STRIP_MIN_WIDTH_PX) {
    state.setCollapsed(true);
    return;
  }
  state.setWidthPx(next);
}
