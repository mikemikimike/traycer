import type { SurfaceGroupId } from "@/components/layout-editor/regions/region-grammar";
import { LAYOUT } from "@/components/settings/panels/layout-settings.definitions";
import type { SettingsRowDefinition } from "@/lib/settings-search/settings-definitions";

/** The placement rows a surface draws under its heading. */
function surfacePlacementRowDefinitions(
  surface: SurfaceGroupId,
): ReadonlyArray<SettingsRowDefinition> {
  if (surface === "topBar") {
    return [
      LAYOUT.definitions.tabStripPlacement,
      LAYOUT.definitions.sideStripView,
    ];
  }
  if (surface === "sidebar") return [LAYOUT.definitions.sidebarSide];
  return [];
}

/** Whether a Settings row's label or keywords match a layout filter. */
export function settingsRowMatchesFilter(
  row: SettingsRowDefinition,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;
  return [row.label, ...row.keywords].some((term) =>
    term.toLowerCase().includes(needle),
  );
}

/**
 * Whether the dock's index keeps a surface for its placement rows: one of them
 * exists on that surface and its own words match the filter.
 */
export function surfacePlacementRowMatchesFilter(
  surface: SurfaceGroupId,
  query: string,
): boolean {
  return surfacePlacementRowDefinitions(surface).some((row) =>
    settingsRowMatchesFilter(row, query),
  );
}
