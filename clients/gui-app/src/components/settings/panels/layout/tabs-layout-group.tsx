import type { ReactNode } from "react";
import { trackSettingChanged } from "@/lib/analytics";
import { useSettingsAvailabilityContext } from "@/hooks/settings/use-settings-availability-context";
import { useArrangementValue } from "@/lib/layout-overrides";
import { LAYOUT } from "@/components/settings/panels/layout-settings.definitions";
import { SettingsRow } from "@/components/settings/settings-row";
import {
  useSettingsStore,
  type TaskTabLayout,
} from "@/stores/settings/settings-store";
import {
  SettingsSegmentedControl,
  type SettingsSegmentedOption,
} from "@/components/settings/controls/settings-segmented-control";

const TAB_LAYOUT_OPTIONS: ReadonlyArray<
  SettingsSegmentedOption<TaskTabLayout>
> = [
  { value: "scroll", label: "Scroll" },
  { value: "shrink", label: "Shrink to fit" },
];

/**
 * How tabs fit a horizontal strip. A vertical strip stacks its tabs and never
 * scrolls or shrinks them sideways, so while the tabs sit at a side the control
 * is disabled and says why; the stored value is kept for the way back. Only
 * where the placement itself can be picked: the installed mobile app always
 * draws its tabs at the top, so this row always applies there.
 */
export function TaskTabLayoutRow(): ReactNode {
  const taskTabLayout = useSettingsStore((state) => state.taskTabLayout);
  const setTaskTabLayout = useSettingsStore((state) => state.setTaskTabLayout);
  const availability = useSettingsAvailabilityContext();
  const placement = useArrangementValue("tabStripPlacement");
  const vertical =
    LAYOUT.definitions.tabStripPlacement.availableWhen(availability) &&
    placement !== "top";
  return (
    <SettingsRow
      row={LAYOUT.definitions.taskTabLayout}
      status={vertical ? "Applies when tabs are at the top." : undefined}
      control={
        <SettingsSegmentedControl
          value={taskTabLayout}
          options={TAB_LAYOUT_OPTIONS}
          onChange={(value) => {
            trackSettingChanged("layout", "taskTabLayout");
            setTaskTabLayout(value);
          }}
          ariaLabel="Task tab layout"
          disabled={vertical}
        />
      }
    />
  );
}
