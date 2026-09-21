import { rateLimitCapableProviderIdSchema } from "@traycer/protocol/host/rate-limit";
import { CONTEXT_USAGE_ROW_KEYS } from "@/lib/context-usage-rows";
import type { ContextBreakdownField } from "@/lib/layout/layout-values";
import {
  DEFAULT_RAIL,
  DEFAULT_RAIL_DIVIDER_SEQ,
  RAIL_REGION_IDS,
  railDividerId,
  type RailEntry,
} from "@/lib/layout/rail";
import type { DockRegionId, ToolbarRegionId } from "@/lib/layout/region-id";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * Where every region LIVES: order, side and host, and the per-provider picks
 * that are a choice about what is read rather than about how much of it shows.
 *
 * The counterpart of `layout-values.ts`, and the reason a preset cannot move
 * anything: nothing in this file is reachable from a `LayoutValues`, so a
 * density is density by construction (L-20).
 *
 * The shape, the shipped defaults, the accessors and the writers only. The
 * invariants an arrangement is held to and the read of a stored one are in
 * `arrangement-persist.ts`; the rail's own shape is `rail.ts`.
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
 * The order groups a CANVAS drag can reorder: the ones whose every member
 * draws its own element beside its siblings, which is what there is to pick up.
 *
 * The rail is one of them since L-115 (which supersedes L-68 and L-82 and
 * restores L-25): its icon column is the cluster, and every divider in
 * `arrangement.rail` is drawn as a real element there, so a drop between two
 * icons names the two entries it landed between and the boundary a panel
 * crossed is unambiguous.
 *
 * `usageProviders` is still the inspector list's alone: it is a list of
 * segments inside ONE region, so its members carry no identity of their own on
 * the canvas to place by.
 */
export type CanvasOrderGroupId =
  | "dock"
  | "toolbarLeft"
  | "toolbarRight"
  | "rail";

const CANVAS_ORDER_GROUP_IDS: ReadonlyArray<CanvasOrderGroupId> = [
  "dock",
  "toolbarLeft",
  "toolbarRight",
  "rail",
];

/**
 * Which of one provider's limits its usage segment draws.
 *
 * `limitKeys` are explicit picks by `windowKey`, and an EMPTY list is
 * Automatic - the tightest limit at the moment of drawing, which can name a
 * different window from one reading to the next. The two modes are exclusive
 * by construction, so there is one field and not two: a stored `automatic`
 * boolean beside the list was a second representation of `limitKeys.length
 * === 0`, which is how two fields for one fact come to disagree (R1-15).
 * Nothing draws nothing - a provider the user wants gone has its own Shown
 * switch.
 */
export interface StatusBarProviderLimitSelection {
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

/**
 * Today's dock order, top to bottom.
 *
 * Message queue and Todo OPEN the list because that is where `ChatLowerDock`
 * already draws them - the joined frame is Queue, then Todo, then the three
 * rows that were reorderable before L-142 made all five so. A default is what
 * a user who never opens the editor sees, so it has to be today's frame rather
 * than the order the two happened to be added in.
 *
 * `mergeOrder` reads this as the canonical sequence. Neither of them has a
 * canonical predecessor, so a dock order written before they existed
 * rehydrates with the two at the FRONT, ahead of whatever arrangement the user
 * had already made of the other three - which is both today's frame and the
 * same neighbour rule every stored order in this app is read by.
 */
export const DEFAULT_DOCK_ORDER: ReadonlyArray<DockRegionId> = [
  "queue",
  "todo",
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
export const TOOLBAR_REGION_IDS: ReadonlyArray<ToolbarRegionId> = [
  "attachImage",
  "access",
  "model",
  "mic",
];

export const DEFAULT_TOOLBAR_LEFT: ReadonlyArray<ToolbarRegionId> = [
  "attachImage",
  "access",
];

/** `model` is always here: the picker anchors the footer controls. */
export const DEFAULT_TOOLBAR_RIGHT: ReadonlyArray<ToolbarRegionId> = [
  "model",
  "mic",
];

/**
 * Which canvas order group a region's element belongs to, or `null` for a
 * region the canvas cannot reorder.
 *
 * Membership is a MODEL fact rather than a registry one, and it is static:
 * `normalizeArrangement` puts a toolbar region found in the wrong cluster back
 * where it belongs, so a dock region is one because its id is a
 * `DockRegionId`, and the default lists are where that is written down.
 *
 * It lives here rather than being read off the region registry's own
 * `position-order` row for a second reason, which is load order:
 * `useLayoutRegion` stamps the attribute this answers, and the registry
 * reaches the app's real leaves through `region-depiction.tsx` - leaves that
 * call `useLayoutRegion`. Asking the registry from the hook would close that
 * circle and leave the depictions half-initialised.
 */
export function canvasOrderGroupForRegion(
  regionId: string,
): CanvasOrderGroupId | null {
  if (DEFAULT_DOCK_ORDER.some((id) => id === regionId)) return "dock";
  if (DEFAULT_TOOLBAR_LEFT.some((id) => id === regionId)) return "toolbarLeft";
  if (DEFAULT_TOOLBAR_RIGHT.some((id) => id === regionId))
    return "toolbarRight";
  if (RAIL_REGION_IDS.some((id) => id === regionId)) return "rail";
  return null;
}

/**
 * The same group read back off an element, for the half of a rail cluster that
 * is NOT a region: a divider is a member of the rail's order with a member id
 * and no region id, so the group a press belongs to is the one stamped on the
 * element rather than one looked up from a region (L-115).
 */
export function canvasOrderGroupOf(value: string): CanvasOrderGroupId | null {
  return CANVAS_ORDER_GROUP_IDS.find((id) => id === value) ?? null;
}

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
  dividerSeq: DEFAULT_RAIL_DIVIDER_SEQ,
};

/** What a provider draws until told otherwise: its tightest limit, and only that. */
export const AUTOMATIC_LIMIT_SELECTION: StatusBarProviderLimitSelection = {
  limitKeys: [],
};

/**
 * Whether a stored selection says anything the DEFAULT does not.
 *
 * The one definition of "this provider is on Automatic", read by the writer
 * that refuses to store it (`provider-level.tsx`) and by the predicate that
 * decides whether a provider counts as changed (`layout-diff.ts`). Both used
 * to answer from PRESENCE, which made a return to Automatic a permanent mark
 * on a layout byte-identical to the shipped one (R1-03).
 */
export function isAutomaticLimitSelection(
  selection: StatusBarProviderLimitSelection,
): boolean {
  return selection.limitKeys.length === 0;
}

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

// ── Reordering ──────────────────────────────────────────────────────────────

/**
 * One item taken out of a list and put back at another index, clamped.
 *
 * The single reordering primitive: a keyboard nudge, a pointer drop in the
 * inspector's list and a canvas drop all reduce to it, so "what does moving an
 * item do" has one answer and one set of tests.
 */
export function movedWithin<T>(
  list: ReadonlyArray<T>,
  fromIndex: number,
  toIndex: number,
): ReadonlyArray<T> {
  const item = list[fromIndex];
  if (item === undefined) return list;
  const remaining = list.filter((_entry, index) => index !== fromIndex);
  const insertAt = Math.min(Math.max(toIndex, 0), remaining.length);
  return [...remaining.slice(0, insertAt), item, ...remaining.slice(insertAt)];
}

/**
 * One canvas drop written back into a group's FULL order (4.7).
 *
 * Stated as "`fromId` lands on this side of `toId`" rather than as a pair of
 * indices, because the canvas shows only the members that are currently drawn
 * and an index into what it showed is not an index into what is stored
 * (G3-01). Placing by id needs no correspondence between the two orders at
 * all: the member the user had hold of is the one that moves, and every other
 * member - drawn or not - keeps its place relative to its neighbours.
 *
 * In the rail the member may be a DIVIDER rather than a panel, which is how a
 * group boundary is moved, split and merged on the canvas (L-25, L-115): the
 * id is the entry's, and both kinds place the same way.
 */
export function moveCanvasOrderMember(input: {
  readonly arrangement: LayoutArrangement;
  readonly group: CanvasOrderGroupId;
  /** The member that was picked up, by the id off the element in hand. */
  readonly fromId: string;
  /** The member it was dropped across. */
  readonly toId: string;
  /** Which side of `toId` it landed on. */
  readonly placeAfter: boolean;
}): LayoutArrangement {
  const { arrangement, group } = input;
  switch (group) {
    case "dock":
      return {
        ...arrangement,
        dock: placedBeside(arrangement.dock, sameId, input),
      };
    case "toolbarLeft":
      return {
        ...arrangement,
        toolbarLeft: placedBeside(arrangement.toolbarLeft, sameId, input),
      };
    case "toolbarRight":
      return {
        ...arrangement,
        toolbarRight: placedBeside(arrangement.toolbarRight, sameId, input),
      };
    case "rail":
      return {
        ...arrangement,
        rail: placedBeside(arrangement.rail, entryId, input),
      };
  }
}

/** Where a member was picked up and where it was put down. */
interface CanvasOrderDrop {
  readonly fromId: string;
  readonly toId: string;
  readonly placeAfter: boolean;
}

/** A list of ids is its own identity; the rail's entries carry theirs. */
function sameId(id: string): string {
  return id;
}

function entryId(entry: RailEntry): string {
  return entry.id;
}

/**
 * One member taken out of the stored list and put back beside another.
 *
 * The ids arrive as strings off the DOM and are only ever used to SELECT from
 * the stored list, never to build one, so an id this build does not know moves
 * nothing rather than narrowing something away (G1-23). The member itself is
 * whatever the list holds - a region id in three of the four groups, a rail
 * entry in the fourth - which is why the id is read through a function rather
 * than being the item.
 */
function placedBeside<T>(
  full: ReadonlyArray<T>,
  idOf: (item: T) => string,
  drop: CanvasOrderDrop,
): ReadonlyArray<T> {
  const { fromId, toId, placeAfter } = drop;
  const moved = full.find((item) => idOf(item) === fromId);
  if (moved === undefined || fromId === toId) return full;
  const remaining = full.filter((item) => item !== moved);
  const anchor = remaining.findIndex((item) => idOf(item) === toId);
  if (anchor < 0) return full;
  const insertAt = placeAfter ? anchor + 1 : anchor;
  return [...remaining.slice(0, insertAt), moved, ...remaining.slice(insertAt)];
}

// ── The rail's writers ──────────────────────────────────────────────────────
// Arrangement in, arrangement out. The rail's own shape is `rail.ts`, which
// knows nothing of an arrangement; these are the three gestures that put a new
// rail back beside the rest of one, and they live here for that reason.

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
  return {
    ...arrangement,
    rail: movedWithin(arrangement.rail, fromIndex, toIndex),
  };
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
    { kind: "divider" as const, id: railDividerId(dividerSeq) },
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
