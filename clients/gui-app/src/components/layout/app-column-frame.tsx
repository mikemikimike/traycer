import type { ReactNode } from "react";
import { DesktopMenuHeader } from "@/components/layout/header/desktop-menu-header";
import type { AppColumnChrome } from "@/components/layout/header/app-title-band-kind";
import { SWIPE_NAV_SCREEN_ATTRIBUTE } from "@/components/layout/shell/screen-snapshot";
import {
  sideTabStripEdge,
  type TabStripPlacement,
} from "@/lib/layout/layout-arrangement";
import { cn } from "@/lib/utils";

export interface AppColumnFrameSlots {
  readonly columnRef: (node: HTMLDivElement | null) => void;
  /** Drawn only when `titleBand` is `"header"`. */
  readonly header: ReactNode;
  /** Drawn only when `placement` is a side. */
  readonly strip: ReactNode;
  readonly banners: ReactNode;
  /** Children of the task surface frame. */
  readonly surface: ReactNode;
  /** Rendered inside `<main>`, after the surface frame. */
  readonly mainTail: ReactNode;
  /** Rendered last in the column; its own last child stays the column's last. */
  readonly tail: ReactNode;
}

/**
 * The slots plus the EFFECTIVE placement (`useTabStripPlacement`) and its title
 * band, typed as a pair so a side strip can never come with the header.
 */
export type AppColumnFrameProps = AppColumnFrameSlots & AppColumnChrome;

// Static strings so Tailwind sees every utility it has to generate.
const SURFACE_FRAME_CLASS: Record<TabStripPlacement, string> = {
  top: "md:task-surface-frame",
  left: "md:task-surface-frame-beside-left",
  right: "md:task-surface-frame-beside-right",
};

/**
 * The app column's structure: the header or title band at the top, a side tab
 * strip at the left or right edge, and the content (banners over `<main>`)
 * beside it. DOM order is visual order, so Tab order and screen readers follow
 * the screen.
 *
 * The column is the screen as a history swipe understands one: the header and
 * the content viewport travel together, because a transition that moved only
 * the content would leave the title of the screen you are leaving above the
 * screen you are arriving at.
 */
export function AppColumnFrame(props: AppColumnFrameProps): ReactNode {
  const { placement, titleBand, columnRef } = props;
  const edge = sideTabStripEdge(placement);

  return (
    <div
      ref={columnRef}
      // Named for the stylesheet, which is the half of the layout editor's
      // entry and exit transition that has to exist before a session does: the
      // editor's own `data-layout-editing` is written when a session opens, and
      // the OLD snapshot of the column is captured before that.
      data-layout-column
      data-tab-strip-placement={placement}
      // Read by styles/window-chrome.css to size `--app-title-band-height`.
      data-app-title-band={titleBand}
      className="relative flex h-safe-dvh min-w-0 flex-1 flex-col"
      {...{ [SWIPE_NAV_SCREEN_ATTRIBUTE]: "" }}
    >
      {titleBand === "header" ? props.header : null}
      {titleBand === "band" ? <DesktopMenuHeader variant="title-band" /> : null}
      <div className="flex min-h-0 flex-1 flex-row">
        {edge === "left" ? props.strip : null}
        <div className="flex min-w-0 flex-1 flex-col">
          {props.banners}
          <main className="relative flex min-h-0 flex-1 flex-col">
            {/* The app's edge-to-edge content viewport. Individual surfaces
              own their internal overflow, including the landing terminal.

              `overflow-clip`, NOT `overflow-hidden`: a hidden-overflow box is
              still a scroll container, so a `focus()` without `preventScroll`
              or a `scrollIntoView` on any descendant can scroll it
              programmatically - and nothing ever scrolls it back. Seen live
              when the window moved onto an external display: the transient
              relayout left this viewport scrolled by one toolbar row, so the
              epic status row and sidebar rail sat under the app header until
              a tab switch remounted the surface. A clipped box has no scroll
              offset to drift. */}
            <div
              className={cn(
                "relative flex min-h-0 flex-1 overflow-clip",
                SURFACE_FRAME_CLASS[placement],
              )}
            >
              {props.surface}
            </div>
            {props.mainTail}
          </main>
        </div>
        {edge === "right" ? props.strip : null}
      </div>
      {props.tail}
    </div>
  );
}
