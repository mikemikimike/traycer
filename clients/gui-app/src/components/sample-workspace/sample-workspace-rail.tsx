import { useState, type MouseEvent } from "react";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import { useLayoutSurface } from "@/components/layout-editor/use-layout-surface";
import { LAYOUT_CLUSTER_ATTRIBUTE } from "@/components/layout-editor/canvas/canvas-attributes";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { RailContextMenuContent } from "@/components/epic-canvas/sidebar/rail-context-menu-content";
import {
  leftPanelIdForRailRegion,
  railDisplayEntries,
  RAIL_REGION_IDS,
} from "@/lib/layout/rail";
import type { LeftPanelId } from "@/lib/left-panel-ids";
import { LeftPanelRailDivider } from "@/components/epic-canvas/sidebar/left-panel-rail-divider";
import { LeftPanelRailStack } from "@/components/epic-canvas/sidebar/left-panel-rail-stack";
import { useRailDividersEditing } from "@/components/epic-canvas/sidebar/use-rail-dividers-editing";
import { LeftPanelRailIcon } from "@/components/epic-canvas/sidebar/left-panel-rail-icon";
import { LEFT_PANEL_RAIL_TILE_CLASS } from "@/components/epic-canvas/sidebar/left-panel-rail-tile";
import {
  getLeftPanelDefinition,
  isLeftPanelVisible,
} from "@/components/epic-canvas/sidebar/left-panel-registry";
import {
  useLayoutRail,
  usePanelVisibilityOverrides,
} from "@/lib/layout/rail-view";
import type { RailRegionId } from "@/lib/layout/region-id";
import { useArrangementValue } from "@/lib/layout-overrides";
import { SAMPLE_RAIL_PRESENCE } from "./sample-workspace-scene";
import { cn } from "@/lib/utils";

/**
 * The sample scene's icon rail: `arrangement.rail` drawn entry by entry.
 *
 * Flat, because the rail IS flat (L-155) - a panel, or a divider the user put
 * between two of them - and this is the surface a session drags on (L-115).
 * The `<aside>` is the cluster the drop resolves against, so a rail member can
 * be pulled past its neighbours and no further.
 *
 * A divider is drawn at rest as the space it is and in a session as the handle
 * it becomes, and a stacked pair is drawn inside the same joined capsule the
 * real rail draws (L-140, L-167) - both through the components the real
 * sidebar uses, so the two rails cannot drift on either.
 *
 * It answers a right-click with the REAL rail's menu (L-144), rendered from the
 * one module both rails share: the editor always opens here (L-87), so this is
 * the rail a user customizing the sidebar actually points at, and it offered
 * nothing at all. Every item in that menu writes the layout store, which is
 * exactly as true against sample icons as against real ones; what the sample
 * has none of is the app behaviour beside it - switching the active panel -
 * and that never lived in the menu.
 */
export function SampleWorkspaceRail() {
  const rail = useLayoutRail();
  const sidebarSide = useArrangementValue("sidebarSide");
  const dividersEditing = useRailDividersEditing();
  // The canvas's sidebar: its empty space selects the surface, and it is what
  // the placement bar and a drag to the other edge move (D14).
  const surfaceRef = useLayoutSurface("sidebar");
  const visibilityOverrideById = usePanelVisibilityOverrides();
  // The icon the pointer was over, or null for the rail's own empty space -
  // which is still a menu, because it is the only way back to a panel with no
  // icon left to aim at. Resolved from the element under the pointer rather
  // than reported by each tile: the tiles already name their region for the
  // canvas (`useLayoutRegion`), so there is nothing to thread.
  const [contextPanelId, setContextPanelId] = useState<LeftPanelId | null>(
    null,
  );
  return (
    <ContextMenu>
      <ContextMenuTrigger
        asChild
        onContextMenu={(event: MouseEvent<HTMLElement>) => {
          setContextPanelId(pointedPanelId(event.target));
        }}
      >
        <aside
          ref={surfaceRef}
          aria-label="Sample sidebar"
          {...{ [LAYOUT_CLUSTER_ATTRIBUTE]: "" }}
          className={cn(
            "hidden shrink-0 flex-col items-center gap-1 p-2 md:flex",
            sidebarSide === "left" ? "border-r" : "border-l",
          )}
        >
          {railDisplayEntries(rail, () => true).map((entry) => {
            if (entry.kind === "panel")
              return <SampleRailTile key={entry.id} regionId={entry.id} />;
            if (entry.kind === "stack") {
              return (
                <LeftPanelRailStack
                  key={entry.id}
                  stackId={entry.id}
                  orientation="vertical"
                  first={<SampleRailTile regionId={entry.top} />}
                  second={<SampleRailTile regionId={entry.bottom} />}
                />
              );
            }
            return (
              <LeftPanelRailDivider
                key={entry.id}
                dividerId={entry.id}
                orientation="vertical"
                editing={dividersEditing}
              />
            );
          })}
        </aside>
      </ContextMenuTrigger>
      <RailContextMenuContent
        context={{ ...SAMPLE_RAIL_PRESENCE, visibilityOverrideById }}
        contextPanelId={contextPanelId}
      />
    </ContextMenu>
  );
}

/** The rail panel under the pointer, read off the region the tile names. */
function pointedPanelId(target: EventTarget): LeftPanelId | null {
  if (!(target instanceof Element)) return null;
  const named = target
    .closest("[data-layout-region]")
    ?.getAttribute("data-layout-region");
  const regionId = RAIL_REGION_IDS.find((id) => id === named) ?? null;
  return regionId === null ? null : leftPanelIdForRailRegion(regionId);
}

function SampleRailTile({ regionId }: { readonly regionId: RailRegionId }) {
  const visibilityOverrideById = usePanelVisibilityOverrides();
  const panelId = leftPanelIdForRailRegion(regionId);
  const definition = getLeftPanelDefinition(panelId);
  const hidden = !isLeftPanelVisible(definition, {
    ...SAMPLE_RAIL_PRESENCE,
    visibilityOverrideById,
  });
  const { ref } = useLayoutRegion({ regionId, instanceId: null });
  return (
    <div
      ref={ref}
      aria-label={definition.title}
      className={cn(
        LEFT_PANEL_RAIL_TILE_CLASS,
        "flex items-center justify-center",
        hidden && "border border-dashed border-border/60",
      )}
    >
      <LeftPanelRailIcon panelId={panelId} hidden={hidden} />
    </div>
  );
}
