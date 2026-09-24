import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * Item 3 - per-row greying in the dock (G1-06, G7).
 *
 * A hidden region used to wrap its WHOLE body in one `inert`/`opacity-40`
 * div. Now `RegionSection` wraps every row EXCEPT `fine-tune` individually -
 * a non-fine-tune row (Position, here) is still inert and dimmed as a whole
 * row - and `FineTuneDisclosure` greys its OWN rows one at a time
 * (`row.whileHidden`), so Resource monitor's `agentRows` row (which tunes the
 * SIDEBAR, not the monitor) stays fully operable while `metrics` (which tunes
 * the monitor itself) is greyed like any other row.
 *
 * Rendered in the dock host (the default `LayoutFormHostContext`, never
 * `"page"`): the page flattens Fine-tune away entirely (item 2), so this
 * per-row split is a dock-only behaviour.
 */

function noop(): void {}

function inertWrapperOf(label: string): Element | null {
  return screen.getByText(label).closest("[inert]");
}

/** Fine-tune starts collapsed (empty filter); open it to reach its rows. */
function openFineTune(): void {
  fireEvent.click(screen.getByRole("button", { name: /^Fine-tune/ }));
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
  useLayoutStore.getState().setRegionValues("resourceMonitor", {
    shown: "hidden",
  });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("a hidden region greys its non-fine-tune rows whole (G1-06)", () => {
  it("wraps the Position row inert and dimmed", () => {
    render(<RegionSection regionId="resourceMonitor" onOpenProvider={noop} />);

    const wrapper = inertWrapperOf("Position");

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("opacity-40");
  });
});

describe("a hidden region's fine-tune section greys row by row (G7)", () => {
  it("leaves the whileHidden row (agent-row readings) operable", () => {
    render(<RegionSection regionId="resourceMonitor" onOpenProvider={noop} />);
    openFineTune();

    // Not wrapped by RegionSection at all (fine-tune is excluded there), and
    // FineTuneDisclosure itself must not grey a row that tunes the sidebar
    // rather than the monitor.
    expect(inertWrapperOf("Readings on agent rows")).toBeNull();
    const toggle = screen.getByRole("switch", {
      name: "Readings on agent rows",
    });
    expect(toggle.closest("[inert]")).toBeNull();
  });

  it("greys the ordinary fine-tune row (Metrics) like any other", () => {
    render(<RegionSection regionId="resourceMonitor" onOpenProvider={noop} />);
    openFineTune();

    const wrapper = inertWrapperOf("Metrics");

    expect(wrapper).not.toBeNull();
    expect(wrapper?.className).toContain("opacity-40");
  });
});

describe("a shown region greys nothing", () => {
  it("leaves every row un-inert when the region is not hidden", () => {
    useLayoutStore.getState().setRegionValues("resourceMonitor", {
      shown: "shown",
    });
    render(<RegionSection regionId="resourceMonitor" onOpenProvider={noop} />);
    openFineTune();

    expect(inertWrapperOf("Position")).toBeNull();
    expect(inertWrapperOf("Metrics")).toBeNull();
    expect(inertWrapperOf("Readings on agent rows")).toBeNull();
  });
});
