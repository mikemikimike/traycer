import type { ReactNode } from "react";
import { PresetsBlock } from "@/components/layout-editor/inspector/presets-block";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsPanelShell } from "@/components/settings/settings-panel-shell";
import { SettingsRow } from "@/components/settings/settings-row";
import { LAYOUT } from "@/components/settings/panels/layout-settings.definitions";
import { Switch } from "@/components/ui/switch";
import { useSettingsAvailabilityContext } from "@/hooks/settings/use-settings-availability-context";
import { LAYOUT_REGION_LIST } from "@/components/layout-editor/regions/region-facts";
import {
  SURFACE_GROUPS,
  type SurfaceGroupId,
} from "@/components/layout-editor/regions/region-grammar";
import { cn } from "@/lib/utils";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useLayoutStore } from "@/stores/layout/layout-store";
import { useSettingsDensity } from "@/providers/settings-density-context";

/**
 * The full-width host for the layout form (L-03).
 *
 * Not a second form: it renders the SAME components the inspector docks - the
 * presets block and one `RegionSection` per region - in the same order, with
 * every section expanded and grouped by surface. What it does not have is a
 * canvas, which is the whole reason it exists: below the editor's width
 * threshold there is no room to reflow the app beside an inspector, and a form
 * that needs 1100px of window is not a settings page.
 *
 * The index is the dock's, not this page's: an index exists to pick ONE
 * section to open, and here they are all open.
 */
export function LayoutSettingsPanel(): ReactNode {
  const compact = useSettingsDensity() === "compact";
  return (
    <SettingsPanelShell
      title="Layout"
      description={LAYOUT.page.description}
      bodyClassName="overflow-visible rounded-none border-none bg-transparent"
    >
      <div className={cn("flex flex-col", compact ? "gap-3.5" : "gap-5")}>
        <SettingsGroup
          group={LAYOUT.definitions.presets}
          showTitle
          tone="default"
          dataTestId="layout-presets-group"
          fill={false}
        >
          {/* No canvas here, so a preset hover previews nothing (L-43). */}
          <PresetsBlock onPreviewPreset={noPreview} />
        </SettingsGroup>
        {SURFACE_GROUPS.map((group) => (
          <SurfaceSections key={group.id} surface={group.id} />
        ))}
      </div>
    </SettingsPanelShell>
  );
}

/**
 * One surface's regions, every section expanded, under the surface-level rows
 * that belong to the surface itself rather than to any region (L-51).
 *
 * `onOpenProvider` is `null` because this host has no second level to open:
 * `RegionSection` draws each provider as its own card under `host="page"`,
 * which is what a page with room can do and a 320px dock cannot.
 */
function SurfaceSections(props: {
  readonly surface: SurfaceGroupId;
}): ReactNode {
  const regions = LAYOUT_REGION_LIST.filter(
    (region) => region.surface === props.surface,
  );
  if (regions.length === 0) return null;
  return (
    <SettingsGroup
      group={LAYOUT.definitions[props.surface]}
      showTitle
      tone="default"
      dataTestId={`layout-surface-${props.surface}`}
      fill={false}
    >
      {props.surface === "statusBar" ? <MobileFooterRow /> : null}
      {regions.map((region) => (
        <RegionSection
          key={region.id}
          regionId={region.id}
          host="page"
          onOpenProvider={null}
        />
      ))}
    </SettingsGroup>
  );
}

/**
 * Whether the strip is drawn at all on a narrow viewport (L-51).
 *
 * Drawn only by this host, and only in the installed mobile app: every other
 * build draws the footer whenever `usageHost` says so, so the switch would
 * pick between two identical outcomes.
 */
function MobileFooterRow(): ReactNode {
  const availability = useSettingsAvailabilityContext();
  const arrangement = useLayoutStore((state) => state.arrangement);
  if (!LAYOUT.definitions.mobileFooter.availableWhen(availability)) return null;
  return (
    <SettingsRow
      row={LAYOUT.definitions.mobileFooter}
      control={
        <Switch
          checked={arrangement.mobileFooter}
          onCheckedChange={(checked) => {
            useLayoutEditorStore.getState().recordGesture(() => {
              useLayoutStore
                .getState()
                .setArrangement({ ...arrangement, mobileFooter: checked });
            });
          }}
          aria-label={LAYOUT.definitions.mobileFooter.label}
        />
      }
    />
  );
}

function noPreview(): void {}
