import { rateLimitCapableProviderIdSchema } from "@traycer/protocol/host/rate-limit";
import { CONTEXT_USAGE_ROW_KEYS } from "@/lib/context-usage-rows";
import type { ContextBreakdownField } from "@/lib/layout/layout-values";
import {
  DEFAULT_RAIL,
  DEFAULT_RAIL_DIVIDER_SEQ,
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
 * The other two are reordered in the inspector's list only. `usageProviders`
 * is a list of segments inside one region, so its members carry no region
 * identity of their own on the canvas; and the sidebar rail draws one button
 * per GROUP rather than per panel and draws no divider at all, so a drop
 * between two icons could not say which group the panel landed in (L-25's
 * dividers are items in the list, where they are visible).
 */
export type CanvasOrderGroupId = "dock" | "toolbarLeft" | "toolbarRight";

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
export const TOOLBAR_REGION_IDS: ReadonlyArray<ToolbarRegionId> = [
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
  return null;
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
 * The canvas shows only the members that are currently drawn - a hidden region
 * has no element - so a drop there reorders a SUBSET. The members that were
 * not on screen keep the slots they had, which is what makes dragging two
 * visible chips past each other leave a hidden third where its owner put it.
 */
export function moveCanvasOrderMember(input: {
  readonly arrangement: LayoutArrangement;
  readonly group: CanvasOrderGroupId;
  /** The members that WERE on screen, in the order they were drawn. */
  readonly visibleIds: ReadonlyArray<string>;
  readonly fromIndex: number;
  readonly toIndex: number;
}): LayoutArrangement {
  const { arrangement, group, visibleIds, fromIndex, toIndex } = input;
  switch (group) {
    case "dock":
      return {
        ...arrangement,
        dock: movedWithinVisible(
          arrangement.dock,
          visibleIds,
          fromIndex,
          toIndex,
        ),
      };
    case "toolbarLeft":
      return {
        ...arrangement,
        toolbarLeft: movedWithinVisible(
          arrangement.toolbarLeft,
          visibleIds,
          fromIndex,
          toIndex,
        ),
      };
    case "toolbarRight":
      return {
        ...arrangement,
        toolbarRight: movedWithinVisible(
          arrangement.toolbarRight,
          visibleIds,
          fromIndex,
          toIndex,
        ),
      };
  }
}

/**
 * The subset the canvas showed, reordered and written back into the slots it
 * occupied. Typed in the group's own ids throughout: the visible ids arrive as
 * strings off the DOM and are only ever used to SELECT from the stored list,
 * never to build one, so a stray id narrows nothing away (G1-23).
 */
function movedWithinVisible<T extends string>(
  full: ReadonlyArray<T>,
  visibleIds: ReadonlyArray<string>,
  fromIndex: number,
  toIndex: number,
): ReadonlyArray<T> {
  const slots = full.flatMap((id, index) =>
    visibleIds.includes(id) ? [index] : [],
  );
  const subset = slots.map((slot) => full[slot]);
  const reordered = movedWithin(subset, fromIndex, toIndex);
  const next = full.slice();
  for (const [position, slot] of slots.entries())
    next[slot] = reordered[position];
  return next;
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
