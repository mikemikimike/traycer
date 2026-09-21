import type { LeftPanelGroup, LeftPanelId } from "@/lib/left-panel-ids";
import type { LayoutValues, RailVisibility } from "@/lib/layout/layout-values";
import type { RailRegionId } from "@/lib/layout/region-id";

/**
 * The sidebar rail's own shape: its entries, the bijection onto the sidebar's
 * panel ids, and the two conversions between the flat list and the grouped view
 * the sidebar draws.
 *
 * A leaf of the layout model, deliberately: nothing here names
 * `LayoutArrangement`, so `layout-arrangement.ts` can hold the rail among its
 * fields and its mutations among its writers without the two importing each
 * other. Reading the rail is this file's job; changing an arrangement is not.
 */

/**
 * The rail as one flat list of items (L-25): a panel, or a divider that ends
 * the group before it. Group objects are gone, and with them drop-onto-to-
 * merge - dragging a divider IS the grouping gesture, in the rail and in the
 * inspector list alike.
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

/**
 * Today's rail: Agents and Artifacts together, then every other panel on its
 * own - the shipped sidebar grouping, expressed as dividers.
 */
export const DEFAULT_RAIL: ReadonlyArray<RailEntry> = [
  { kind: "panel", id: "railAgents" },
  { kind: "panel", id: "railArtifacts" },
  { kind: "divider", id: railDividerId(1) },
  { kind: "panel", id: "railTerminals" },
  { kind: "divider", id: railDividerId(2) },
  { kind: "panel", id: "railBrowsers" },
  { kind: "divider", id: railDividerId(3) },
  { kind: "panel", id: "railGitDiff" },
  { kind: "divider", id: railDividerId(4) },
  { kind: "panel", id: "railPullRequests" },
  { kind: "divider", id: railDividerId(5) },
  { kind: "panel", id: "railFileTree" },
  { kind: "divider", id: railDividerId(6) },
  { kind: "panel", id: "railSharing" },
  { kind: "divider", id: railDividerId(7) },
  { kind: "panel", id: "railComments" },
];

/** The `dividerSeq` the shipped rail has already used up. */
export const DEFAULT_RAIL_DIVIDER_SEQ = 7;

/**
 * The rail reduced to the sidebar's group view, which is what the rail and the
 * panel renderers still read.
 *
 * Lossy in this direction, deliberately: an empty group - two dividers in a
 * row, or a divider at either end - produces nothing, so a divider a user
 * parked at the edge is inert rather than an invisible empty column.
 */
export function leftPanelGroupsFromRail(
  rail: ReadonlyArray<RailEntry>,
): ReadonlyArray<LeftPanelGroup> {
  const groups: LeftPanelGroup[] = [];
  let current: LeftPanelId[] = [];
  for (const entry of rail) {
    if (entry.kind === "divider") {
      if (current.length > 0) groups.push({ panelIds: current });
      current = [];
      continue;
    }
    current.push(PANEL_BY_RAIL_REGION[entry.id]);
  }
  if (current.length > 0) groups.push({ panelIds: current });
  return groups;
}

/**
 * The group view read back as a rail, with one divider BETWEEN groups and
 * none at either end - the other half of the round trip, and the reason the
 * edge dividers above are never re-created.
 */
export function railFromLeftPanelGroups(
  groups: ReadonlyArray<LeftPanelGroup>,
  seq: number,
): ReadonlyArray<RailEntry> {
  return railFromPanelIdGroups(
    groups.map((group) => group.panelIds),
    seq,
  );
}

/**
 * The same conversion from groups that are only known to be lists of strings -
 * the shape a persisted record from another store has (the L-49 carry). A
 * panel id this build does not know is dropped, and a group left empty by that
 * produces no divider.
 */
export function railFromPanelIdGroups(
  groups: ReadonlyArray<ReadonlyArray<string>>,
  seq: number,
): ReadonlyArray<RailEntry> {
  const rail: RailEntry[] = [];
  let nextSeq = seq;
  for (const panelIds of groups) {
    const regionIds = panelIds.flatMap((panelId): RailRegionId[] => {
      const regionId = railRegionForPanelId(panelId);
      return regionId === null ? [] : [regionId];
    });
    if (regionIds.length === 0) continue;
    if (rail.length > 0) {
      nextSeq += 1;
      rail.push({ kind: "divider", id: railDividerId(nextSeq) });
    }
    for (const regionId of regionIds) {
      rail.push({ kind: "panel", id: regionId });
    }
  }
  return normalizeRail(rail);
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
