import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PresetsBlock } from "@/components/layout-editor/inspector/presets-block";
import { RegionFilter } from "@/components/layout-editor/inspector/region-filter";
import {
  LAYOUT_REGION_LIST,
  positionRowChanged,
  regionMatchesFilter,
  regionStateWord,
  SURFACE_GROUPS,
  SURFACE_ROWS,
} from "@/lib/layout/layout-regions";
import { regionChanged } from "@/lib/layout/layout-diff";
import type { LayoutPresetId } from "@/lib/layout/layout-values";
import { effectiveLayoutValues } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  useLayoutStore,
  type LayoutSnapshot,
} from "@/stores/layout/layout-store";

interface InspectorIndexProps {
  /** Nothing selected (L-06): presets, then the region index. */
  readonly host: "inspector" | "page";
  readonly onPreviewPreset: (presetId: LayoutPresetId | null) => void;
}

/**
 * The empty state (L-06): presets, the filter, then every region grouped by
 * surface with state words and changed-dots. `buildIndex` in the prototype.
 *
 * The primary keyboard surface (L-31): arrows walk the rows with the ring
 * following (the ring itself is ticket 06's wiring; this component raises
 * `hovered` on keyboard nav the same way a pointer hover does), Enter opens a
 * section, and ArrowUp from the first row returns to the filter.
 */
export function InspectorIndex(props: InspectorIndexProps): ReactNode {
  const { host, onPreviewPreset } = props;
  const filter = useLayoutEditorStore((state) => state.filter);
  const snapshot = useSnapshot();
  const filterRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Map<RegionId, HTMLButtonElement>>(new Map());

  const groups = SURFACE_GROUPS.map((group) => ({
    group,
    regions: LAYOUT_REGION_LIST.filter(
      (region) =>
        region.surface === group.id && regionMatchesFilter(region.id, filter),
    ),
  })).filter((entry) => entry.regions.length > 0);

  const orderedIds = groups.flatMap((entry) =>
    entry.regions.map((region) => region.id),
  );

  function focusRow(index: number): void {
    if (orderedIds.length === 0) return;
    const clamped = Math.min(Math.max(index, 0), orderedIds.length - 1);
    const regionId = orderedIds[clamped];
    rowRefs.current.get(regionId)?.focus();
  }

  function handleRowKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    regionId: RegionId,
  ): void {
    const index = orderedIds.indexOf(regionId);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      useLayoutEditorStore.getState().setKeyboardNav(true);
      focusRow(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      useLayoutEditorStore.getState().setKeyboardNav(true);
      if (index <= 0) filterRef.current?.focus();
      else focusRow(index - 1);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      useLayoutEditorStore.getState().select(regionId);
    }
  }

  return (
    <div>
      <PresetsBlock onPreviewPreset={onPreviewPreset} />
      <RegionFilter
        ref={filterRef}
        onArrowDown={() => {
          focusRow(0);
        }}
      />
      {host === "page" ? <SurfaceRows /> : null}
      {orderedIds.length === 0 ? (
        <p className="px-3.5 py-4 text-ui-sm text-muted-foreground">
          No region matches "{filter}".
        </p>
      ) : (
        groups.map((entry) => (
          <div key={entry.group.id}>
            <div className="px-3.5 pt-3 pb-1 text-overline text-muted-foreground uppercase">
              {entry.group.label}
            </div>
            {entry.regions.map((region) => {
              const changed =
                regionChanged(snapshot, region.id) ||
                positionRowChanged(snapshot, region.id);
              return (
                <button
                  key={region.id}
                  ref={(node) => {
                    if (node) rowRefs.current.set(region.id, node);
                    else rowRefs.current.delete(region.id);
                  }}
                  type="button"
                  data-region-id={region.id}
                  className="flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left text-ui-sm hover:bg-foreground/5 focus-visible:bg-foreground/5 focus-visible:outline-none"
                  onClick={() => {
                    useLayoutEditorStore.getState().select(region.id);
                  }}
                  onFocus={() => {
                    if (useLayoutEditorStore.getState().keyboardNav) {
                      useLayoutEditorStore.getState().setHovered(region.id);
                    }
                  }}
                  onBlur={() => {
                    if (useLayoutEditorStore.getState().hovered === region.id) {
                      useLayoutEditorStore.getState().setHovered(null);
                    }
                  }}
                  onMouseEnter={() => {
                    useLayoutEditorStore.getState().setHovered(region.id);
                  }}
                  onMouseLeave={() => {
                    useLayoutEditorStore.getState().setHovered(null);
                  }}
                  onKeyDown={(event) => {
                    handleRowKeyDown(event, region.id);
                  }}
                >
                  <region.icon
                    className={cn("size-3.5 shrink-0 text-muted-foreground")}
                  />
                  <span className="min-w-0 flex-1 truncate">{region.name}</span>
                  {changed ? (
                    <span
                      aria-hidden
                      data-testid="changed-dot"
                      className="size-1.5 shrink-0 rounded-full bg-info"
                    />
                  ) : null}
                  <span className="shrink-0 text-ui-xs text-muted-foreground">
                    {regionStateWord(
                      region.id,
                      effectiveLayoutValues(
                        snapshot.basePreset,
                        snapshot.overrides,
                      ),
                      snapshot.arrangement,
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        ))
      )}
    </div>
  );
}

function useSnapshot(): LayoutSnapshot {
  const basePreset = useLayoutStore((state) => state.basePreset);
  const overrides = useLayoutStore((state) => state.overrides);
  const arrangement = useLayoutStore((state) => state.arrangement);
  return { basePreset, overrides, arrangement };
}

/**
 * The grammar's surface tier (L-51): rendered only by the full-width host,
 * above that surface's regions - today that is `mobileFooter` alone, on the
 * Status bar group.
 */
function SurfaceRows(): ReactNode {
  const arrangement = useLayoutStore((state) => state.arrangement);
  return (
    <>
      {SURFACE_ROWS.map((row) => (
        <div
          key={row.id}
          className="flex min-h-11 items-center gap-3 border-t border-border px-3.5 py-2.5"
        >
          <div className="min-w-0 flex-1">
            <div className="text-ui-sm">{row.label}</div>
            {row.description ? (
              <p className="mt-0.5 text-ui-xs text-muted-foreground">
                {row.description}
              </p>
            ) : null}
          </div>
          <Switch
            aria-label={row.label}
            checked={arrangement.mobileFooter}
            onCheckedChange={(checked) => {
              useLayoutEditorStore.getState().recordGesture(() => {
                useLayoutStore
                  .getState()
                  .setArrangement({ ...arrangement, mobileFooter: checked });
              });
            }}
          />
        </div>
      ))}
    </>
  );
}
