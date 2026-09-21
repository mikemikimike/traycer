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
