import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { regionFacts } from "@/lib/layout/layout-regions";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { DEFAULT_LAYOUT_SNAPSHOT, useLayoutStore } from "@/stores/layout/layout-store";

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT, layoutCarryDone: true });
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

describe("rail region tri-state header (L-47)", () => {
  it("renders Auto/Shown/Hidden and the hint when the rail region has one", () => {
    const facts = regionFacts("railPullRequests");
    expect(facts.hint).not.toBeNull();

    render(
      <RegionSection
        regionId="railPullRequests"
        host="inspector"
        onOpenProvider={null}
      />,
    );

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

  it("falls back to a plain Shown switch when the rail region has no hint", () => {
    const facts = regionFacts("railAgents");
    expect(facts.hint).toBeNull();

    render(
      <RegionSection regionId="railAgents" host="inspector" onOpenProvider={null} />,
    );

    expect(
      screen.getByRole("switch", { name: `Show ${facts.name}` }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("radiogroup", { name: `${facts.name} visibility` }),
    ).toBeNull();
  });

  it("sets the rail region's shown value from Auto/Shown/Hidden without collapsing to a boolean", () => {
    render(
      <RegionSection
        regionId="railComments"
        host="inspector"
        onOpenProvider={null}
      />,
    );
    const shownOption = screen.getByRole("radio", { name: "Shown" });

    fireEvent.click(shownOption);

    expect(useLayoutStore.getState().overrides.railComments?.shown).toBe(
      "shown",
    );
  });
});
