import { describe, expect, it } from "vitest";
import {
  resetSurface,
  surfaceChanged,
} from "@/components/layout-editor/regions/surface-diff";
import type { SurfaceGroupId } from "@/components/layout-editor/regions/region-grammar";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { DEFAULT_LAYOUT_SNAPSHOT } from "@/stores/layout/layout-store";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";

const ALL_SURFACES: ReadonlyArray<SurfaceGroupId> = [
  "topBar",
  "sidebar",
  "chat",
  "composer",
  "statusBar",
];

/** Every surface but the one under test, for the isolation half of each case. */
function otherSurfaces(surface: SurfaceGroupId): ReadonlyArray<SurfaceGroupId> {
  return ALL_SURFACES.filter((entry) => entry !== surface);
}

/**
 * `surfaceChanged` has three disjuncts (a region's value, a region's Position
 * row / its group's order, and the surface's own arrangement fields). Every
 * case below moves exactly one of them and checks both that the surface under
 * test lights up AND that no other surface does - a shared field wired to the
 * wrong surface, or an `||` collapsed to the wrong operand, would still pass a
 * test that only checked the positive side.
 */
describe("surfaceChanged", () => {
  it("topBar: a value change on its one region (Home tab) lights it, and no other surface", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { homeTab: { shown: "shown" } },
    };
    expect(surfaceChanged(snapshot, "topBar")).toBe(true);
    for (const other of otherSurfaces("topBar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  // Home tab carries no Position row and topBar owns no order group
  // (`SURFACE_ORDER_GROUPS.topBar` is empty), so topBar has no region-level
  // "Position move" distinct from its two surface-only fields below.
  it("topBar: the Position field (tab strip placement) lights it", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: { ...DEFAULT_ARRANGEMENT, tabStripPlacement: "left" },
    };
    expect(surfaceChanged(snapshot, "topBar")).toBe(true);
    for (const other of otherSurfaces("topBar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("topBar: the View field (side strip view) lights it", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: { ...DEFAULT_ARRANGEMENT, sideStripView: "activity" },
    };
    expect(surfaceChanged(snapshot, "topBar")).toBe(true);
    for (const other of otherSurfaces("topBar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("sidebar: a value change on a rail region lights it, and no other surface", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { railComments: { shown: "hidden" } },
    };
    expect(surfaceChanged(snapshot, "sidebar")).toBe(true);
    for (const other of otherSurfaces("sidebar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("sidebar: reordering the rail (a Position move) lights it", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        rail: [...DEFAULT_ARRANGEMENT.rail].reverse(),
      },
    };
    expect(surfaceChanged(snapshot, "sidebar")).toBe(true);
    for (const other of otherSurfaces("sidebar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("sidebar: the Side field lights it", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: { ...DEFAULT_ARRANGEMENT, sidebarSide: "right" },
    };
    expect(surfaceChanged(snapshot, "sidebar")).toBe(true);
    for (const other of otherSurfaces("sidebar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("chat: a value change on Context usage (no Position row) lights it, and no other surface", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { contextUsage: { style: "ring" } },
    };
    expect(surfaceChanged(snapshot, "chat")).toBe(true);
    for (const other of otherSurfaces("chat")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  // Chat has one order-less region with a Position row (Minimap) and it reads
  // the very field that is chat's own surface-only field (`minimapSide`), so
  // there is no way to move the region without also moving the field - one
  // case covers both.
  it("chat: moving the minimap's side lights it, both as the region's Position row and as the surface's own field", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: { ...DEFAULT_ARRANGEMENT, minimapSide: "left" },
    };
    expect(surfaceChanged(snapshot, "chat")).toBe(true);
    for (const other of otherSurfaces("chat")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("composer: a value change on Todo's size lights it, and no other surface", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { todo: { size: "chip" } },
    };
    expect(surfaceChanged(snapshot, "composer")).toBe(true);
    for (const other of otherSurfaces("composer")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("composer: reordering the dock (a Position move) lights it", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
      },
    };
    expect(surfaceChanged(snapshot, "composer")).toBe(true);
    for (const other of otherSurfaces("composer")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  // Composer owns no surface-only field (`SURFACE_FIELDS_CHANGED.composer` is
  // `() => false`), so there is no third case for it - the page never offers
  // Reset on Composer unless a value or an order moved.

  it("statusBar: a value change on Usage limits lights it, and no other surface", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { usageLimits: { bar: false } },
    };
    expect(surfaceChanged(snapshot, "statusBar")).toBe(true);
    for (const other of otherSurfaces("statusBar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("statusBar: moving Usage limits to the tab strip's bar (a Position move) lights it", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: { ...DEFAULT_ARRANGEMENT, usageHost: "header" },
    };
    expect(surfaceChanged(snapshot, "statusBar")).toBe(true);
    for (const other of otherSurfaces("statusBar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("statusBar: hiding a provider lights it (a surface-only field)", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        hiddenProviders: [DEFAULT_ARRANGEMENT.usageProviders[0]],
      },
    };
    expect(surfaceChanged(snapshot, "statusBar")).toBe(true);
    for (const other of otherSurfaces("statusBar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("statusBar: turning on the small-screen footer lights it (a surface-only field)", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: { ...DEFAULT_ARRANGEMENT, mobileFooter: true },
    };
    expect(surfaceChanged(snapshot, "statusBar")).toBe(true);
    for (const other of otherSurfaces("statusBar")) {
      expect(surfaceChanged(snapshot, other), other).toBe(false);
    }
  });

  it("statusBar: a provider stored as Automatic does not light it", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        providerLimits: {
          [DEFAULT_ARRANGEMENT.usageProviders[0]]: { limitKeys: [] },
        },
      },
    };
    expect(surfaceChanged(snapshot, "statusBar")).toBe(false);
  });
});

describe("resetSurface", () => {
  it("clears exactly that surface's overrides, preserving every other surface's", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: {
        homeTab: { shown: "hidden" },
        usageLimits: { bar: false },
      },
    };

    const reset = resetSurface(snapshot, "topBar");

    expect(reset.overrides.homeTab).toBeUndefined();
    expect(reset.overrides.usageLimits).toEqual({ bar: false });
  });

  it("puts that surface's arrangement fields back to shipped, leaving another surface's field, dividerSeq and basePreset untouched", () => {
    const bumpedDividerSeq = DEFAULT_ARRANGEMENT.dividerSeq + 7;
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      basePreset: "compact",
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        sidebarSide: "right",
        rail: [...DEFAULT_ARRANGEMENT.rail].reverse(),
        dividerSeq: bumpedDividerSeq,
        // chat's own field, left alone by a sidebar reset.
        minimapSide: "left",
      },
    };

    const reset = resetSurface(snapshot, "sidebar");

    expect(reset.arrangement.sidebarSide).toBe(DEFAULT_ARRANGEMENT.sidebarSide);
    expect(reset.arrangement.rail).toEqual(DEFAULT_ARRANGEMENT.rail);
    expect(reset.arrangement.dividerSeq).toBe(bumpedDividerSeq);
    expect(reset.arrangement.minimapSide).toBe("left");
    expect(reset.basePreset).toBe("compact");
  });

  it("on Status bar, clears the provider list, hidden providers, limits and the footer, leaving the bar placements of other surfaces' business alone", () => {
    const snapshot: LayoutSnapshot = {
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        usageHost: "header",
        hiddenProviders: [DEFAULT_ARRANGEMENT.usageProviders[0]],
        providerLimits: {
          [DEFAULT_ARRANGEMENT.usageProviders[1]]: { limitKeys: ["5h"] },
        },
        mobileFooter: true,
        // sidebar's own field, left alone by a status-bar reset.
        sidebarSide: "right",
      },
    };

    const reset = resetSurface(snapshot, "statusBar");

    expect(reset.arrangement.usageHost).toBe(DEFAULT_ARRANGEMENT.usageHost);
    expect(reset.arrangement.hiddenProviders).toEqual([]);
    expect(reset.arrangement.providerLimits).toEqual({});
    expect(reset.arrangement.mobileFooter).toBe(false);
    expect(reset.arrangement.sidebarSide).toBe("right");
  });
});
