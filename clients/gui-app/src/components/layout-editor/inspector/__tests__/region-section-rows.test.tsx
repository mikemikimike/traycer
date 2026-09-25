import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RAIL_REGION_IDS } from "@/lib/layout/rail";
import { LayoutUsageContext } from "@/components/layout-editor/inspector/use-layout-usage";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

function noop(): void {}

/**
 * This suite is about the ROW shapes `RegionSection` composes, not about
 * `useLayoutUsage()`'s own watched-host filtering (`order-group-list.test.tsx`,
 * `style-row`'s own owner) - so every stored provider is treated as watched,
 * through the REAL `LayoutUsageContext` (both `useLayoutUsage()` and
 * `region-depiction.tsx`'s own direct `LayoutUsageContext.Consumer` resolve
 * through it) rather than a mocked hook, read live off the store at render
 * time since several cases below mutate `hiddenProviders`/`usageProviders`
 * mid-test through the real store.
 */
function renderRegionSection(regionId: RegionId): void {
  render(
    <LayoutUsageContext.Provider
      value={{
        providerIds: useLayoutStore.getState().arrangement.usageProviders,
        cluster: { kind: "no-providers" },
        hostName: "the watched host",
      }}
    >
      <RegionSection regionId={regionId} onOpenProvider={noop} />
    </LayoutUsageContext.Provider>,
  );
}

function styleExamples(): ReadonlyArray<HTMLElement> {
  return within(screen.getByRole("radiogroup", { name: "Style" })).getAllByRole(
    "radio",
  );
}

function providerIdsIn(node: HTMLElement): ReadonlyArray<string> {
  return [...node.querySelectorAll<HTMLElement>("[data-provider-id]")].map(
    (segment) => segment.dataset.providerId ?? "",
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({
    instances: new Map(),
    dockMode: "right",
    lockedBy: "none",
  });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("the Style block's example subject (L-10, I-06)", () => {
  it("draws ONE provider segment per usage example, however many are shown", () => {
    const shown = useLayoutStore.getState().arrangement.usageProviders;
    // The defect needs more than one provider on the strip to show at all:
    // the block drew the whole cluster, so each 260px example row was asked
    // for a segment per provider and was masked off after the first two.
    expect(shown.length).toBeGreaterThan(1);

    renderRegionSection("usageLimits");

    const examples = styleExamples();
    expect(examples.length).toBeGreaterThan(1);
    for (const example of examples) {
      expect(providerIdsIn(example)).toEqual([shown[0]]);
    }
  });

  it("takes its specimen from the first provider the strip still shows", () => {
    const shown = useLayoutStore.getState().arrangement.usageProviders;
    renderRegionSection("usageLimits");

    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore.getState().setArrangement({
        ...arrangement,
        hiddenProviders: [shown[0]],
      });
    });

    for (const example of styleExamples()) {
      expect(providerIdsIn(example)).toEqual([shown[1]]);
    }
  });

  it("keeps drawing the region itself for every other region", () => {
    renderRegionSection("contextUsage");

    for (const example of styleExamples()) {
      expect(providerIdsIn(example)).toEqual([]);
      expect(example.querySelector("[data-layout-depiction]")).not.toBeNull();
    }
  });
});

/**
 * Phase D: `RegionSection`'s own stage label is a static literal ("Sample" or
 * absent), never `ProviderLevelBody`'s dynamic "Live · {hostName}" - the two
 * components share `SpecimenStage` but not its label source, so a rich,
 * real-looking usage context here must never make the marker read "Live".
 */
describe("the stage's own label (Phase D)", () => {
  it("keeps the static Sample label even under a rich, real usage context", () => {
    // `getByTitle`, not `getByText`: the Style block below draws its own
    // unrelated "Sample" caption over its radiogroup (`style-row.tsx`), so
    // only the stage marker's own `title` attribute names it uniquely.
    renderRegionSection("usageLimits");
    expect(screen.getByTitle("Sample")).not.toBeNull();
    expect(screen.queryByTitle(/^Live/)).toBeNull();
  });

  it("drops the marker entirely once no stored provider is both watched and shown", () => {
    const { arrangement } = useLayoutStore.getState();
    useLayoutStore.getState().setArrangement({
      ...arrangement,
      hiddenProviders: arrangement.usageProviders,
    });

    renderRegionSection("usageLimits");
    expect(screen.queryByTitle("Sample")).toBeNull();
  });
});

describe("the providers list (I-12)", () => {
  it("gives every provider row a glyph of its own", () => {
    renderRegionSection("usageLimits");

    const rows = [...document.querySelectorAll("[data-sortable-id]")];
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      // Named, not counted: the row's own glyph is the element in the icon
      // slot, and it is a different element from the grip beside it. A count
      // of the SVGs in the line passed for any two of them and would fail for
      // a legitimate third - a changed dot drawn as an SVG, a chevron on an
      // expandable row (R1-19).
      //
      // A provider row used to carry the grip and an eye toggle only, which
      // read as bare text beside every other sortable list in the inspector
      // (I-12). The eye is gone with D5: a row in the dock's list carries no
      // visibility control at all, because the section header above it owns
      // the one control the selected region has, and the provider's own level
      // owns the one a provider has.
      const icon = row.querySelector("[data-row-icon]");
      const grip = row.querySelector("[data-row-grip]");
      expect(icon).not.toBeNull();
      expect(icon?.tagName.toLowerCase()).toBe("svg");
      expect(grip).not.toBeNull();
      expect(icon).not.toBe(grip);
    }
  });
});

describe("the per-row revert (L-20, I-04)", () => {
  it("draws exactly one revert on a changed unstacked row, not one per side", () => {
    renderRegionSection("usageLimits");
    expect(
      screen.queryByRole("button", { name: "Revert Position" }),
    ).toBeNull();

    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore
        .getState()
        .setArrangement({ ...arrangement, usageHost: "header" });
    });

    // An unstacked row: the glyph belongs after the control. Both sides used
    // to draw one, and both carried the same accessible name, so a screen
    // reader heard the control twice.
    expect(
      screen.getAllByRole("button", { name: "Revert Position" }),
    ).toHaveLength(1);
  });

  it("draws exactly one revert on a stacked row too", () => {
    renderRegionSection("runningAgents");

    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore.getState().setArrangement({
        ...arrangement,
        dock: [...arrangement.dock].reverse(),
      });
    });

    expect(
      screen.getAllByRole("button", { name: "Revert Position" }),
    ).toHaveLength(1);
  });
});

describe("one list, two hosts (L-03, L-95)", () => {
  it("filters by SELECTION rather than by drawing a list of its own", () => {
    // railPullRequests rather than railAgents: it still carries a presence
    // rule, so its header keeps the tri-state radiogroup (G6) and this test's
    // "one control, the header's" assertion still names a radiogroup rather
    // than needing to fork on which control kind the selected panel gets.
    renderRegionSection("railPullRequests");

    const rows = [...document.querySelectorAll("[data-sortable-id]")];
    const ids = rows.map((node) => node.getAttribute("data-sortable-id") ?? "");

    // The SAME list the Settings page's Sidebar card draws: every rail entry,
    // dividers included. What the dock adds is the selection - one row marked,
    // and no per-row controls, because the header above owns the one control
    // the selected region has (D5).
    for (const railId of RAIL_REGION_IDS) {
      expect(
        ids.filter((id) => id === railId),
        railId,
      ).toHaveLength(1);
    }
    expect(ids).toHaveLength(DEFAULT_LAYOUT_SNAPSHOT.arrangement.rail.length);

    const selected = rows.filter((node) =>
      node.hasAttribute("data-sortable-selected"),
    );
    expect(
      selected.map((node) => node.getAttribute("data-sortable-id")),
    ).toEqual(["railPullRequests"]);

    // The one visibility control is the header's, not a row's.
    expect(
      screen.getAllByRole("radiogroup", { name: /visibility$/ }),
    ).toHaveLength(1);
  });
});

/**
 * L-156: each of the two strip readings answers for itself, on two rows - the
 * bar and the end of it - and writing one touches neither the other axis nor
 * the other region.
 */
describe("the two bar readings' Position rows (L-156)", () => {
  function rowControl(label: string): HTMLElement {
    return screen.getByRole("radiogroup", { name: label });
  }

  it("gives each reading a bar row and a side row", () => {
    renderRegionSection("resourceMonitor");

    expect(screen.getByText("Position")).not.toBeNull();
    expect(screen.getByText("Side")).not.toBeNull();
    expect(
      within(rowControl("Resource monitor position"))
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Status bar", "Tab strip"]);
    expect(
      within(rowControl("Resource monitor side"))
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Left", "Right"]);
  });

  it("writes only its own region and its own axis", () => {
    renderRegionSection("resourceMonitor");

    // The usage cluster is put somewhere it did not ship first, so a write
    // that reached it would be visible rather than landing on the value it
    // already had.
    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore
        .getState()
        .setArrangement({ ...arrangement, usageSide: "right" });
    });

    fireEvent.click(
      within(rowControl("Resource monitor position")).getByRole("radio", {
        name: "Tab strip",
      }),
    );
    fireEvent.click(
      within(rowControl("Resource monitor side")).getByRole("radio", {
        name: "Left",
      }),
    );

    const { arrangement } = useLayoutStore.getState();
    expect(arrangement.resourceHost).toBe("header");
    expect(arrangement.resourceSide).toBe("left");
    expect(arrangement.usageHost).toBe("status-bar");
    expect(arrangement.usageSide).toBe("right");
  });

  it("reverts one row at a time (L-133)", () => {
    renderRegionSection("usageLimits");

    act(() => {
      const arrangement = useLayoutStore.getState().arrangement;
      useLayoutStore.getState().setArrangement({
        ...arrangement,
        usageHost: "header",
        usageSide: "right",
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Revert Side" }));

    const { arrangement } = useLayoutStore.getState();
    expect(arrangement.usageSide).toBe("left");
    // The bar row is the one that still has something to put back.
    expect(arrangement.usageHost).toBe("header");
    expect(
      screen.getByRole("button", { name: "Revert Position" }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Revert Side" })).toBeNull();
  });
});
