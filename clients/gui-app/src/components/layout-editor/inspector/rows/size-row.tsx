import type { ReactNode } from "react";
import { InspectorRow } from "@/components/layout-editor/inspector/inspector-row";
import { RegionSizeControl } from "@/components/layout-editor/inspector/region-controls";
import {
  isControlValueChanged,
  revertControlValue,
} from "@/components/layout-editor/inspector/region-control-io";
import type { LayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * Full row or chip, for the elements that shrink rather than disappear - the
 * DOCK's framing of it. On the page the same control sits inline on the
 * region's row, where the size of a row in a list belongs (L-95).
 */
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
        <RegionSizeControl regionId={regionId} regionValues={regionValues} />
      }
    />
  );
}
