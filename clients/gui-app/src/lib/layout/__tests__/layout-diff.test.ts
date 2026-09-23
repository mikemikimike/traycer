import { describe, expect, it } from "vitest";
import {
  anythingChanged,
  arrangementChanged,
  layoutSnapshotProperties,
  mobileFooterChanged,
  providerChanged,
  resetEverything,
  revertProvider,
  sidebarSideChanged,
  sideStripViewChanged,
  tabStripPlacementChanged,
  usageProvidersChanged,
} from "@/lib/layout/layout-diff";
import {
  AUTOMATIC_LIMIT_SELECTION,
  DEFAULT_ARRANGEMENT,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";

/**
 * The page's safety net (L-20, P-6).
 *
 * The full-width host has no session, so it has no Undo, no Discard and no
 * Cmd+Z, and "Reset to <preset>" is values-only by construction (L-57). These
 * are the predicates a changed dot and a per-row revert read for the three
 * arrangement fields nothing measured - `hiddenProviders`, `providerLimits`
 * and `mobileFooter` - and the floor underneath all of them.
 */

const PROVIDER: RateLimitProviderId = DEFAULT_ARRANGEMENT.usageProviders[0];
const OTHER_PROVIDER: RateLimitProviderId =
  DEFAULT_ARRANGEMENT.usageProviders[1];

function snapshotWith(arrangement: LayoutArrangement): LayoutSnapshot {
  return { basePreset: "default", overrides: {}, arrangement };
}

describe("one provider's own state", () => {
  it("is unchanged until it is hidden or its limits are picked", () => {
    expect(providerChanged(DEFAULT_ARRANGEMENT, PROVIDER)).toBe(false);

    const hidden: LayoutArrangement = {
      ...DEFAULT_ARRANGEMENT,
      hiddenProviders: [PROVIDER],
    };
    expect(providerChanged(hidden, PROVIDER)).toBe(true);
    expect(providerChanged(hidden, OTHER_PROVIDER)).toBe(false);

    const picked: LayoutArrangement = {
      ...DEFAULT_ARRANGEMENT,
      providerLimits: { [PROVIDER]: { limitKeys: ["5h"] } },
    };
    expect(providerChanged(picked, PROVIDER)).toBe(true);
  });

  it("is measured by difference, so an entry equal to Automatic is none", () => {
    // The writer deletes the key on the way back to Automatic; a map
    // rehydrated from an older write can still carry one, and an entry that
    // says exactly what the default says is not a change (R1-03).
    const automatic: LayoutArrangement = {
      ...DEFAULT_ARRANGEMENT,
      providerLimits: { [PROVIDER]: AUTOMATIC_LIMIT_SELECTION },
    };

    expect(providerChanged(automatic, PROVIDER)).toBe(false);
    expect(usageProvidersChanged(automatic)).toBe(false);
    expect(anythingChanged(snapshotWith(automatic))).toBe(false);
  });

  it("reverts to shown and Automatic, leaving every other provider alone", () => {
    const before: LayoutArrangement = {
      ...DEFAULT_ARRANGEMENT,
      hiddenProviders: [PROVIDER, OTHER_PROVIDER],
      providerLimits: {
        [PROVIDER]: { limitKeys: ["5h"] },
        [OTHER_PROVIDER]: { limitKeys: ["week"] },
      },
    };

    const after = revertProvider(before, PROVIDER);

    expect(providerChanged(after, PROVIDER)).toBe(false);
    expect(providerChanged(after, OTHER_PROVIDER)).toBe(true);
    expect(after.hiddenProviders).toEqual([OTHER_PROVIDER]);
  });
});

describe("what the page can see as changed", () => {
  it("counts hidden providers, picked limits and a reorder as the providers changing", () => {
    expect(usageProvidersChanged(DEFAULT_ARRANGEMENT)).toBe(false);
    expect(
      usageProvidersChanged({
        ...DEFAULT_ARRANGEMENT,
        hiddenProviders: [PROVIDER],
      }),
    ).toBe(true);
    expect(
      usageProvidersChanged({
        ...DEFAULT_ARRANGEMENT,
        providerLimits: { [PROVIDER]: { limitKeys: ["5h"] } },
      }),
    ).toBe(true);
    expect(
      usageProvidersChanged({
        ...DEFAULT_ARRANGEMENT,
        usageProviders: [...DEFAULT_ARRANGEMENT.usageProviders].reverse(),
      }),
    ).toBe(true);
  });

  it("sees the small-screen status bar, which had no indication anywhere", () => {
    expect(mobileFooterChanged(DEFAULT_ARRANGEMENT)).toBe(false);
    expect(
      mobileFooterChanged({ ...DEFAULT_ARRANGEMENT, mobileFooter: true }),
    ).toBe(true);
  });

  it("answers for the whole arrangement, field by field", () => {
    expect(arrangementChanged(DEFAULT_ARRANGEMENT)).toBe(false);
    const eachOne: ReadonlyArray<Partial<LayoutArrangement>> = [
      { usageHost: "header" },
      { minimapSide: "left" },
      { resourceSide: "left" },
      { mobileFooter: true },
      { hiddenProviders: [PROVIDER] },
      { dock: [...DEFAULT_ARRANGEMENT.dock].reverse() },
      { tabStripPlacement: "left" },
      { sidebarSide: "right" },
      { sideStripView: "activity" },
    ];
    for (const patch of eachOne) {
      expect(
        arrangementChanged({ ...DEFAULT_ARRANGEMENT, ...patch }),
        JSON.stringify(patch),
      ).toBe(true);
    }
  });
});

/**
 * S-01, S-02, S-06: the tab strip's placement and the sidebar's side, as
 * their own two-arrangement comparators and in the `layout_snapshot` payload.
 */
describe("the tab strip's placement and the sidebar's side", () => {
  it("tabStripPlacementChanged and sidebarSideChanged compare the two arrangements handed to them", () => {
    expect(
      tabStripPlacementChanged(DEFAULT_ARRANGEMENT, DEFAULT_ARRANGEMENT),
    ).toBe(false);
    expect(
      tabStripPlacementChanged(
        { ...DEFAULT_ARRANGEMENT, tabStripPlacement: "left" },
        DEFAULT_ARRANGEMENT,
      ),
    ).toBe(true);
    expect(sidebarSideChanged(DEFAULT_ARRANGEMENT, DEFAULT_ARRANGEMENT)).toBe(
      false,
    );
    expect(
      sidebarSideChanged(
        { ...DEFAULT_ARRANGEMENT, sidebarSide: "right" },
        DEFAULT_ARRANGEMENT,
      ),
    ).toBe(true);
  });

  it("the snapshot builder emits both properties", () => {
    const properties = layoutSnapshotProperties(
      snapshotWith({
        ...DEFAULT_ARRANGEMENT,
        tabStripPlacement: "right",
        sidebarSide: "right",
      }),
    );

    expect(properties.layout_tab_strip_placement).toBe("right");
    expect(properties.layout_sidebar_side).toBe("right");
  });
});

/** D8: the vertical strip's view, as its own two-arrangement comparator and in the payload. */
describe("the vertical strip's view", () => {
  it("sideStripViewChanged compares the two arrangements handed to it", () => {
    expect(sideStripViewChanged(DEFAULT_ARRANGEMENT, DEFAULT_ARRANGEMENT)).toBe(
      false,
    );
    expect(
      sideStripViewChanged(
        { ...DEFAULT_ARRANGEMENT, sideStripView: "activity" },
        DEFAULT_ARRANGEMENT,
      ),
    ).toBe(true);
  });

  it("the snapshot builder emits the property", () => {
    const properties = layoutSnapshotProperties(
      snapshotWith({ ...DEFAULT_ARRANGEMENT, sideStripView: "activity" }),
    );

    expect(properties.layout_side_strip_view).toBe("activity");
  });
});

describe("Reset everything (L-20)", () => {
  it("puts back the preset, every value and every arrangement field", () => {
    const before: LayoutSnapshot = {
      basePreset: "compact",
      overrides: { minimap: { shown: "hidden" } },
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        usageHost: "header",
        minimapSide: "left",
        resourceSide: "left",
        mobileFooter: true,
        hiddenProviders: [PROVIDER],
        providerLimits: { [PROVIDER]: { limitKeys: ["5h"] } },
        dock: [...DEFAULT_ARRANGEMENT.dock].reverse(),
        usageProviders: [...DEFAULT_ARRANGEMENT.usageProviders].reverse(),
        // S-29: "Reset everything" restores the tab strip placement and the
        // sidebar side too.
        tabStripPlacement: "right",
        sidebarSide: "right",
        // D8: and the vertical strip's view.
        sideStripView: "activity",
      },
    };

    const after = resetEverything(before);

    expect(after.basePreset).toBe("default");
    expect(after.overrides).toEqual({});
    expect(arrangementChanged(after.arrangement)).toBe(false);
    expect(anythingChanged(after)).toBe(false);
    expect(after.arrangement.tabStripPlacement).toBe("top");
    expect(after.arrangement.sidebarSide).toBe("left");
    expect(after.arrangement.sideStripView).toBe("layered");
  });

  it("never hands a divider id back out, which is the one field it keeps", () => {
    const before = snapshotWith({
      ...DEFAULT_ARRANGEMENT,
      dividerSeq: DEFAULT_ARRANGEMENT.dividerSeq + 7,
    });

    expect(resetEverything(before).arrangement.dividerSeq).toBe(
      DEFAULT_ARRANGEMENT.dividerSeq + 7,
    );
  });

  it("has nothing to do on a snapshot that is already the shipped one", () => {
    expect(anythingChanged(snapshotWith(DEFAULT_ARRANGEMENT))).toBe(false);
    expect(
      anythingChanged({
        ...snapshotWith(DEFAULT_ARRANGEMENT),
        basePreset: "compact",
      }),
    ).toBe(true);
  });
});
