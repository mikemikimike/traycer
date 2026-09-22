import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Rows2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { PresetsBlock } from "@/components/layout-editor/inspector/presets-block";
import { readControlValue } from "@/components/layout-editor/inspector/region-control-io";
import { RegionFilter } from "@/components/layout-editor/inspector/region-filter";
import { SurfacePlacementRow } from "@/components/layout-editor/inspector/rows/surface-placement-rows";
import { surfacePlacementRowMatchesFilter } from "@/components/layout-editor/inspector/rows/surface-placement-filter";
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

/**
 * What the index was showing when it went away, if it is still the same visit.
 *
 * Read, not consumed: a mount that immediately unmounts and mounts again -
 * StrictMode, a re-parented subtree - would otherwise clear the memory between
 * its own two setups and land the second one on row 0 (R2-11). A memory from
 * an earlier visit is dropped here instead, which is also the only place the
 * closed session it holds is released.
 */
function readIndexFocusMemory(): RegionId | null {
  const memory = indexFocusMemory;
  if (memory === null) return null;
  if (memory.session !== useLayoutEditorStore.getState().session) {
    indexFocusMemory = null;
    return null;
  }
  return memory.regionId;
}

/**
 * The index goes away for two reasons and only one of them is a hand-off: a
 * row was opened, which is what this remembers, or the session ended, which
 * forgets everything rather than leaving a closed `LayoutEditorSession` held
 * here until the next mount.
 *
 * Anything else - a double mount with nothing selected - leaves the memory
 * exactly as it was found, because it is not evidence about where the cursor
 * is. A memory written without a session could not be told apart from the next
 * session's, and the session object is what tells two visits apart.
 */
function rememberIndexFocus(): void {
  const { selected, session } = useLayoutEditorStore.getState();
  if (session === null) {
    indexFocusMemory = null;
    return;
  }
  if (selected === null) return;
  indexFocusMemory = { session, regionId: selected };
}

/**
 * One line of the index: a region to open, or a rail entry to read - a divider
 * (L-155) or a stack link (L-166).
 *
 * Only the sidebar has the last two, because only the rail has entries that
 * are not regions.
 */
type IndexEntry =
  | { readonly kind: "region"; readonly region: RegionFacts }
  | { readonly kind: "divider"; readonly id: string }
  | { readonly kind: "stack"; readonly id: string };

/**
 * The sidebar group's lines: the rail's own order, with its dividers (LV2-09).
 *
 * ONE membership rule for the two sidebar lists this panel shows (LV4-05).
 * Both the index and the Position list are `arrangement.rail` read in order,
 * every entry, panels and dividers alike; they differ only in what a line can
 * DO, which is the difference between reading the rail and operating it - the
 * index draws a divider as the rule it is, and the sortable list draws it as a
 * row with a drag handle and a Remove. They used to disagree on membership,
 * with seven dividers in one list and none in the other, which read as a bug
 * in whichever one the user looked at second.
 *
 * A filter is the one exception, and it applies to the index alone because the
 * Position list has no filter: a filtered index is a search result rather than
 * the rail's picture, and a rule drawn between two rows that are no longer
 * adjacent in the rail would say something untrue.
 */
function railIndexEntries(
  rail: ReadonlyArray<RailEntry>,
  filter: string,
): ReadonlyArray<IndexEntry> {
  const filtering = filter.trim().length > 0;
  return rail.flatMap((entry): IndexEntry[] => {
    if (entry.kind === "divider") {
      return filtering ? [] : [{ kind: "divider", id: entry.id }];
    }
    if (entry.kind === "stack") {
      return filtering ? [] : [{ kind: "stack", id: entry.id }];
    }
    return regionMatchesFilter(entry.id, filter)
      ? [{ kind: "region", region: regionFacts(entry.id) }]
      : [];
  });
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
 * canvas draws, so that group is read off `arrangement.rail`, dividers
 * included (LV2-09).
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
  // test covers both kinds of line. A group whose own placement row matches
  // stays for that row, with whatever regions still match under it.
  const groups = SURFACE_GROUPS.map((group) => ({
    group,
    entries:
      group.id === "sidebar"
        ? railIndexEntries(snapshot.arrangement.rail, filter)
        : surfaceIndexEntries(group.id, filter),
  })).filter(
    (entry) =>
      entry.entries.length > 0 ||
      surfacePlacementRowMatchesFilter(entry.group.id, filter),
  );

  // The walk is over the rows that open something: a divider and a stack link
  // are read, not operated, so an arrow steps straight over them.
  const orderedIds = groups.flatMap((entry) =>
    entry.entries.flatMap((item) =>
      item.kind === "region" ? [item.region.id] : [],
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
    const remembered = readIndexFocusMemory();
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
      {groups.length === 0 ? (
        <p className="px-3.5 py-4 text-ui-sm text-muted-foreground">
          No region matches "{filter}".
        </p>
      ) : (
        groups.map((entry) => (
          <div key={entry.group.id}>
            <div className="px-3.5 pt-3 pb-1 text-overline text-muted-foreground uppercase">
              {entry.group.label}
            </div>
            <SurfacePlacementRow surface={entry.group.id} />
            {entry.entries.map((item) => {
              if (item.kind === "divider") {
                return (
                  <div
                    key={item.id}
                    role="separator"
                    // Named, because a bare separator is announced as nothing
                    // at all and this one is a thing the user can add, move and
                    // remove. "Divider" is the only name it has anywhere
                    // (L-155), the same word the sortable list's own row uses.
                    aria-label="Divider"
                    data-rail-divider={item.id}
                    className="mx-3.5 my-1 h-px bg-border"
                  />
                );
              }
              if (item.kind === "stack") {
                // A link rather than a rule: the two rows it sits between are
                // one body, so the index says so in the same words the
                // Position list's row uses (L-140's one-membership rule,
                // L-166's name).
                return (
                  <div
                    key={item.id}
                    role="separator"
                    aria-label="Stacked with the panel below"
                    data-rail-stack-link={item.id}
                    className="flex items-center gap-1.5 px-3.5 py-1 text-ui-xs text-muted-foreground"
                  >
                    <Rows2 aria-hidden className="size-3 shrink-0" />
                    <span>Stacked</span>
                    <span aria-hidden className="h-px flex-1 bg-border" />
                  </div>
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
