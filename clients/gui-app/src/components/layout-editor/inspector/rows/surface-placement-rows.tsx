import type { ReactNode } from "react";
import {
  InspectorRow,
  RevertButton,
} from "@/components/layout-editor/inspector/inspector-row";
import { useLayoutFormHost } from "@/components/layout-editor/inspector/layout-form-host";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import { writeArrangement } from "@/lib/layout/arrangement-gestures";
import {
  EDGE_SIDE_OPTIONS,
  TAB_STRIP_PLACEMENT_OPTIONS,
  type SurfaceGroupId,
} from "@/components/layout-editor/regions/region-grammar";
import { LAYOUT } from "@/components/settings/panels/layout-settings.definitions";
import { SettingsRow } from "@/components/settings/settings-row";
import { useSettingsAvailabilityContext } from "@/hooks/settings/use-settings-availability-context";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import {
  sidebarSideChanged,
  tabStripPlacementChanged,
} from "@/lib/layout/layout-diff";
import type { SettingsRowDefinition } from "@/lib/settings-search/settings-definitions";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * The two placements that belong to a SURFACE rather than to a region: where
 * the task tabs sit and which side of the task canvas the sidebar takes.
 *
 * Neither the tab strip nor the sidebar column is a region, so these rows sit
 * under their surface's heading on both hosts - the docked inspector's index
 * and the Settings page's surface card - rather than in a region's section.
 * Each host frames the row its own way (an `InspectorRow` in the dock, a
 * `SettingsRow` with its search anchor on the page); the control, the write
 * and the revert are the same. Both read the STORED arrangement, write it as
 * one recorded gesture (L-18) and offer a revert only while the value differs
 * from the shipped one. Label, description, keywords and availability are the
 * Settings search definitions', so a search result, the filters and the row
 * all say the same thing.
 */

const TAB_STRIP_PLACEMENT_ROW = LAYOUT.definitions.tabStripPlacement;
const SIDEBAR_SIDE_ROW = LAYOUT.definitions.sidebarSide;

/** The surface's own placement row, drawn under its heading in the dock. */
export function SurfacePlacementRow(props: {
  readonly surface: SurfaceGroupId;
}): ReactNode {
  if (props.surface === "topBar") return <TabStripPositionRow />;
  if (props.surface === "sidebar") return <SidebarSideRow />;
  return null;
}

/**
 * One placement row in the frame of the host drawing it, or nothing where its
 * definition says the build has no use for it (the installed mobile app).
 */
function PlacementRow(props: {
  readonly row: SettingsRowDefinition;
  readonly control: ReactNode;
  readonly onRevert: (() => void) | null;
  readonly revertLabel: string;
}): ReactNode {
  const { row, control, onRevert, revertLabel } = props;
  const page = useLayoutFormHost() === "page";
  const availability = useSettingsAvailabilityContext();
  if (!row.availableWhen(availability)) return null;
  if (page) {
    return (
      <SettingsRow
        row={row}
        control={
          <div className="flex items-center gap-1.5">
            {control}
            {onRevert === null ? null : (
              <RevertButton onRevert={onRevert} label={revertLabel} />
            )}
          </div>
        }
      />
    );
  }
  return (
    <InspectorRow
      top
      label={row.label}
      description={row.description ?? undefined}
      control={control}
      onRevert={onRevert ?? undefined}
      revertLabel={revertLabel}
    />
  );
}

/** Where the task tabs sit: across the top, or a vertical strip at an edge. */
export function TabStripPositionRow(): ReactNode {
  const arrangement = useLayoutStore((state) => state.arrangement);
  return (
    <PlacementRow
      row={TAB_STRIP_PLACEMENT_ROW}
      onRevert={
        tabStripPlacementChanged(arrangement, DEFAULT_ARRANGEMENT)
          ? () => {
              writeArrangement({
                ...arrangement,
                tabStripPlacement: DEFAULT_ARRANGEMENT.tabStripPlacement,
              });
            }
          : null
      }
      revertLabel="Revert tabs position"
      control={
        <SegmentedControl
          ariaLabel="Tabs position"
          options={TAB_STRIP_PLACEMENT_OPTIONS}
          value={arrangement.tabStripPlacement}
          onChange={(next) => {
            const option = TAB_STRIP_PLACEMENT_OPTIONS.find(
              (candidate) => candidate.value === next,
            );
            if (option === undefined) return;
            writeArrangement({
              ...arrangement,
              tabStripPlacement: option.value,
            });
          }}
        />
      }
    />
  );
}

/** Which side of the task canvas the sidebar sits on. */
export function SidebarSideRow(): ReactNode {
  const arrangement = useLayoutStore((state) => state.arrangement);
  return (
    <PlacementRow
      row={SIDEBAR_SIDE_ROW}
      onRevert={
        sidebarSideChanged(arrangement, DEFAULT_ARRANGEMENT)
          ? () => {
              writeArrangement({
                ...arrangement,
                sidebarSide: DEFAULT_ARRANGEMENT.sidebarSide,
              });
            }
          : null
      }
      revertLabel="Revert sidebar side"
      control={
        <SegmentedControl
          ariaLabel="Sidebar side"
          options={EDGE_SIDE_OPTIONS}
          value={arrangement.sidebarSide}
          onChange={(next) => {
            if (next !== "left" && next !== "right") return;
            writeArrangement({ ...arrangement, sidebarSide: next });
          }}
        />
      }
    />
  );
}
