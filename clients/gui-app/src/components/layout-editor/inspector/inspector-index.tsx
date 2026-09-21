import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PresetsBlock } from "@/components/layout-editor/inspector/presets-block";
import { readControlValue } from "@/components/layout-editor/inspector/region-control-io";
import { RegionFilter } from "@/components/layout-editor/inspector/region-filter";
import {
  LAYOUT_REGION_LIST,
  regionFacts,
  regionStateWord,
  type RegionFacts,
} from "@/components/layout-editor/regions/region-facts";
import { regionMatchesFilter } from "@/components/layout-editor/regions/region-filter-match";
import {
  SURFACE_GROUPS,
  type SurfaceGroupId,
} from "@/components/layout-editor/regions/region-grammar";
import { regionPositionMoved } from "@/components/layout-editor/regions/region-position-rows";
import { regionChanged } from "@/lib/layout/layout-diff";
import type { LayoutPresetId } from "@/lib/layout/layout-presets";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { RailEntry } from "@/lib/layout/rail";
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

/**
 * One line of the index: a region to open, or a group boundary to read.
 *
 * Only the sidebar has the second kind, because only the rail has boundaries
 * of its own (L-25).
 */
type IndexEntry =
  | { readonly kind: "region"; readonly region: RegionFacts }
  | { readonly kind: "divider"; readonly id: string };

/**
 * The sidebar group's lines: the rail's own order, with its group breaks
 * (LV2-09).
 *
 * The index used to list the nine panels in registry order while the canvas
 * beside it drew them in `arrangement.rail`'s, so row 2 of the list was icon 5
 * on the screen, and the dividers a user had added were invisible until they
 * opened the section. The list IS the rail's picture in this host, so it is
 * read off the rail.
 *
 * A divider is drawn as the break it is rather than as a row of its own: the
 * rail draws a boundary as a gap between two icons, not as the word "Divider",
 * and a row per divider would be seven extra lines in the shipped rail alone.
 * The word, the remove button and the drag belong to the sortable list, which
 * is where a divider is OPERATED.
 */
function railIndexEntries(
  rail: ReadonlyArray<RailEntry>,
  filter: string,
): ReadonlyArray<IndexEntry> {
  const entries: IndexEntry[] = [];
  let pending: string | null = null;
  for (const entry of rail) {
    if (entry.kind === "divider") {
      // Held, not drawn: a break needs a line on each side of it. One at
      // either end of the rail - or the second of two in a row - separates
      // nothing, which is exactly how inert it is in the rail itself
      // (`leftPanelGroupsFromRail`), and under a filter the same rule drops
      // the breaks whose neighbours have gone.
      if (entries.length > 0) pending = entry.id;
      continue;
    }
    if (!regionMatchesFilter(entry.id, filter)) continue;
    if (pending !== null) {
      entries.push({ kind: "divider", id: pending });
      pending = null;
    }
    entries.push({ kind: "region", region: regionFacts(entry.id) });
  }
  return entries;
}

/** Every other surface: the registry's declaration order, filtered. */
function surfaceIndexEntries(
  surface: SurfaceGroupId,
  filter: string,
): ReadonlyArray<IndexEntry> {
  return LAYOUT_REGION_LIST.filter(
    (region) =>
      region.surface === surface && regionMatchesFilter(region.id, filter),
  ).map((region): IndexEntry => ({ kind: "region", region }));
}

interface InspectorIndexProps {
  /** Nothing selected (L-06): presets, then the region index. */
  readonly onPreviewPreset: (presetId: LayoutPresetId | null) => void;
}

/**
 * The empty state (L-06): presets, the filter, then every region grouped by
 * surface with state words and changed-dots. `buildIndex` in the prototype.
 *
 * Within a surface the registry's declaration order stands, except on the
 * sidebar: the rail is the one surface whose order the user rearranges and the
 * canvas draws, so that group is read off `arrangement.rail`, breaks included
 * (LV2-09).
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

  // A group with no region left has no divider left either, so one emptiness
  // test covers both kinds of line.
  const groups = SURFACE_GROUPS.map((group) => ({
    group,
    entries:
      group.id === "sidebar"
        ? railIndexEntries(snapshot.arrangement.rail, filter)
        : surfaceIndexEntries(group.id, filter),
  })).filter((entry) => entry.entries.length > 0);

  // The walk is over the rows that open something: a break is read, not
  // operated, so an arrow steps straight over it.
  const orderedIds = groups.flatMap((entry) =>
    entry.entries.flatMap((item) =>
      item.kind === "divider" ? [] : [item.region.id],
    ),
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
        // The field takes the key; lighting the canvas's keyboard mode is
        // THIS host's, because `keyboardNav` is a fact about a session and the
        // page draws the same field without one (R2-04).
        onArrowDown={() => {
          useLayoutEditorStore.getState().setKeyboardNav(true);
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
            {entry.entries.map((item) => {
              if (item.kind === "divider") {
                return (
                  <div
                    key={item.id}
                    role="separator"
                    data-rail-divider={item.id}
                    className="mx-3.5 my-1 h-px bg-border"
                  />
                );
              }
              const region = item.region;
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
