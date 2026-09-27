/**
 * The Home status board: one row per item agents are tracking, written to the
 * per-user notifications room and read through `useHomeStatusBoard`.
 *
 * The header carries the title, the summary counts and the board's own
 * Table | Board switch; below it, the chosen view. The switch is remembered
 * per device (`settings-store.homeStatusView`) and lives here rather than in
 * Settings, because it is a way of looking at this board, not a preference
 * about the app.
 *
 * An empty board draws nothing at all.
 */
import type { ReactNode } from "react";
import {
  SettingsSegmentedControl,
  type SettingsSegmentedOption,
} from "@/components/settings/controls/settings-segmented-control";
import { trackLayoutSetting } from "@/components/settings/panels/layout/track-layout-setting";
import {
  HomeStatusSummary,
  type HomeStatusViewProps,
} from "@/components/home-focus/home-status-parts";
import { HomeStatusKanban } from "@/components/home-focus/home-status-kanban";
import { HomeStatusTable } from "@/components/home-focus/home-status-table";
import {
  useSettingsStore,
  type HomeStatusView,
} from "@/stores/settings/settings-store";

const VIEW_OPTIONS: ReadonlyArray<SettingsSegmentedOption<HomeStatusView>> = [
  { value: "table", label: "Table" },
  { value: "board", label: "Board" },
];

export function HomeStatusSection(props: HomeStatusViewProps): ReactNode {
  const view = useSettingsStore((state) => state.homeStatusView);
  const setView = useSettingsStore((state) => state.setHomeStatusView);
  if (props.rows.length === 0) return null;
  return (
    <section
      aria-labelledby="home-status-heading"
      data-testid="home-status-section"
      data-view={view}
      className="flex flex-col gap-1"
    >
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 pt-2 pb-1">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2
            id="home-status-heading"
            className="text-ui-xs tracking-[0.08em] text-muted-foreground uppercase"
          >
            Status
          </h2>
          <HomeStatusSummary rows={props.rows} />
        </div>
        <SettingsSegmentedControl
          value={view}
          options={VIEW_OPTIONS}
          onChange={(next) => {
            // Reported under Layout with the board's other settings, so the
            // Home status choices read as one family in analytics.
            trackLayoutSetting("homeStatusView");
            setView(next);
          }}
          ariaLabel="Status view"
        />
      </div>
      {view === "board" ? (
        <HomeStatusKanban {...props} />
      ) : (
        <HomeStatusTable {...props} />
      )}
    </section>
  );
}
