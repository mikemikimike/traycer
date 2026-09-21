import type { ReactNode } from "react";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import {
  readControlValue,
  writeControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import {
  isRailRegionId,
  setRegionShown,
  writeArrangement,
} from "@/components/layout-editor/layout-gestures";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import {
  EDGE_SIDE_OPTIONS,
  SIZE_OPTIONS,
  USAGE_HOST_OPTIONS,
} from "@/components/layout-editor/regions/region-grammar";
import { Switch } from "@/components/ui/switch";
import type { LayoutArrangement } from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";

/**
 * The bare controls the layout form's settings are operated with, with no row
 * around them.
 *
 * They are split out from the rows that used to own them because the two hosts
 * FRAME the same setting differently: in the dock a region's section gives
 * Shown a header and Size a labelled row, and on the page both sit inline on
 * the region's row inside its surface list (L-95). Framing is the difference
 * the two hosts are allowed to have; the control is not, and a second copy of
 * one is how two vocabularies for one value get built (D5).
 */

/**
 * A region's ONE visibility control, and the only one anywhere on either host.
 *
 * Tri-state for every rail panel (L-47, L-93): the VALUE is three-state for all
 * nine, so a two-position switch could not reach "shown, pinned open" at all
 * and its on position meant `auto` on seven panels and `shown` on none of them.
 * That is also why the eye button on the rail's list rows is gone: it wrote
 * through `regionShownOnValue`, so clicking it twice silently turned a pinned
 * "Shown" back into "Auto" (D5).
 */
export function RegionShownControl(props: {
  readonly regionId: RegionId;
  readonly values: LayoutValues;
}): ReactNode {
  const { regionId, values } = props;
  const facts = regionFacts(regionId);
  const shownValue = String(readControlValue(values[regionId], "shown"));

  if (!isRailRegionId(regionId)) {
    return (
      <Switch
        aria-label={`Show ${facts.name}`}
        checked={shownValue !== "hidden"}
        onCheckedChange={() => {
          setRegionShown(regionId, shownValue === "hidden");
        }}
      />
    );
  }
  return (
    <SegmentedControl
      ariaLabel={`${facts.name} visibility`}
      value={shownValue}
      options={RAIL_VISIBILITY_OPTIONS}
      onChange={(next) => {
        if (next !== "auto" && next !== "shown" && next !== "hidden") return;
        useLayoutEditorStore.getState().recordGesture(() => {
          useLayoutStore.getState().setRegionValues(regionId, { shown: next });
        });
      }}
    />
  );
}

const RAIL_VISIBILITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "shown", label: "Shown" },
  { value: "hidden", label: "Hidden" },
];

/** Full row or chip, for the elements that shrink rather than disappear. */
export function RegionSizeControl(props: {
  readonly regionId: RegionId;
  readonly regionValues: LayoutValues[RegionId];
}): ReactNode {
  const { regionId, regionValues } = props;
  return (
    <SegmentedControl
      ariaLabel={`${regionFacts(regionId).name} size`}
      options={SIZE_OPTIONS}
      value={String(readControlValue(regionValues, "size"))}
      onChange={(next) => {
        writeControlValue(regionId, "size", next);
      }}
    />
  );
}

/** Which end of its surface an edge-anchored region sits at. */
export function RegionSideControl(props: {
  readonly regionId: RegionId;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionId, arrangement } = props;
  const sideKey = regionId === "minimap" ? "minimapSide" : "resourceSide";
  return (
    <SegmentedControl
      ariaLabel={`${regionFacts(regionId).name} side`}
      options={EDGE_SIDE_OPTIONS}
      value={arrangement[sideKey]}
      onChange={(next) => {
        if (next !== "left" && next !== "right") return;
        writeArrangement({ ...arrangement, [sideKey]: next });
      }}
    />
  );
}

/**
 * Which surface hosts the usage cluster.
 *
 * A SURFACE control wearing a region's clothes until now (D7): `usageHost`
 * moves Usage limits AND Resource monitor into the top bar and removes the
 * status strip entirely, which is what the preset miniature has always drawn.
 * The page hoists it onto the Status bar card for that reason; the dock still
 * reaches it from the Usage limits section, where a selection is what there is.
 */
export function UsageHostControl(props: {
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { arrangement } = props;
  return (
    <SegmentedControl
      ariaLabel="Position"
      options={USAGE_HOST_OPTIONS}
      value={arrangement.usageHost}
      onChange={(next) => {
        if (next !== "status-bar" && next !== "header") return;
        writeArrangement({ ...arrangement, usageHost: next });
      }}
    />
  );
}
