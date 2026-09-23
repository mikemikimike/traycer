import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from "react";
import { useLayoutSurface } from "@/components/layout-editor/use-layout-surface";
import { ColumnEdgeContext } from "@/components/layout/column-edge-context";
import { isFramelessDesktop } from "@/components/layout/header/title-bar-drag";
import { useMotionEnabled } from "@/lib/animation/use-motion-enabled";
import type { EdgeSide } from "@/lib/layout/layout-arrangement";
import { cn } from "@/lib/utils";
import { useWindowsBridgeHydrated } from "@/providers/windows-bridge-context";
import {
  useSideStripCollapsed,
  useSideTabStripStore,
} from "@/stores/layout/side-tab-strip-store";
import { useTitleBarDraggingSuppressed } from "@/stores/layout/title-bar-drag-store";
import { useTabsStore } from "@/stores/tabs/store";
import { useTabStripController } from "../tab-strip-controller";
import { TabStripIndicatorScope } from "../tab-strip-indicator-scope";
import { SideStripFoot } from "./side-strip-foot";
import { SideStripResizeHandle } from "./side-strip-resize-handle";
import { SideStripRowList } from "./side-strip-row-list";
import { SideStripSkeleton } from "./side-strip-skeleton";
import { SideStripTopBlock } from "./side-strip-top-block";
import type { SideTabRowVariant } from "./side-tab-row";
import {
  SIDE_STRIP_MAX_WIDTH_CLASS,
  SIDE_STRIP_RAIL_WIDTH_PX,
  SIDE_STRIP_TITLE_ROW_MIN_WIDTH_CLASS,
} from "./side-strip-tokens";

const DRAG_REGION_CLASS = "[-webkit-app-region:drag]";
const NO_DRAG_REGION_CLASS = "[-webkit-app-region:no-drag]";

/**
 * The task tabs as a vertical strip at the left or right edge (S-01, S-05):
 * the header's leading actions in the top block, the rows in a scrolling
 * column, the header's trailing actions in the foot, and a resize handle on
 * the content-facing edge.
 *
 * It never returns `null` (S-27): with no tabs, no Home and the landing route
 * only the row list is empty, and before the windows bridge hydrates the rows
 * are placeholders while the top block and the foot are live.
 *
 * `ownsTitleBar` is true only on macOS with the strip at the left, where the
 * top block's first row is the window's title bar (S-04).
 */
export function SideTabStrip(props: {
  readonly edge: EdgeSide;
  readonly ownsTitleBar: boolean;
}): ReactNode {
  const { edge, ownsTitleBar } = props;
  const controller = useTabStripController();
  const hydrated = useWindowsBridgeHydrated();
  const persistedStripCount = useTabsStore((state) => state.stripOrder.length);
  const collapsed = useSideStripCollapsed();
  const widthPx = useSideTabStripStore((state) => state.widthPx);
  const variant: SideTabRowVariant = collapsed ? "collapsed" : "expanded";
  const widthEasing = useCollapseWidthEasing();
  const dragClass = useStripDragClass();
  const stripRef = useRef<HTMLElement | null>(null);
  const surfaceRef = useLayoutSurface("topBar");
  const bindStrip = useCallback(
    (node: HTMLElement | null) => {
      stripRef.current = node;
      surfaceRef(node);
    },
    [surfaceRef],
  );
  return (
    <ColumnEdgeContext.Provider value={edge}>
      <nav
        ref={bindStrip}
        aria-label="Tabs"
        data-testid="side-tab-strip"
        data-edge={edge}
        data-collapsed={collapsed}
        onTransitionEnd={widthEasing.settle}
        onTransitionCancel={widthEasing.settle}
        className={cn(
          "relative flex h-full min-h-0 shrink-0 flex-col bg-canvas text-canvas-foreground md:bg-transparent",
          collapsed ? undefined : SIDE_STRIP_MAX_WIDTH_CLASS,
          // The rail never gets narrower than the traffic lights need (S-18),
          // and the expanded strip never narrower than the lights plus the title
          // row's controls (S-43).
          ownsTitleBar &&
            (collapsed
              ? "wco:min-w-[var(--window-leading-inset)]"
              : SIDE_STRIP_TITLE_ROW_MIN_WIDTH_CLASS),
          // Collapse and expand ease the width once; a handle drag, a nudge and
          // a window resize change it instantly (L-165).
          widthEasing.easing &&
            "transition-[width] duration-(--panel-motion-duration) ease-spring [.traycer-panel-resizing_&]:transition-none",
          dragClass,
        )}
        style={{ width: collapsed ? SIDE_STRIP_RAIL_WIDTH_PX : widthPx }}
      >
        <SideStripTopBlock
          edge={edge}
          variant={variant}
          ownsTitleBar={ownsTitleBar}
          dragClass={dragClass}
          homeTabDrawn={controller.homeTabDrawn}
          homeIsActive={controller.homeIsActive}
          onHomeTab={controller.onHomeTab}
          onNewTab={controller.onNewTab}
          onToggleCollapsed={widthEasing.toggle}
          taskCount={controller.tabs.length}
        />
        <TabStripIndicatorScope indicators={controller.indicators}>
          {hydrated ? (
            <SideStripRowList
              controller={controller}
              edge={edge}
              variant={variant}
            />
          ) : (
            <SideStripSkeleton count={persistedStripCount} variant={variant} />
          )}
        </TabStripIndicatorScope>
        {/* A direct child of the nav: Electron honours a drag region reliably
            only on the title bar's top-level elements. */}
        <div
          aria-hidden
          data-testid="side-strip-drag-spacer"
          className={cn("min-h-0 flex-1", dragClass)}
        />
        <SideStripFoot variant={variant} />
        {/* The joined tab's run into its panel sheet (D3), anchored to the
            joined row and drawn only while one exists (`index.css`). */}
        <span aria-hidden data-side-tab-join-bridge={edge} />
        <SideStripResizeHandle edge={edge} stripRef={stripRef} />
        {controller.dialogs}
      </nav>
    </ColumnEdgeContext.Provider>
  );
}

/**
 * The strip's window drag region on a frameless desktop window, dropped to
 * no-drag while an overlay anchored in the strip needs the clicks.
 */
function useStripDragClass(): string | undefined {
  const dragSuppressed = useTitleBarDraggingSuppressed();
  if (!isFramelessDesktop()) return undefined;
  return dragSuppressed ? NO_DRAG_REGION_CLASS : DRAG_REGION_CLASS;
}

/**
 * Whether the width is easing between the rail and the expanded strip. Only
 * the collapse toggle starts it, and only while motion is enabled; the end of
 * that width transition clears it, so no other width change ever animates -
 * a handle release that snaps to or from the rail changes the width in the
 * same frame and never turns it on (L-165).
 */
function useCollapseWidthEasing(): {
  readonly easing: boolean;
  readonly toggle: () => void;
  readonly settle: (event: TransitionEvent<HTMLElement>) => void;
} {
  const motionEnabled = useMotionEnabled();
  const [easing, setEasing] = useState(false);
  const toggle = (): void => {
    const { collapsed, setCollapsed } = useSideTabStripStore.getState();
    setEasing(motionEnabled);
    setCollapsed(!collapsed);
  };
  const settle = (event: TransitionEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.propertyName !== "width") return;
    setEasing(false);
  };
  return { easing, toggle, settle };
}
