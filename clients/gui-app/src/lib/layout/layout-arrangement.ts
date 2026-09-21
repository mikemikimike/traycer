import { rateLimitCapableProviderIdSchema } from "@traycer/protocol/host/rate-limit";
import { CONTEXT_USAGE_ROW_KEYS } from "@/components/chat/context-usage";
import {
  sameFieldList,
  type ContextBreakdownField,
  type LayoutValues,
  type RailVisibility,
} from "@/lib/layout/layout-values";
import type {
  DockRegionId,
  RailRegionId,
  ToolbarRegionId,
} from "@/lib/layout/region-id";
import { mergeOrder } from "@/lib/order-merge";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import type {
  LeftPanelGroup,
  LeftPanelId,
} from "@/stores/epics/left-panel-store";

/**
 * Where every region LIVES: order, side and host, and the per-provider picks
 * that are a choice about what is read rather than about how much of it shows.
 *
 * The counterpart of `layout-values.ts`, and the reason a preset cannot move
 * anything: nothing in this file is reachable from a `LayoutValues`, so a
 * density is density by construction (L-20).
 */

/** Which surface hosts the usage reading. */
export type UsageHost = "status-bar" | "header";

/** Which end of its surface an edge-anchored region sits at. */
export type EdgeSide = "left" | "right";

/** Every list a drag can reorder. */
export type OrderGroupId =
  | "dock"
  | "toolbarLeft"
  | "toolbarRight"
  | "rail"
  | "usageProviders";

export const ORDER_GROUP_IDS: ReadonlyArray<OrderGroupId> = [
  "dock",
  "toolbarLeft",
  "toolbarRight",
  "rail",
  "usageProviders",
];

/**
 * Which of one provider's limits its usage segment draws.
 *
 * `automatic` is the tightest limit at the moment of drawing, so it can name a
 * different window from one reading to the next; `limitKeys` are explicit
 * picks by `windowKey`. At least one of the two is always on - a selection
 * with neither would draw nothing, which is what the provider's own Shown
 * switch is for.
 */
export interface StatusBarProviderLimitSelection {
  readonly automatic: boolean;
  readonly limitKeys: ReadonlyArray<string>;
}

/**
 * Every configured provider's selection. A provider with no entry has never
 * been configured, which {@link statusBarProviderLimitSelection} reads as the
 * automatic default.
 */
export type StatusBarProviderLimits = Readonly<
  Partial<Record<RateLimitProviderId, StatusBarProviderLimitSelection>>
>;

/**
 * The accounts one provider's segments describe, on one host: profile ids, with
 * `null` standing for the provider's ambient login. A provider with no entry
 * has nothing checked.
 */
export type StatusBarHostShownProfiles = Readonly<
  Partial<Record<RateLimitProviderId, ReadonlyArray<string | null>>>
>;

/**
 * Per host, then per provider. Keyed by `hostId` because a profile id names a
 * credential on ONE machine - the same id on another host is a different
 * account, or nothing at all.
 */
export type StatusBarShownProfiles = Readonly<
  Record<string, StatusBarHostShownProfiles>
>;

/**
 * The rail as one flat list of items (L-25): a panel, or a divider that ends
 * the group before it. Group objects are gone, and with them drop-onto-to-
 * merge - dragging a divider IS the grouping gesture, in the rail and in the
 * inspector list alike.
 */
export type RailEntry =
  | { readonly kind: "panel"; readonly id: RailRegionId }
  | { readonly kind: "divider"; readonly id: string };

export interface LayoutArrangement {
  readonly dock: ReadonlyArray<DockRegionId>;
  readonly toolbarLeft: ReadonlyArray<ToolbarRegionId>;
  readonly toolbarRight: ReadonlyArray<ToolbarRegionId>;
  readonly rail: ReadonlyArray<RailEntry>;
  readonly usageProviders: ReadonlyArray<RateLimitProviderId>;
  readonly hiddenProviders: ReadonlyArray<RateLimitProviderId>;
  readonly providerLimits: StatusBarProviderLimits;
  readonly shownProfiles: StatusBarShownProfiles;
  readonly usageHost: UsageHost;
  readonly resourceSide: EdgeSide;
  readonly minimapSide: EdgeSide;
  readonly pinnedContextFieldOrder: ReadonlyArray<ContextBreakdownField>;
  /**
   * Whether the status bar is drawn on a mobile VIEWPORT, where the shell
   * otherwise withholds it whatever `usageHost` says (L-51). Here rather than
   * in a region's value bag because it decides whether a SURFACE exists.
   */
  readonly mobileFooter: boolean;
  /** Only ever increases, so a divider id is never reused. */
  readonly dividerSeq: number;
}

/** Every provider that reports account rate limits, in the strip's own order. */
export const USAGE_PROVIDER_IDS: ReadonlyArray<RateLimitProviderId> =
  rateLimitCapableProviderIdSchema.options;

/** Today's dock order, top to bottom. */
export const DEFAULT_DOCK_ORDER: ReadonlyArray<DockRegionId> = [
  "changedFiles",
  "runningAgents",
  "background",
];

/**
 * Every toolbar region in VISUAL READING ORDER across both clusters, which is
 * what `mergeOrder` needs as its canonical sequence: a region that has to be
 * re-inserted lands beside the neighbours it renders beside, whichever cluster
 * it belongs to.
 */
const TOOLBAR_REGION_IDS: ReadonlyArray<ToolbarRegionId> = [
  "attachImage",
  "access",
  "agent",
  "model",
  "mic",
];

export const DEFAULT_TOOLBAR_LEFT: ReadonlyArray<ToolbarRegionId> = [
  "attachImage",
  "access",
  "agent",
];

/** `model` is always here: the picker anchors the footer controls. */
export const DEFAULT_TOOLBAR_RIGHT: ReadonlyArray<ToolbarRegionId> = [
  "model",
  "mic",
];

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

function dividerId(seq: number): string {
  return `${DIVIDER_ID_PREFIX}${String(seq)}`;
}

/**
 * Today's rail: Agents and Artifacts together, then every other panel on its
 * own - the shipped sidebar grouping, expressed as dividers.
 */
export const DEFAULT_RAIL: ReadonlyArray<RailEntry> = [
  { kind: "panel", id: "railAgents" },
  { kind: "panel", id: "railArtifacts" },
  { kind: "divider", id: dividerId(1) },
  { kind: "panel", id: "railTerminals" },
  { kind: "divider", id: dividerId(2) },
  { kind: "panel", id: "railBrowsers" },
  { kind: "divider", id: dividerId(3) },
  { kind: "panel", id: "railGitDiff" },
  { kind: "divider", id: dividerId(4) },
  { kind: "panel", id: "railPullRequests" },
  { kind: "divider", id: dividerId(5) },
  { kind: "panel", id: "railFileTree" },
  { kind: "divider", id: dividerId(6) },
  { kind: "panel", id: "railSharing" },
  { kind: "divider", id: dividerId(7) },
  { kind: "panel", id: "railComments" },
];

export const DEFAULT_ARRANGEMENT: LayoutArrangement = {
  dock: DEFAULT_DOCK_ORDER,
  toolbarLeft: DEFAULT_TOOLBAR_LEFT,
  toolbarRight: DEFAULT_TOOLBAR_RIGHT,
  rail: DEFAULT_RAIL,
  usageProviders: USAGE_PROVIDER_IDS,
  hiddenProviders: [],
  providerLimits: {},
  shownProfiles: {},
  usageHost: "status-bar",
  resourceSide: "right",
  minimapSide: "right",
  pinnedContextFieldOrder: CONTEXT_USAGE_ROW_KEYS,
  mobileFooter: false,
  dividerSeq: 7,
};

/** What a provider draws until told otherwise: its tightest limit, and only that. */
export const AUTOMATIC_LIMIT_SELECTION: StatusBarProviderLimitSelection = {
  automatic: true,
  limitKeys: [],
};

/**
 * The selection one provider is on, with the default standing in for a provider
 * that has never been configured - which is how a provider connected later
 * shows its tightest limit without a visit to the editor.
 */
export function statusBarProviderLimitSelection(
  providerLimits: StatusBarProviderLimits,
  providerId: RateLimitProviderId,
): StatusBarProviderLimitSelection {
  return providerLimits[providerId] ?? AUTOMATIC_LIMIT_SELECTION;
}

/** One shared empty list, so an unchecked provider never allocates. */
const NO_SHOWN_PROFILE_IDS: ReadonlyArray<string | null> = [];

/**
 * The checked accounts one provider has on one host, or the empty list. The one
 * read path, so nothing else has to know the map is two levels deep.
 */
export function statusBarShownProfileIds(
  shownProfiles: StatusBarShownProfiles,
  hostId: string | null,
  providerId: RateLimitProviderId,
): ReadonlyArray<string | null> {
  if (hostId === null) return NO_SHOWN_PROFILE_IDS;
  return shownProfiles[hostId]?.[providerId] ?? NO_SHOWN_PROFILE_IDS;
}

/**
 * Whether the status bar strip is on screen: the ONE answer to that question,
 * read by the shell that mounts it and by every control that only makes sense
 * while it is mounted.
 *
 * A mobile VIEWPORT, not a mobile build: a narrow desktop window behaves the
 * same way. Mobile ignores `usageHost` entirely and answers with `mobileFooter`
 * (L-51), which is off by default - `usageHost` names which of two surfaces
 * hosts the usage reading, and on a phone that question has no second answer,
 * since the mobile header keeps both controls whatever the strip does.
 */
export function statusBarShown(
  arrangement: LayoutArrangement,
  isMobileViewport: boolean,
): boolean {
  return isMobileViewport
    ? arrangement.mobileFooter
    : arrangement.usageHost === "status-bar";
}

// ── The rail ────────────────────────────────────────────────────────────────

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
      rail.push({ kind: "divider", id: dividerId(nextSeq) });
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

/**
 * One entry dragged to a new index, panels and dividers alike: moving a
 * divider is what splits and merges groups, and moving a panel past one is
 * what changes which group it is in.
 */
export function moveRailEntry(
  arrangement: LayoutArrangement,
  entryId: string,
  toIndex: number,
): LayoutArrangement {
  const fromIndex = arrangement.rail.findIndex((entry) => entry.id === entryId);
  if (fromIndex < 0) return arrangement;
  const remaining = arrangement.rail.filter(
    (_entry, index) => index !== fromIndex,
  );
  const insertAt = Math.min(Math.max(toIndex, 0), remaining.length);
  const rail = [
    ...remaining.slice(0, insertAt),
    arrangement.rail[fromIndex],
    ...remaining.slice(insertAt),
  ];
  return { ...arrangement, rail };
}

/** A new group boundary at `index`, on an id no divider has held before. */
export function insertRailDivider(
  arrangement: LayoutArrangement,
  index: number,
): LayoutArrangement {
  const dividerSeq = arrangement.dividerSeq + 1;
  const insertAt = Math.min(Math.max(index, 0), arrangement.rail.length);
  const rail = [
    ...arrangement.rail.slice(0, insertAt),
    { kind: "divider" as const, id: dividerId(dividerSeq) },
    ...arrangement.rail.slice(insertAt),
  ];
  return { ...arrangement, rail, dividerSeq };
}

/** Two groups merged: the boundary between them goes, the panels stay put. */
export function removeRailDivider(
  arrangement: LayoutArrangement,
  entryId: string,
): LayoutArrangement {
  const rail = arrangement.rail.filter(
    (entry) => !(entry.kind === "divider" && entry.id === entryId),
  );
  if (rail.length === arrangement.rail.length) return arrangement;
  return { ...arrangement, rail };
}

// ── Resolution ──────────────────────────────────────────────────────────────

/**
 * An arrangement held to every invariant its type states: each toolbar region
 * in exactly one cluster with `model` on the right, every dock row and every
 * provider present once, every panel in the rail once, and a `dividerSeq`
 * that has not fallen behind the ids the rail is already using.
 *
 * Run on the WRITE as well as on rehydration, because a drag that lands
 * impossibly is repaired where a persisted blob would be rather than only on
 * the next start.
 *
 * Every field it did not have to change keeps its INPUT identity, and an
 * arrangement it changed nothing about is returned as itself. Identity is the
 * only thing a selector subscribed to one arrangement field compares, so
 * rebuilding the arrays on every call made a no-op write - and, once ticket
 * 09's drag loop writes per frame, every frame of a drag - re-render the whole
 * status bar (G1-14).
 */
export function normalizeArrangement(
  arrangement: LayoutArrangement,
): LayoutArrangement {
  const toolbar = resolveToolbarClusters(
    arrangement.toolbarLeft,
    arrangement.toolbarRight,
  );
  const rail = keptEntries(arrangement.rail, normalizeRail(arrangement.rail));
  const next: LayoutArrangement = {
    ...arrangement,
    dock: keptOrder(
      arrangement.dock,
      mergeOrder(arrangement.dock, DEFAULT_DOCK_ORDER),
    ),
    toolbarLeft: keptOrder(arrangement.toolbarLeft, toolbar.left),
    toolbarRight: keptOrder(arrangement.toolbarRight, toolbar.right),
    rail,
    usageProviders: keptOrder(
      arrangement.usageProviders,
      mergeOrder(arrangement.usageProviders, USAGE_PROVIDER_IDS),
    ),
    pinnedContextFieldOrder: keptOrder(
      arrangement.pinnedContextFieldOrder,
      mergeOrder(arrangement.pinnedContextFieldOrder, CONTEXT_USAGE_ROW_KEYS),
    ),
    dividerSeq: Math.max(arrangement.dividerSeq, highestDividerSeq(rail)),
  };
  return sameArrangement(arrangement, next) ? arrangement : next;
}

/** The stored list when normalising did not move anything, so its identity survives. */
function keptOrder<Id extends string>(
  stored: ReadonlyArray<Id>,
  normalized: ReadonlyArray<Id>,
): ReadonlyArray<Id> {
  return sameFieldList(stored, normalized) ? stored : normalized;
}

/** {@link keptOrder} for the rail, which is entries rather than ids. */
function keptEntries(
  stored: ReadonlyArray<RailEntry>,
  normalized: ReadonlyArray<RailEntry>,
): ReadonlyArray<RailEntry> {
  const same =
    stored.length === normalized.length &&
    stored.every(
      (entry, index) =>
        entry.kind === normalized[index].kind &&
        entry.id === normalized[index].id,
    );
  return same ? stored : normalized;
}

/**
 * Whether normalising left every field exactly as it found it. Reference
 * equality throughout, because each field above already reuses the input's
 * identity when it did not change it.
 */
function sameArrangement(
  left: LayoutArrangement,
  right: LayoutArrangement,
): boolean {
  return (
    left.dock === right.dock &&
    left.toolbarLeft === right.toolbarLeft &&
    left.toolbarRight === right.toolbarRight &&
    left.rail === right.rail &&
    left.usageProviders === right.usageProviders &&
    left.pinnedContextFieldOrder === right.pinnedContextFieldOrder &&
    left.hiddenProviders === right.hiddenProviders &&
    left.providerLimits === right.providerLimits &&
    left.shownProfiles === right.shownProfiles &&
    left.usageHost === right.usageHost &&
    left.resourceSide === right.resourceSide &&
    left.minimapSide === right.minimapSide &&
    left.mobileFooter === right.mobileFooter &&
    left.dividerSeq === right.dividerSeq
  );
}

/**
 * The arrangement as some build of the app wrote it, field by field against
 * the defaults - a hand-edited `usageHost` would otherwise mount neither
 * surface, and a stale panel id would ask the rail for an icon it has no case
 * for.
 */
export function resolvePersistedArrangement(value: unknown): LayoutArrangement {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  return normalizeArrangement({
    dock: persistedIds(stored.dock, DEFAULT_DOCK_ORDER),
    // Each cluster is read against EVERY toolbar region, so a region the user
    // moved across stays where they put it, and the two are reconciled by
    // `normalizeArrangement` rather than by this read.
    toolbarLeft: persistedCluster(stored.toolbarLeft, DEFAULT_TOOLBAR_LEFT),
    toolbarRight: persistedCluster(stored.toolbarRight, DEFAULT_TOOLBAR_RIGHT),
    rail: persistedRail(stored.rail),
    usageProviders: persistedProviderIds(stored.usageProviders),
    hiddenProviders: persistedProviderIds(stored.hiddenProviders),
    providerLimits: persistedProviderLimits(stored.providerLimits),
    shownProfiles: persistedShownProfiles(stored.shownProfiles),
    usageHost:
      stored.usageHost === "header" || stored.usageHost === "status-bar"
        ? stored.usageHost
        : DEFAULT_ARRANGEMENT.usageHost,
    resourceSide: persistedSide(
      stored.resourceSide,
      DEFAULT_ARRANGEMENT.resourceSide,
    ),
    minimapSide: persistedSide(
      stored.minimapSide,
      DEFAULT_ARRANGEMENT.minimapSide,
    ),
    pinnedContextFieldOrder: persistedIds(
      stored.pinnedContextFieldOrder,
      CONTEXT_USAGE_ROW_KEYS,
    ),
    mobileFooter:
      typeof stored.mobileFooter === "boolean"
        ? stored.mobileFooter
        : DEFAULT_ARRANGEMENT.mobileFooter,
    dividerSeq:
      typeof stored.dividerSeq === "number" &&
      Number.isFinite(stored.dividerSeq)
        ? Math.max(0, Math.floor(stored.dividerSeq))
        : 0,
  });
}

/**
 * Both clusters at once, holding the two invariants the type states: every
 * toolbar region exactly once across them, and `model` on the right.
 *
 * `model` is STRIPPED from the left rather than swapped in place, which leaves
 * it missing and therefore re-inserted into the right at its canonical
 * position - the same path a genuinely absent region takes, so there is one
 * rule to reason about rather than two.
 */
function resolveToolbarClusters(
  storedLeft: ReadonlyArray<ToolbarRegionId>,
  storedRight: ReadonlyArray<ToolbarRegionId>,
): {
  readonly left: ReadonlyArray<ToolbarRegionId>;
  readonly right: ReadonlyArray<ToolbarRegionId>;
} {
  const claimed = new Set<ToolbarRegionId>();
  const left = claimCluster(storedLeft, claimed).filter((id) => id !== "model");
  const right = claimCluster(storedRight, claimed);
  const present = new Set([...left, ...right]);
  const missing = TOOLBAR_REGION_IDS.filter((id) => !present.has(id));
  return {
    left: resolveToolbarSide(left, missing, DEFAULT_TOOLBAR_LEFT),
    right: resolveToolbarSide(right, missing, DEFAULT_TOOLBAR_RIGHT),
  };
}

function claimCluster(
  stored: ReadonlyArray<ToolbarRegionId>,
  claimed: Set<ToolbarRegionId>,
): ReadonlyArray<ToolbarRegionId> {
  const items: ToolbarRegionId[] = [];
  for (const id of stored) {
    if (claimed.has(id)) continue;
    claimed.add(id);
    items.push(id);
  }
  return items;
}

/**
 * One cluster, with the regions that belong here and are missing entirely
 * merged back in at their canonical positions.
 *
 * The canonical sequence is built PER CLUSTER and per resolve: using the
 * default cluster list directly would put back a region the user deliberately
 * moved to the other side.
 */
function resolveToolbarSide(
  stored: ReadonlyArray<ToolbarRegionId>,
  missing: ReadonlyArray<ToolbarRegionId>,
  defaults: ReadonlyArray<ToolbarRegionId>,
): ReadonlyArray<ToolbarRegionId> {
  const canonical = TOOLBAR_REGION_IDS.filter(
    (id) =>
      stored.includes(id) || (missing.includes(id) && defaults.includes(id)),
  );
  return mergeOrder(stored, canonical);
}

/** The highest number any divider in a rail is already using. */
function highestDividerSeq(rail: ReadonlyArray<RailEntry>): number {
  return rail.reduce((highest, entry) => {
    if (entry.kind !== "divider") return highest;
    const seq = Number(entry.id.slice(DIVIDER_ID_PREFIX.length));
    return Number.isFinite(seq) ? Math.max(highest, seq) : highest;
  }, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * A stored order reduced to ids this build knows. `mergeOrder` in
 * `normalizeArrangement` does the re-insertion, so this is only the read.
 */
function persistedIds<Id extends string>(
  value: unknown,
  canonical: ReadonlyArray<Id>,
): ReadonlyArray<Id> {
  return Array.isArray(value) ? mergeOrder(value, canonical) : canonical;
}

/**
 * One toolbar cluster as it was stored: known regions, in stored order, with
 * no re-insertion - a region missing from BOTH clusters is put back by
 * `normalizeArrangement`, which is the only place that can see both.
 */
function persistedCluster(
  value: unknown,
  fallback: ReadonlyArray<ToolbarRegionId>,
): ReadonlyArray<ToolbarRegionId> {
  if (!Array.isArray(value)) return fallback;
  const ids: ToolbarRegionId[] = [];
  for (const entry of value) {
    const id = TOOLBAR_REGION_IDS.find((candidate) => candidate === entry);
    if (id === undefined || ids.includes(id)) continue;
    ids.push(id);
  }
  return ids;
}

function persistedProviderIds(
  value: unknown,
): ReadonlyArray<RateLimitProviderId> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RateLimitProviderId[] => {
    const parsed = rateLimitCapableProviderIdSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** Opaque window keys: only non-strings and duplicates can be judged here. */
function persistedWindowKeys(value: unknown): ReadonlyArray<string> {
  if (!Array.isArray(value)) return [];
  const keys = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.length > 0,
  );
  return [...new Set(keys)];
}

/**
 * One provider's picks. A shape hand-edited down to nothing drawable falls
 * back to the default rather than to an empty segment.
 */
function persistedLimitSelection(
  value: unknown,
): StatusBarProviderLimitSelection {
  const stored: Record<string, unknown> = isRecord(value) ? value : {};
  const selection: StatusBarProviderLimitSelection = {
    automatic:
      typeof stored.automatic === "boolean"
        ? stored.automatic
        : AUTOMATIC_LIMIT_SELECTION.automatic,
    limitKeys: persistedWindowKeys(stored.limitKeys),
  };
  return selection.automatic || selection.limitKeys.length > 0
    ? selection
    : AUTOMATIC_LIMIT_SELECTION;
}

function persistedProviderLimits(value: unknown): StatusBarProviderLimits {
  if (!isRecord(value)) return {};
  const limits: Partial<
    Record<RateLimitProviderId, StatusBarProviderLimitSelection>
  > = {};
  for (const [key, selection] of Object.entries(value)) {
    const providerId = rateLimitCapableProviderIdSchema.safeParse(key);
    if (!providerId.success) continue;
    limits[providerId.data] = persistedLimitSelection(selection);
  }
  return limits;
}

/** Profile ids are opaque strings and `null` is the ambient login. */
function persistedProfileIds(value: unknown): ReadonlyArray<string | null> {
  if (!Array.isArray(value)) return [];
  const ids = value.filter(
    (entry): entry is string | null =>
      entry === null || (typeof entry === "string" && entry.length > 0),
  );
  return [...new Set(ids)];
}

/**
 * The whole two-level map, entry by entry: a host key is any non-empty string,
 * a provider key has to be one the build knows, and an entry that resolves to
 * nothing checked is dropped - absent and empty mean the same thing at read
 * time, and only one of them should be able to exist.
 */
function persistedShownProfiles(value: unknown): StatusBarShownProfiles {
  if (!isRecord(value)) return {};
  const shownProfiles: Record<
    string,
    Partial<Record<RateLimitProviderId, ReadonlyArray<string | null>>>
  > = {};
  for (const [hostId, hostValue] of Object.entries(value)) {
    if (hostId.length === 0 || !isRecord(hostValue)) continue;
    const hostShown: Partial<
      Record<RateLimitProviderId, ReadonlyArray<string | null>>
    > = {};
    for (const [key, ids] of Object.entries(hostValue)) {
      const providerId = rateLimitCapableProviderIdSchema.safeParse(key);
      if (!providerId.success) continue;
      const profileIds = persistedProfileIds(ids);
      if (profileIds.length === 0) continue;
      hostShown[providerId.data] = profileIds;
    }
    if (Object.keys(hostShown).length === 0) continue;
    shownProfiles[hostId] = hostShown;
  }
  return shownProfiles;
}

function persistedSide(value: unknown, fallback: EdgeSide): EdgeSide {
  return value === "left" || value === "right" ? value : fallback;
}

/**
 * The rail as it was stored. Structure only: `normalizeRail` decides which
 * panels are missing and where they land.
 *
 * A stored list that survives as NOTHING - an empty array, or nine entries
 * this build has no case for - falls back to the shipped rail rather than to
 * `normalizeRail`'s answer for `[]`, which is all nine panels with no dividers
 * at all and is not a grouping anybody chose (G1-22).
 */
function persistedRail(value: unknown): ReadonlyArray<RailEntry> {
  if (!Array.isArray(value)) return DEFAULT_RAIL;
  const entries = readRailEntries(value);
  return entries.length === 0 ? DEFAULT_RAIL : entries;
}

function readRailEntries(
  value: ReadonlyArray<unknown>,
): ReadonlyArray<RailEntry> {
  return value.flatMap((entry): RailEntry[] => {
    if (!isRecord(entry) || typeof entry.id !== "string") return [];
    if (entry.kind === "divider") {
      return [{ kind: "divider", id: entry.id }];
    }
    if (entry.kind !== "panel") return [];
    const regionId = RAIL_REGION_IDS.find(
      (candidate) => candidate === entry.id,
    );
    return regionId === undefined ? [] : [{ kind: "panel", id: regionId }];
  });
}
