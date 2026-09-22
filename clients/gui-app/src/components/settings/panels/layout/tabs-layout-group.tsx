import type { ReactNode } from "react";
import { trackSettingChanged } from "@/lib/analytics";
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

export function TaskTabLayoutRow(): ReactNode {
  const taskTabLayout = useSettingsStore((state) => state.taskTabLayout);
  const setTaskTabLayout = useSettingsStore((state) => state.setTaskTabLayout);
  return (
    <SettingsRow
      row={LAYOUT.definitions.taskTabLayout}
      control={
        <SettingsSegmentedControl
          value={taskTabLayout}
          options={TAB_LAYOUT_OPTIONS}
          onChange={(value) => {
            trackSettingChanged("layout", "taskTabLayout");
            setTaskTabLayout(value);
          }}
          ariaLabel="Task tab layout"
        />
      }
    />
  );
}
