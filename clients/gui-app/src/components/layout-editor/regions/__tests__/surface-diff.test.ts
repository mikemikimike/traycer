import { describe, expect, it } from "vitest";
import { surfaceChanged } from "@/components/layout-editor/regions/surface-diff";
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
