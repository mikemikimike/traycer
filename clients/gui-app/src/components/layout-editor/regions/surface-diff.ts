import { LAYOUT_REGION_LIST } from "@/components/layout-editor/regions/region-facts";
import type { SurfaceGroupId } from "@/components/layout-editor/regions/region-grammar";
import { positionRowChanged } from "@/components/layout-editor/regions/region-position-rows";
import { SURFACE_ORDER_GROUPS } from "@/components/layout-editor/regions/surface-groups";
import {
  DEFAULT_ARRANGEMENT,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import {
  mobileFooterChanged,
  regionChanged,
  reorderedGroups,
  sidebarSideChanged,
  sideStripViewChanged,
  tabStripPlacementChanged,
  usageProvidersChanged,
} from "@/lib/layout/layout-diff";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { LayoutOverrides } from "@/lib/layout/layout-values";
import type { RegionId } from "@/lib/layout/region-id";

/** An overrides map this module may drop regions from while it builds one. */
type MutableOverrides = {
  -readonly [K in keyof LayoutOverrides]: LayoutOverrides[K];
};

/**
 * One surface of the layout measured against, and put back to, what shipped:
 * the changed dot on a Settings ▸ Layout area and that area's own Reset (H2).
 *
 * A surface is its regions - their values against the base preset, and their
 * Position rows against the shipped arrangement, the same two questions a
 * region row's own dot asks - plus the arrangement fields that belong to the
 * surface and to no region. The two tables below name those fields twice, once
 * as the question and once as the way back, because a field is compared by
 * the predicate that knows its meaning (a provider on Automatic is no change,
 * a divider's id is no move) and put back by assignment.
 *
 * Fields another surface writes are left out on purpose: which profiles the
 * usage popover shows and the context chip's pinned field order are picked
 * where they are drawn, not on this page. "Reset everything" still covers
 * them.
 */

/** Whether anything on `surface` differs from what shipped. */
export function surfaceChanged(
  snapshot: LayoutSnapshot,
  surface: SurfaceGroupId,
): boolean {
  return (
    surfaceRegionIds(surface).some(
      (region) =>
        regionChanged(snapshot, region) || positionRowChanged(snapshot, region),
    ) ||
    reorderedGroups(snapshot.arrangement).some((group) =>
      SURFACE_ORDER_GROUPS[surface].includes(group),
    ) ||
    SURFACE_FIELDS_CHANGED[surface](snapshot.arrangement)
  );
}

/**
 * `surface` back to what shipped, every other surface untouched: its regions'
 * values back to the base preset, and its arrangement fields to the shipped
 * arrangement. The base preset itself is not a surface's to move.
 */
export function resetSurface(
  snapshot: LayoutSnapshot,
  surface: SurfaceGroupId,
): LayoutSnapshot {
  const overrides: MutableOverrides = { ...snapshot.overrides };
  for (const region of surfaceRegionIds(surface)) delete overrides[region];
  return {
    ...snapshot,
    overrides,
    arrangement: {
      ...snapshot.arrangement,
      ...SURFACE_FIELDS_SHIPPED[surface],
    },
  };
}

function surfaceRegionIds(surface: SurfaceGroupId): ReadonlyArray<RegionId> {
  return LAYOUT_REGION_LIST.filter((region) => region.surface === surface).map(
    (region) => region.id,
  );
}

const SURFACE_FIELDS_CHANGED: Readonly<
  Record<SurfaceGroupId, (arrangement: LayoutArrangement) => boolean>
> = {
  topBar: (arrangement) =>
    tabStripPlacementChanged(arrangement, DEFAULT_ARRANGEMENT) ||
    sideStripViewChanged(arrangement, DEFAULT_ARRANGEMENT),
  sidebar: (arrangement) =>
    sidebarSideChanged(arrangement, DEFAULT_ARRANGEMENT),
  chat: (arrangement) =>
    arrangement.minimapSide !== DEFAULT_ARRANGEMENT.minimapSide,
  composer: () => false,
  statusBar: (arrangement) =>
    usageProvidersChanged(arrangement) || mobileFooterChanged(arrangement),
};

const SURFACE_FIELDS_SHIPPED: Readonly<
  Record<SurfaceGroupId, Partial<LayoutArrangement>>
> = {
  topBar: {
    tabStripPlacement: DEFAULT_ARRANGEMENT.tabStripPlacement,
    sideStripView: DEFAULT_ARRANGEMENT.sideStripView,
  },
  sidebar: {
    sidebarSide: DEFAULT_ARRANGEMENT.sidebarSide,
    // `dividerSeq` stays: it only ever increases (see `resetEverything`).
    rail: DEFAULT_ARRANGEMENT.rail,
  },
  chat: { minimapSide: DEFAULT_ARRANGEMENT.minimapSide },
  composer: {
    dock: DEFAULT_ARRANGEMENT.dock,
    toolbarLeft: DEFAULT_ARRANGEMENT.toolbarLeft,
    toolbarRight: DEFAULT_ARRANGEMENT.toolbarRight,
  },
  statusBar: {
    usageHost: DEFAULT_ARRANGEMENT.usageHost,
    usageSide: DEFAULT_ARRANGEMENT.usageSide,
    resourceHost: DEFAULT_ARRANGEMENT.resourceHost,
    resourceSide: DEFAULT_ARRANGEMENT.resourceSide,
    usageProviders: DEFAULT_ARRANGEMENT.usageProviders,
    hiddenProviders: DEFAULT_ARRANGEMENT.hiddenProviders,
    providerLimits: DEFAULT_ARRANGEMENT.providerLimits,
    mobileFooter: DEFAULT_ARRANGEMENT.mobileFooter,
  },
};
