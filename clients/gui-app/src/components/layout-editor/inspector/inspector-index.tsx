import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PresetsBlock } from "@/components/layout-editor/inspector/presets-block";
import { readControlValue } from "@/components/layout-editor/inspector/region-control-io";
import { RegionFilter } from "@/components/layout-editor/inspector/region-filter";
import {
  LAYOUT_REGION_LIST,
  regionStateWord,
} from "@/components/layout-editor/regions/region-facts";
import { regionMatchesFilter } from "@/components/layout-editor/regions/region-filter-match";
import { SURFACE_GROUPS } from "@/components/layout-editor/regions/region-grammar";
import { regionPositionMoved } from "@/components/layout-editor/regions/region-position-rows";
import { regionChanged } from "@/lib/layout/layout-diff";
import type { LayoutPresetId } from "@/lib/layout/layout-presets";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import {
  useLayoutEditorStore,
  type LayoutEditorSession,
} from "@/stores/layout/layout-editor-store";
import { useLayoutSnapshot } from "@/stores/layout/layout-store";

/**
 * The row the index last handed off to, and the session it happened in.
 *
 * Module state rather than a store field because it is not a fact about the
 * layout or about the session - it is where THIS list left its cursor, and the
 * list is the only thing that reads it. It is written on unmount, so every way
 * into a level records it alike (a row click, Enter, the filter's Enter, a
 * click on the canvas), and it is keyed by the session object so a new session
 * opens at the top of the index rather than wherever the last one stopped.
 */
let indexFocusMemory: {
  readonly session: LayoutEditorSession;
  readonly regionId: RegionId;
} | null = null;

/** What the index was showing when it went away, if it is still the same visit. */
function takeIndexFocusMemory(): RegionId | null {
  const memory = indexFocusMemory;
  indexFocusMemory = null;
  if (memory === null) return null;
  return memory.session === useLayoutEditorStore.getState().session
    ? memory.regionId
    : null;
}

/**
 * Only inside a live session, which is the only place the index is drawn: a
 * memory written without one could not be told apart from the next session's,
 * and the session object is what tells two visits apart.
 */
function rememberIndexFocus(): void {
  const { selected, session } = useLayoutEditorStore.getState();
  indexFocusMemory =
    selected === null || session === null
      ? null
      : { session, regionId: selected };
}

interface InspectorIndexProps {
  /** Nothing selected (L-06): presets, then the region index. */
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
  const { onPreviewPreset } = props;
  const filter = useLayoutEditorStore((state) => state.filter);
  const snapshot = useLayoutSnapshot();
  const filterRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
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
  const values = effectiveLayoutValues(snapshot.basePreset, snapshot.overrides);

  function focusRow(index: number): void {
    if (orderedIds.length === 0) return;
    const clamped = Math.min(Math.max(index, 0), orderedIds.length - 1);
    const regionId = orderedIds[clamped];
    rowRefs.current.get(regionId)?.focus();
  }

  // The keyboard starts in the index, on entry and on every walk back out of a
  // level (L-31, I-02) - the counterpart of the back row taking focus on the
  // way in. On the way BACK it starts on the row the user opened: the index
  // unmounts while a region is selected and remounts on the return, so a
  // mount-only focus of the first row cost a keyboard user every press it had
  // taken to walk down there (R1-09).
  //
  // Read out of the DOM and out of the module's own memory rather than off
  // `orderedIds`, so this stays a mount-only effect: a filter keystroke
  // rebuilds the rows and must leave focus in the field.
  //
  // Quiet, like the prototype's own entry focus: `preventScroll` keeps the
  // presets block the session just opened onto in view, and the canvas stays
  // dark because a row's `onFocus` only lights it once the keyboard has been
  // used.
  useEffect(() => {
    const remembered = takeIndexFocusMemory();
    const row =
      remembered === null ? undefined : rowRefs.current.get(remembered);
    const target =
      row ??
      rootRef.current?.querySelector<HTMLButtonElement>("[data-region-id]") ??
      null;
    target?.focus({ preventScroll: true });
    return () => {
      rememberIndexFocus();
    };
  }, []);

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
    <div ref={rootRef}>
      <PresetsBlock onPreviewPreset={onPreviewPreset} />
      <RegionFilter
        ref={filterRef}
        onArrowDown={() => {
          focusRow(0);
        }}
        onEnter={() => {
          const first = orderedIds.at(0);
          if (first === undefined) return;
          useLayoutEditorStore.getState().select(first);
        }}
      />
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
                regionPositionMoved(snapshot, region.id);
              // "Auto" is not off: only a region a person turned off reads
              // muted, which is the prototype's `.idx-row.off` (I-09).
              const hidden =
                readControlValue(values[region.id], "shown") === "hidden";
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
                  <region.icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      hidden && "text-muted-foreground",
                    )}
                  >
                    {region.name}
                  </span>
                  {changed ? (
                    <span
                      aria-hidden
                      data-testid="changed-dot"
                      className="size-1.5 shrink-0 rounded-full bg-info"
                    />
                  ) : null}
                  <span className="shrink-0 text-ui-xs text-muted-foreground">
                    {regionStateWord(region.id, values, snapshot.arrangement)}
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
