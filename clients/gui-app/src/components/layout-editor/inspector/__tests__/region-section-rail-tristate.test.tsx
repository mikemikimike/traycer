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

  it("gives a rail region with no written rule a plain switch instead (G6)", () => {
    // Seven of the nine panels have no presence rule of their own, so Auto
    // and Shown drew the same rail and the third option was a choice with no
    // effect (`offersAuto` is false). They get `RegionShownControl`'s plain
    // switch, same as any other region - not the tri-state.
    const facts = regionFacts("railAgents");
    expect(facts.hint).toBeNull();

    render(<RegionSection regionId="railAgents" onOpenProvider={noop} />);

    expect(
      screen.queryByRole("radiogroup", { name: `${facts.name} visibility` }),
    ).toBeNull();
    expect(
      screen.getByRole("switch", { name: `Show ${facts.name}` }),
    ).not.toBeNull();
    // Auto still means "follow the app"; only a rule that is written down
    // gets a line spelling it out.
    expect(screen.queryByText(/^Auto - /)).toBeNull();
  });

  it("still writes the rail's three-state value from the plain switch on a panel with no rule (G6)", () => {
    render(<RegionSection regionId="railFileTree" onOpenProvider={noop} />);
    const toggle = screen.getByRole("switch", {
      name: `Show ${regionFacts("railFileTree").name}`,
    });
    expect(toggle.getAttribute("aria-checked")).toBe("true");

    fireEvent.click(toggle);

    // The switch is binary, but what it writes is still `hidden` on the way
    // off - Hidden stays reachable even though the third option is gone.
    expect(useLayoutStore.getState().overrides.railFileTree?.shown).toBe(
      "hidden",
    );

    fireEvent.click(toggle);

    // And back on writes the rail's own "on" value, `auto` - not the
    // literal `shown` a plain region's switch would write.
    expect(useLayoutStore.getState().overrides.railFileTree?.shown).toBe(
      "auto",
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
