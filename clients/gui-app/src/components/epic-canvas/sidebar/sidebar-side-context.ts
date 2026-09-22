import { createContext, use } from "react";
import type { EdgeSide } from "@/lib/layout/layout-arrangement";

/**
 * The per-epic sidebar's side (S-06): which edge of the epic canvas
 * `EpicSidebarColumn` is docked to. Provided by `EpicSidebarColumn` itself,
 * so everything it renders - the rail, the resize handle, popovers - can
 * mirror without threading a prop through every layer.
 *
 * Defaults to "left" because sidebar content can mount outside
 * `EpicSidebarColumn` with no provider above it - the mobile switcher
 * (components/epic-canvas/mobile/switcher-agents-list.tsx,
 * switcher-row-actions.tsx, switcher-panel-embed.tsx), which renders
 * chat-tree rows and row menus of its own - where the default reproduces
 * HEAD's hard-coded `side="right"` popovers.
 */
export const SidebarSideContext = createContext<EdgeSide>("left");

/**
 * The side a popover anchored to a sidebar row or rail icon should open on,
 * so it opens toward the canvas: `"right"` for a left sidebar, `"left"` for
 * a right one.
 */
export function useSidebarPopoverSide(): EdgeSide {
  const side = use(SidebarSideContext);
  return side === "left" ? "right" : "left";
}
