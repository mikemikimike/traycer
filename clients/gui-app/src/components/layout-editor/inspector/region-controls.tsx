import type { ReactNode } from "react";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import {
  readControlValue,
  writeControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import {
  isRailRegionId,
  regionShownOnValue,
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
        writeRailVisibility(regionId, next);
      }}
    />
  );
}

/**
 * The PAGE row's ONE state control (L-121), merging what the dock keeps as two
 * rows.
 *
 * A page row is the whole of a region, and it used to carry `Full row | Chip`
 * AND a switch AND a chevron, with the size control staying live and
 * meaningful-looking while the switch was off. One control with two or three
 * options says the same thing once:
 *
 * | Row kind | Options |
 * | --- | --- |
 * | rail panel | `Auto` `Shown` `Hidden` (L-47, L-93) |
 * | sizeable | `Full row` `Chip` `Hidden` |
 * | everything else | `Shown` `Hidden` |
 *
 * `Full row / Chip / Hidden` is not a new value: it is `size` and `shown` read
 * together and written apart. `Hidden` writes `shown` and leaves `size` alone,
 * so a hidden chip still materialises as a chip ghost (L-113) and comes back
 * as a chip when it is shown again; `Full row` or `Chip` writes both in one
 * gesture, so the round trip is lossless and one undo step.
 *
 * The DOCK is deliberately not this control (L-128): the owner approved the
 * artifact's grammar for the inspector, so {@link RegionShownControl} and
 * {@link RegionSizeControl} keep drawing Shown and Size there. Both hosts
 * write the same two stored values, which is the part that is not allowed to
 * fork.
 */
export function RegionDisplayControl(props: {
  readonly regionId: RegionId;
  readonly values: LayoutValues;
}): ReactNode {
  const { regionId, values } = props;
  const facts = regionFacts(regionId);
  const regionValues = values[regionId];
  const hidden = readControlValue(regionValues, "shown") === "hidden";
  // One wording for all three option sets, so every row on the page has the
  // same accessible-name pattern whatever its options are.
  const ariaLabel = `${facts.name} display`;

  if (isRailRegionId(regionId)) {
    return (
      <SegmentedControl
        ariaLabel={ariaLabel}
        value={String(readControlValue(regionValues, "shown"))}
        options={RAIL_VISIBILITY_OPTIONS}
        onChange={(next) => {
          writeRailVisibility(regionId, next);
        }}
      />
    );
  }
  if (facts.rows.some((row) => row.kind === "size")) {
    return (
      <SegmentedControl
        ariaLabel={ariaLabel}
        value={
          hidden ? "hidden" : String(readControlValue(regionValues, "size"))
        }
        options={SIZEABLE_DISPLAY_OPTIONS}
        onChange={(next) => {
          if (next === "hidden") {
            setRegionShown(regionId, false);
            return;
          }
          writeSizeShown(regionId, next);
        }}
      />
    );
  }
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={hidden ? "hidden" : "shown"}
      options={SHOWN_HIDDEN_OPTIONS}
      onChange={(next) => {
        setRegionShown(regionId, next === "shown");
      }}
    />
  );
}

/** The rail's three-state write, from either host's control. */
function writeRailVisibility(regionId: RegionId, next: string): void {
  if (next !== "auto" && next !== "shown" && next !== "hidden") return;
  useLayoutEditorStore.getState().recordGesture(() => {
    useLayoutStore.getState().setRegionValues(regionId, { shown: next });
  });
}

/**
 * Size and Shown as ONE gesture, which is what makes the merged control one
 * undo step rather than two.
 *
 * `Reflect.set` for the same reason `region-control-io.ts` uses it: `keyof
 * LayoutValues[K]` collapses to the one field all twenty-two regions share
 * once the region is a plain `RegionId`, and `setRegionValues` parses the
 * merged patch through the same total resolver a rehydrate uses, so a wrong
 * key cannot persist. Shown goes through `regionShownOnValue` rather than the
 * literal, so there is still one rule for what "on" means (L-47).
 */
function writeSizeShown(regionId: RegionId, size: string): void {
  useLayoutEditorStore.getState().recordGesture(() => {
    const patch: Partial<LayoutValues[RegionId]> = {};
    Reflect.set(patch, "size", size);
    Reflect.set(patch, "shown", regionShownOnValue(regionId));
    useLayoutStore.getState().setRegionValues(regionId, patch);
  });
}

const RAIL_VISIBILITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "shown", label: "Shown" },
  { value: "hidden", label: "Hidden" },
];

const HIDDEN_OPTION = { value: "hidden", label: "Hidden" };

const SHOWN_HIDDEN_OPTIONS = [
  { value: "shown", label: "Shown" },
  HIDDEN_OPTION,
];

/**
 * The size words verbatim from the grammar's own set, plus Hidden.
 *
 * Written this way rather than with a third literal so the two hosts cannot
 * end up calling the same stored value "Full row" in one and "Full" in the
 * other.
 */
const SIZEABLE_DISPLAY_OPTIONS = [...SIZE_OPTIONS, HIDDEN_OPTION];

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
