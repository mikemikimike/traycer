import type { LeftPanelId } from "@/lib/left-panel-ids";
import type { LayoutValues, RailVisibility } from "@/lib/layout/layout-values";
import type { RailRegionId } from "@/lib/layout/region-id";

/**
 * The sidebar rail's own shape: its entries, the bijection onto the sidebar's
 * panel ids, and the two gestures that move a panel within it.
 *
 * A leaf of the layout model, deliberately: nothing here names
 * `LayoutArrangement`, so `layout-arrangement.ts` can hold the rail among its
 * fields and its mutations among its writers without the two importing each
 * other. Reading the rail is this file's job; changing an arrangement is not.
 */

/**
 * The rail as one flat list of items (L-155): a panel, or a divider.
 *
 * A divider is a SPACER and nothing more - the user adds one, drags it and
 * removes it, and the rail draws it as a gap at rest (L-140). It groups
 * nothing: there is no notion of a run of panels belonging together, in the
 * rail or in the sidebar body, and the shipped rail ships with none.
 */
export type RailEntry =
  | { readonly kind: "panel"; readonly id: RailRegionId }
  | { readonly kind: "divider"; readonly id: string };

/** The rail's panels in canonical order, which is the sidebar's own. */
export const RAIL_REGION_IDS: ReadonlyArray<RailRegionId> = [
  "railAgents",
  "railArtifacts",
  "railTerminals",
  "railBrowsers",
  "railGitDiff",
  "railPullRequests",
  "railFileTree",
  "railSharing",
  "railComments",
];

/**
 * The rail regions and the sidebar panels they draw, both ways.
 *
 * Written out twice rather than derived, because deriving the inverse of a
 * `Record` costs a cast and buys nothing: the pair is nine lines that a reader
 * checks by looking.
 */
const PANEL_BY_RAIL_REGION: Readonly<Record<RailRegionId, LeftPanelId>> = {
  railAgents: "chats",
  railArtifacts: "artifacts",
  railTerminals: "terminals",
  railBrowsers: "browsers",
  railGitDiff: "git-diff",
  railPullRequests: "pull-requests",
  railFileTree: "file-tree",
  railSharing: "sharing",
  railComments: "comments",
};

/**
 * Exported for the one caller that walks it rather than asking about a panel
 * it already knows: the shipped-key carry, which reads a persisted map keyed
 * by panel id (L-61).
 */
export const RAIL_REGION_BY_PANEL: Readonly<Record<LeftPanelId, RailRegionId>> =
  {
    chats: "railAgents",
    artifacts: "railArtifacts",
    terminals: "railTerminals",
    browsers: "railBrowsers",
    "git-diff": "railGitDiff",
    "pull-requests": "railPullRequests",
    "file-tree": "railFileTree",
    sharing: "railSharing",
    comments: "railComments",
  };

/**
 * Which sidebar panel a rail region draws, for the surfaces that need the
 * panel's own metadata - its title and its icon - rather than the region's id.
 */
export function leftPanelIdForRailRegion(regionId: RailRegionId): LeftPanelId {
  return PANEL_BY_RAIL_REGION[regionId];
}

/** The inverse, for the rail's own writers, which speak in panel ids. */
export function railRegionForLeftPanelId(panelId: LeftPanelId): RailRegionId {
  return RAIL_REGION_BY_PANEL[panelId];
}

/**
 * The nine rail regions' three-state `shown` as the sparse show/hide map every
 * sidebar render path already reads (`isLeftPanelVisible`): `auto` leaves the
 * panel absent from the map and therefore on its own rule, `shown` writes
 * `true` and `hidden` writes `false`.
 */
export function panelVisibilityOverridesFromValues(
  values: Pick<LayoutValues, RailRegionId>,
): Readonly<Partial<Record<LeftPanelId, boolean>>> {
  const overrides: Partial<Record<LeftPanelId, boolean>> = {};
  for (const regionId of RAIL_REGION_IDS) {
    const shown = values[regionId].shown;
    if (shown === "auto") continue;
    overrides[PANEL_BY_RAIL_REGION[regionId]] = shown === "shown";
  }
  return overrides;
}

/** The other direction, for a writer holding one panel's show/hide/follow. */
export function railVisibilityFor(override: boolean | null): RailVisibility {
  if (override === null) return "auto";
  return override ? "shown" : "hidden";
}

/** A divider id is always this shape, so it can never collide with a panel id. */
const DIVIDER_ID_PREFIX = "divider:";

export function railDividerId(seq: number): string {
  return `${DIVIDER_ID_PREFIX}${String(seq)}`;
}

/** The highest number any divider in a rail is already using. */
export function highestDividerSeq(rail: ReadonlyArray<RailEntry>): number {
  return rail.reduce((highest, entry) => {
    if (entry.kind !== "divider") return highest;
    const seq = Number(entry.id.slice(DIVIDER_ID_PREFIX.length));
    return Number.isFinite(seq) ? Math.max(highest, seq) : highest;
  }, 0);
}

/** The shipped rail: the nine panels in order and no dividers (L-155). */
export const DEFAULT_RAIL: ReadonlyArray<RailEntry> = RAIL_REGION_IDS.map(
  (id): RailEntry => ({ kind: "panel", id }),
);

/** The `dividerSeq` the shipped rail has used up, so the first one is `divider:1`. */
export const DEFAULT_RAIL_DIVIDER_SEQ = 0;

/**
 * The panels the rail draws, in its own order, with the hidden ones dropped.
 *
 * THE visibility filter for the sidebar (R5R-05): the rail's icon column, the
 * body's choice of panel and the PR retention all ask it, so a new rule about
 * which panels are drawn is applied in one place rather than in three copies
 * of "walk the rail, drop the dividers, drop the hidden".
 */
export function visibleRailPanelIds(
  rail: ReadonlyArray<RailEntry>,
  isVisible: (panelId: LeftPanelId) => boolean,
): ReadonlyArray<LeftPanelId> {
  return rail.flatMap((entry): LeftPanelId[] => {
    if (entry.kind === "divider") return [];
    const panelId = PANEL_BY_RAIL_REGION[entry.id];
    return isVisible(panelId) ? [panelId] : [];
  });
}

/**
 * Where "Add divider" puts a new one (L-159): immediately before the last
 * panel, never after it.
 *
 * Appending was right while an edge divider was inert and the gesture that
 * mattered was dragging it into place. Under L-155 a divider is a spacer the
 * user adds to SEE, and one past the last icon in a `justify-start` column
 * spaces nothing, so the press reads as a no-op and the user presses again.
 */
export function railDividerInsertIndex(rail: ReadonlyArray<RailEntry>): number {
  const lastPanelIndex = rail.reduce(
    (found, entry, index) => (entry.kind === "panel" ? index : found),
    -1,
  );
  return lastPanelIndex < 0 ? rail.length : lastPanelIndex;
}

/** Two rails holding the same entries in the same order. */
export function areRailsEqual(
  left: ReadonlyArray<RailEntry>,
  right: ReadonlyArray<RailEntry>,
): boolean {
  return (
    left.length === right.length &&
    left.every((entry, index) => {
      const other = right[index];
      return entry.kind === other.kind && entry.id === other.id;
    })
  );
}

/**
 * A stored panel ORDER read back as a rail, with no dividers.
 *
 * The shape a persisted record from another store has is a list of ids this
 * build may not know (the L-49 carry), so an unknown id is dropped and
 * `normalizeRail` puts back whatever the record never named.
 */
export function railFromPanelIdOrder(
  panelIds: ReadonlyArray<string>,
): ReadonlyArray<RailEntry> {
  return normalizeRail(
    panelIds.flatMap((panelId): RailEntry[] => {
      const regionId = railRegionForPanelId(panelId);
      return regionId === null ? [] : [{ kind: "panel", id: regionId }];
    }),
  );
}

function railRegionForPanelId(panelId: string): RailRegionId | null {
  const match = Object.entries(RAIL_REGION_BY_PANEL).find(
    ([candidate]) => candidate === panelId,
  );
  return match === undefined ? null : match[1];
}

/**
 * Every panel this build knows, exactly once, in the stored order, with a
 * panel the stored rail never named re-inserted beside its canonical
 * neighbours rather than appended - the rail's `mergeOrder`, with dividers
 * carried along.
 *
 * Dividers keep their positions and their ids; a duplicate id is dropped,
 * because one divider drawn twice is not a shape the rail has.
 */
export function normalizeRail(
  rail: ReadonlyArray<RailEntry>,
): ReadonlyArray<RailEntry> {
  const seenPanels = new Set<RailRegionId>();
  const seenDividers = new Set<string>();
  const entries: RailEntry[] = [];
  for (const entry of rail) {
    if (entry.kind === "divider") {
      if (!entry.id.startsWith(DIVIDER_ID_PREFIX)) continue;
      if (seenDividers.has(entry.id)) continue;
      seenDividers.add(entry.id);
      entries.push(entry);
      continue;
    }
    if (!RAIL_REGION_IDS.includes(entry.id)) continue;
    if (seenPanels.has(entry.id)) continue;
    seenPanels.add(entry.id);
    entries.push(entry);
  }
  for (const [index, regionId] of RAIL_REGION_IDS.entries()) {
    if (seenPanels.has(regionId)) continue;
    const precedingPanels = RAIL_REGION_IDS.slice(0, index).filter(
      (candidate) => seenPanels.has(candidate),
    );
    const anchor = precedingPanels.at(-1);
    const anchorIndex =
      anchor === undefined
        ? -1
        : entries.findIndex(
            (entry) => entry.kind === "panel" && entry.id === anchor,
          );
    entries.splice(anchorIndex + 1, 0, { kind: "panel", id: regionId });
    seenPanels.add(regionId);
  }
  return entries;
}
