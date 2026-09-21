import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { RAIL_REGION_IDS } from "@/lib/layout/rail";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

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

    render(
      <RegionSection
        regionId="usageLimits"
        host="inspector"
        onOpenProvider={null}
      />,
    );

    const examples = styleExamples();
    expect(examples.length).toBeGreaterThan(1);
    for (const example of examples) {
      expect(providerIdsIn(example)).toEqual([shown[0]]);
    }
  });

  it("takes its specimen from the first provider the strip still shows", () => {
    const shown = useLayoutStore.getState().arrangement.usageProviders;
    render(
      <RegionSection
        regionId="usageLimits"
        host="inspector"
        onOpenProvider={null}
      />,
    );

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
    render(
      <RegionSection
        regionId="contextUsage"
        host="inspector"
        onOpenProvider={null}
      />,
    );

    for (const example of styleExamples()) {
      expect(providerIdsIn(example)).toEqual([]);
      expect(example.querySelector("[data-layout-depiction]")).not.toBeNull();
    }
  });
});

describe("the providers list (I-12)", () => {
  it("gives every provider row a glyph of its own", () => {
    render(
      <RegionSection
        regionId="usageLimits"
        host="inspector"
        onOpenProvider={null}
      />,
    );

    const rows = [...document.querySelectorAll("[data-sortable-id]")];
    expect(rows.length).toBeGreaterThan(1);
    for (const row of rows) {
      // The grip and the row's own glyph. A provider row used to carry the
      // grip and an eye toggle only, which read as bare text beside every
      // other sortable list in the inspector (I-12).
      //
      // The eye is gone with D5: a row in the dock's list carries no
      // visibility control at all, because the section header above it owns
      // the one control the selected region has, and the provider's own level
      // owns the one a provider has. Two controls for one value, in two
      // vocabularies, is what that button was.
      expect(row.querySelectorAll("svg")).toHaveLength(2);
    }
  });
});

describe("the per-row revert (L-20, I-04)", () => {
  it("draws exactly one revert on a changed unstacked row, not one per side", () => {
    render(
      <RegionSection
        regionId="usageLimits"
        host="inspector"
        onOpenProvider={null}
      />,
    );
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
    render(
      <RegionSection
        regionId="runningAgents"
        host="inspector"
        onOpenProvider={null}
      />,
    );

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
    render(
      <RegionSection
        regionId="railAgents"
        host="inspector"
        onOpenProvider={null}
      />,
    );

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
      node.className.includes("border-foreground"),
    );
    expect(
      selected.map((node) => node.getAttribute("data-sortable-id")),
    ).toEqual(["railAgents"]);

    // The one visibility control is the header's, not a row's.
    expect(
      screen.getAllByRole("radiogroup", { name: /visibility$/ }),
    ).toHaveLength(1);
  });
});
