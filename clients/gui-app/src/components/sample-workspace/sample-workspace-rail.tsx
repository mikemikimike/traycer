import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import { LAYOUT_CLUSTER_ATTRIBUTE } from "@/components/layout-editor/canvas/region-drag";
import { leftPanelIdForRailRegion } from "@/lib/layout/rail";
import { LeftPanelRailDivider } from "@/components/epic-canvas/sidebar/left-panel-rail-divider";
import { LeftPanelRailIcon } from "@/components/epic-canvas/sidebar/left-panel-rail-icon";
import { LEFT_PANEL_RAIL_TILE_CLASS } from "@/components/epic-canvas/sidebar/left-panel-rail-tile";
import {
  getLeftPanelDefinition,
  isLeftPanelVisible,
} from "@/components/epic-canvas/sidebar/left-panel-registry";
import { usePanelVisibilityOverrides } from "@/lib/layout/rail-view";
import type { RailRegionId } from "@/lib/layout/region-id";
import { useLayoutRail } from "@/lib/layout/rail-view";
import { SAMPLE_RAIL_PRESENCE } from "./sample-workspace-scene";
import { cn } from "@/lib/utils";

/**
 * The sample scene's icon rail: `arrangement.rail` drawn entry by entry.
 *
 * Flat rather than grouped, because the rail IS flat (L-25) - a panel, or a
 * divider that ends the group before it - and this is the surface a session
 * drags on (L-115). The `<aside>` is the cluster the drop resolves against,
 * so a rail member can be pulled past its neighbours and no further.
 */
export function SampleWorkspaceRail() {
  const rail = useLayoutRail();
  return (
    <aside
      aria-label="Sample sidebar"
      {...{ [LAYOUT_CLUSTER_ATTRIBUTE]: "" }}
      className="hidden shrink-0 flex-col items-center gap-1 border-r p-2 md:flex"
    >
      {rail.map((entry) =>
        entry.kind === "divider" ? (
          <LeftPanelRailDivider
            key={entry.id}
            dividerId={entry.id}
            orientation="vertical"
          />
        ) : (
          <SampleRailTile key={entry.id} regionId={entry.id} />
        ),
      )}
    </aside>
  );
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
