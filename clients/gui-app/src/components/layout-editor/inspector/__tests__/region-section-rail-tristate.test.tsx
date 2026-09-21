import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

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

/** No rail region has a providers row, so nothing here can reach this. */
function noop(): void {}

describe("rail region tri-state header (L-47)", () => {
  it("renders Auto/Shown/Hidden and the hint when the rail region has one", () => {
    const facts = regionFacts("railPullRequests");
    expect(facts.hint).not.toBeNull();

    render(<RegionSection regionId="railPullRequests" onOpenProvider={noop} />);

    // `@testing-library/jest-dom` is not wired into this repo's vitest
    // setup, so presence is read via `query*` + a plain null check.
    expect(
      screen.getByRole("radiogroup", { name: `${facts.name} visibility` }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("switch", { name: `Show ${facts.name}` }),
    ).toBeNull();

    const options = screen.getAllByRole("radio");
    expect(options.map((option) => option.textContent)).toEqual([
      "Auto",
      "Shown",
      "Hidden",
    ]);
    if (facts.hint !== null) {
      expect(screen.queryByText(facts.hint)).not.toBeNull();
    }
  });

  it("gives a rail region with no written rule the same tri-state, and no hint line", () => {
    const facts = regionFacts("railAgents");
    expect(facts.hint).toBeNull();

    render(<RegionSection regionId="railAgents" onOpenProvider={noop} />);

    // The value is three-state for all nine panels (L-47, I-10), so the
    // control is too: a two-position switch could not reach "pinned open".
    expect(
      screen.getByRole("radiogroup", { name: `${facts.name} visibility` }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("switch", { name: `Show ${facts.name}` }),
    ).toBeNull();
    expect(
      screen.getAllByRole("radio").map((option) => option.textContent),
    ).toEqual(["Auto", "Shown", "Hidden"]);
    // Auto still means "follow the app"; only a rule that is written down
    // gets a line spelling it out.
    expect(screen.queryByText(/^Auto - /)).toBeNull();
  });

  it("keeps Hidden reachable from the tri-state on a panel with no rule", () => {
    render(<RegionSection regionId="railFileTree" onOpenProvider={noop} />);

    fireEvent.click(screen.getByRole("radio", { name: "Hidden" }));

    expect(useLayoutStore.getState().overrides.railFileTree?.shown).toBe(
      "hidden",
    );
  });

  it("sets the rail region's shown value from Auto/Shown/Hidden without collapsing to a boolean", () => {
    render(<RegionSection regionId="railComments" onOpenProvider={noop} />);
    const shownOption = screen.getByRole("radio", { name: "Shown" });

    fireEvent.click(shownOption);

    expect(useLayoutStore.getState().overrides.railComments?.shown).toBe(
      "shown",
    );
  });
});
