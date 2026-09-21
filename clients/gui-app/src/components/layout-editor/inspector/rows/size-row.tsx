import type { ReactNode } from "react";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import { SegmentedControl } from "@/components/layout-editor/inspector/segmented-control";
import {
  isControlValueChanged,
  readControlValue,
  revertControlValue,
  writeControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import { SIZE_OPTIONS } from "@/components/layout-editor/regions/region-grammar";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/** Full row or chip, for the elements that shrink rather than disappear. */
export function SizeRow(props: {
  readonly regionId: RegionId;
  readonly regionValues: LayoutValues[RegionId];
  readonly description: string;
}): ReactNode {
  const { regionId, regionValues, description } = props;
  return (
    <InspectorRow
      top
      label="Size"
      description={description}
      onRevert={
        isControlValueChanged(regionId, "size")
          ? () => {
              revertControlValue(regionId, "size");
            }
          : undefined
      }
      control={
        <SegmentedControl
          ariaLabel="Size"
          options={SIZE_OPTIONS}
          value={String(readControlValue(regionValues, "size"))}
          onChange={(next) => {
            writeControlValue(regionId, "size", next);
          }}
        />
      }
    />
  );
}
