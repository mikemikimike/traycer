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
 * The rail as one flat list of items (L-155, L-166): a panel, a divider, or a
 * stack link.
 *
 * Two independent notions, and they stay independent.
 *
 * A DIVIDER is a SPACER and nothing more - the user adds one, drags it and
 * removes it, and the rail draws it as a gap at rest (L-140). It groups
 * nothing, and the shipped rail ships with none.
 *
 * A STACK is a LINK between the two adjacent panels it sits between: those two
 * share the sidebar body, top and bottom, with a resize handle between them
 * (L-166). It is an entry rather than a flag on a panel so that both lists the
 * user reads - the inspector index and the Position list - get their row for
 * free, and so `moveCanvasOrderMember` keeps placing one member by id whatever
 * kind it is. Its ID names the pair, which is what makes the join drop the
 * moment either panel moves away: {@link normalizeRail} keeps a link only
 * while the two panels it names are still adjacent, in either order (G3).
 *
 * The rail DRAWS a stack as one view group (G3, as VS Code does): the top
 * panel's icon stands for both, and its name lists both.
 */
export type RailEntry =
  | { readonly kind: "panel"; readonly id: RailRegionId }
  | { readonly kind: "divider"; readonly id: string }
  | { readonly kind: "stack"; readonly id: string };

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
 * A stack link's id NAMES THE PAIR it joins, which is the whole of its
 * identity: it needs no counter, no persisted field and no re-minting, and a
 * duplicate is impossible because a panel appears in the rail once.
 *
 * Naming both halves rather than only the panel above is what makes "the link
 * is dropped when either panel moves away" (L-166) a fact the entry itself
 * carries. With only the top named, a rail whose BOTTOM panel was dragged
 * elsewhere leaves the link sitting between its old top and whatever moved up
 * behind it - two adjacent panels, so a positional reading would silently join
 * a pair the user never chose. The id says who the pair was, so that reading
 * cannot happen.
 */
const STACK_ID_PREFIX = "stack:";
const STACK_ID_SEPARATOR = "+";

export function railStackId(
  topRegionId: RailRegionId,
  bottomRegionId: RailRegionId,
): string {
  return `${STACK_ID_PREFIX}${topRegionId}${STACK_ID_SEPARATOR}${bottomRegionId}`;
}

/** The pair a link's id names, or `null` for an id this build cannot read. */
function railStackPair(
  id: string,
): readonly [RailRegionId, RailRegionId] | null {
  if (!id.startsWith(STACK_ID_PREFIX)) return null;
  const halves = id.slice(STACK_ID_PREFIX.length).split(STACK_ID_SEPARATOR);
  if (halves.length !== 2) return null;
  const top = RAIL_REGION_IDS.find((candidate) => candidate === halves[0]);
  const bottom = RAIL_REGION_IDS.find((candidate) => candidate === halves[1]);
  if (top === undefined || bottom === undefined || top === bottom) return null;
  return [top, bottom];
}

/**
 * The shipped rail: the nine panels in order, no dividers (L-155), and exactly
 * one stack - Agents with Artifacts (L-166).
 *
 * That pair is the one the shipped sidebar drew together, and the owner's
 * objection was to the seven default dividers rather than to the two panels
 * sharing the body.
 */
export const DEFAULT_RAIL: ReadonlyArray<RailEntry> = [
  { kind: "panel", id: "railAgents" },
  { kind: "stack", id: railStackId("railAgents", "railArtifacts") },
  ...RAIL_REGION_IDS.slice(1).map((id): RailEntry => ({ kind: "panel", id })),
];

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
    if (entry.kind !== "panel") return [];
    const panelId = PANEL_BY_RAIL_REGION[entry.id];
    return isVisible(panelId) ? [panelId] : [];
  });
}

/**
 * One thing a rail SURFACE draws, which is not one entry: a stack is one
 * group icon standing for two panels (G3), so the three surfaces that draw the rail - the
 * epic sidebar's column, the sample scene's copy of it and the preset card's
 * miniature - walk this rather than `arrangement.rail` directly.
 *
 * The visibility filter is applied HERE rather than by each surface, which is
 * what makes "a hidden panel drops out of its stack for display, and the
 * visible partner stands alone" one rule instead of three (L-166). The link
 * itself survives in the model: hiding a panel is not unstacking it, and
 * showing it again restores the pair.
 */
type RailDisplayEntry =
  | { readonly kind: "panel"; readonly id: RailRegionId }
  | { readonly kind: "divider"; readonly id: string }
  | {
      readonly kind: "stack";
      readonly id: string;
      readonly top: RailRegionId;
      readonly bottom: RailRegionId;
    };

export function railDisplayEntries(
  rail: ReadonlyArray<RailEntry>,
  isVisible: (regionId: RailRegionId) => boolean,
): ReadonlyArray<RailDisplayEntry> {
  const entries: RailDisplayEntry[] = [];
  for (const [index, entry] of rail.entries()) {
    if (entry.kind === "divider") {
      entries.push({ kind: "divider", id: entry.id });
      continue;
    }
    if (entry.kind === "stack") continue;
    if (!isVisible(entry.id)) continue;
    const link = rail.at(index + 1);
    const below = rail.at(index + 2);
    if (
      link !== undefined &&
      link.kind === "stack" &&
      below !== undefined &&
      below.kind === "panel" &&
      isVisible(below.id)
    ) {
      entries.push({
        kind: "stack",
        id: link.id,
        top: entry.id,
        bottom: below.id,
      });
      continue;
    }
    // The entry two above, where there is one: indexed rather than `at`, which
    // counts a negative index from the END of the rail.
    const above = index >= 2 ? rail[index - 2] : null;
    const drawnAbove =
      above !== null &&
      above.kind === "panel" &&
      rail[index - 1].kind === "stack" &&
      isVisible(above.id);
    // Already drawn as the bottom of the group above; a panel whose partner
    // is hidden falls through to here and stands alone.
    if (drawnAbove) continue;
    entries.push({ kind: "panel", id: entry.id });
  }
  return entries;
}

/**
 * The two panels the sidebar body draws together for a stacked panel, in rail
 * order, or just the one it draws when the panel stands alone.
 *
 * Read off {@link railDisplayEntries} rather than off the rail directly, so
 * the body and the rail cannot disagree about what a stack is right now: the
 * same hidden panel that leaves the group leaves the split.
 */
export function railStackMembersFor(
  rail: ReadonlyArray<RailEntry>,
  regionId: RailRegionId,
  isVisible: (candidate: RailRegionId) => boolean,
): ReadonlyArray<RailRegionId> {
  for (const entry of railDisplayEntries(rail, isVisible)) {
    if (
      entry.kind === "stack" &&
      (entry.top === regionId || entry.bottom === regionId)
    )
      return [entry.top, entry.bottom];
  }
  return [regionId];
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
  if (lastPanelIndex < 0) return rail.length;
  // Never between a stack's two panels: a divider there would break the join
  // the user made rather than space two icons apart, so when the last panel is
  // the BOTTOM of a pair the insert steps back over the link AND over the
  // panel above it, landing before the whole group (L-166).
  const link = lastPanelIndex >= 1 ? rail[lastPanelIndex - 1] : null;
  return link?.kind === "stack" ? lastPanelIndex - 2 : lastPanelIndex;
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
 *
 * Stack links are re-placed rather than carried (L-166). What a link IS is the
 * pair its id names, so the joins are read off the input first, the panels and
 * dividers are normalised without them, and a link is put back only where its
 * two panels are still adjacent, in either order. That is what makes every rule
 * about a stack a consequence of one pass rather than four separate guards: a
 * panel dragged away from its partner drops the link, a divider moved between
 * them drops it, a link naming a pair this build cannot read drops, a
 * duplicate is impossible because the id is the pair, and a run of three is
 * impossible because a panel already claimed by one link cannot be claimed by
 * a second. Where the stored entry happened to SIT says nothing, so a record
 * that misplaced it is repaired rather than losing a join the user made.
 */
export function normalizeRail(
  rail: ReadonlyArray<RailEntry>,
): ReadonlyArray<RailEntry> {
  return withRailStacks(normalizedPanelsAndDividers(rail), railJoins(rail));
}

/**
 * The pairs the input's links name, in the order the links appear.
 *
 * Read off the ID rather than off the neighbours, so a link only ever claims
 * the pair it was made for. A link whose id this build cannot read - a
 * hand-edited record, a panel the build has retired - names no pair and is
 * dropped.
 */
function railJoins(
  rail: ReadonlyArray<RailEntry>,
): ReadonlyArray<readonly [RailRegionId, RailRegionId]> {
  return rail.flatMap(
    (entry): ReadonlyArray<readonly [RailRegionId, RailRegionId]> => {
      if (entry.kind !== "stack") return [];
      const pair = railStackPair(entry.id);
      return pair === null ? [] : [pair];
    },
  );
}

function normalizedPanelsAndDividers(
  rail: ReadonlyArray<RailEntry>,
): ReadonlyArray<RailEntry> {
  const seenPanels = new Set<RailRegionId>();
  const seenDividers = new Set<string>();
  const entries: RailEntry[] = [];
  for (const entry of rail) {
    if (entry.kind === "stack") continue;
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

/**
 * The surviving joins put back as links, at most one per panel.
 *
 * A join survives its two panels trading places (G3): the pair is a view
 * group, and reordering the members within it is how the user picks which
 * panel's icon the rail shows. So adjacency is read in EITHER order, and the
 * link is re-minted for the order the panels now stand in.
 */
function withRailStacks(
  entries: ReadonlyArray<RailEntry>,
  joins: ReadonlyArray<readonly [RailRegionId, RailRegionId]>,
): ReadonlyArray<RailEntry> {
  const claimed = new Set<RailRegionId>();
  const linked = new Map<RailRegionId, RailRegionId>();
  const panelIndex = (regionId: RailRegionId): number =>
    entries.findIndex(
      (entry) => entry.kind === "panel" && entry.id === regionId,
    );
  for (const [first, second] of joins) {
    if (claimed.has(first) || claimed.has(second)) continue;
    const firstIndex = panelIndex(first);
    const secondIndex = panelIndex(second);
    if (firstIndex < 0 || Math.abs(firstIndex - secondIndex) !== 1) continue;
    const [top, bottom] =
      firstIndex < secondIndex ? [first, second] : [second, first];
    claimed.add(top);
    claimed.add(bottom);
    linked.set(top, bottom);
  }
  return entries.flatMap((entry): RailEntry[] => {
    if (entry.kind !== "panel") return [entry];
    const bottom = linked.get(entry.id);
    if (bottom === undefined) return [entry];
    return [entry, { kind: "stack", id: railStackId(entry.id, bottom) }];
  });
}
