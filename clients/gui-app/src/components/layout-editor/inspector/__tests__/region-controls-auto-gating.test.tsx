import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  RegionDisplayControl,
  RegionShownControl,
} from "@/components/layout-editor/inspector/region-controls";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import { setMobileApp } from "@/lib/mobile-app";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import type { RegionId } from "@/lib/layout/region-id";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useSettingsStore } from "@/stores/settings/settings-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * Item 4 - rail Auto (G6): `regionHides` (has a `shown` leaf at all) and
 * `offersAuto` (a rail panel with its own presence rule) gate both controls.
 *
 * Rendered live off the store, like `region-display-control.test.tsx`, so a
 * click is checked against what actually got WRITTEN rather than only
 * against the control's own redraw.
 */

function LiveShownControl(props: { readonly regionId: RegionId }): ReactNode {
  const snapshot = useLayoutSnapshot();
  return (
    <RegionShownControl
      regionId={props.regionId}
      values={effectiveLayoutValues(snapshot.basePreset, snapshot.overrides)}
    />
  );
}

function LiveDisplayControl(props: { readonly regionId: RegionId }): ReactNode {
  const snapshot = useLayoutSnapshot();
  return (
    <RegionDisplayControl
      regionId={props.regionId}
      values={effectiveLayoutValues(snapshot.basePreset, snapshot.overrides)}
    />
  );
}

function shownOf(regionId: RegionId): unknown {
  const state = useLayoutStore.getState();
  return Reflect.get(
    effectiveLayoutValues(state.basePreset, state.overrides)[regionId],
    "shown",
  );
}

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.getState().beginSession({
    entry: "keyboard",
    source: "direct_ui",
    startedAt: 0,
  });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("RegionShownControl on a rail panel with no presence rule (offersAuto false)", () => {
  it("renders a plain switch, not the tri-state radiogroup", () => {
    expect(regionFacts("railAgents").hint).toBeNull();

    render(<LiveShownControl regionId="railAgents" />);

    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("switch", { name: "Show Agents" })).not.toBeNull();
  });

  it("still writes the rail's three-state value, not a plain boolean", () => {
    render(<LiveShownControl regionId="railAgents" />);
    expect(shownOf("railAgents")).toBe("auto");

    fireEvent.click(screen.getByRole("switch", { name: "Show Agents" }));
    // Off writes `hidden`, same as the tri-state control's Hidden option.
    expect(shownOf("railAgents")).toBe("hidden");

    fireEvent.click(screen.getByRole("switch", { name: "Show Agents" }));
    // Back on writes the rail's own "on" value, `auto` - never the literal
    // `shown` a plain region's switch would write.
    expect(shownOf("railAgents")).toBe("auto");
  });
});

describe("RegionShownControl on a rail panel WITH a presence rule (offersAuto true)", () => {
  it("keeps the tri-state radiogroup", () => {
    expect(regionFacts("railPullRequests").hint).not.toBeNull();

    render(<LiveShownControl regionId="railPullRequests" />);

    expect(screen.queryByRole("switch")).toBeNull();
    const group = screen.getByRole("radiogroup", {
      name: "Pull Requests visibility",
    });
    expect(
      [...group.querySelectorAll('[role="radio"]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Auto", "Shown", "Hidden"]);
  });

  it("keeps the tri-state radiogroup for the other hinted panel too (Comments)", () => {
    expect(regionFacts("railComments").hint).not.toBeNull();

    render(<LiveShownControl regionId="railComments" />);

    expect(screen.getByRole("radiogroup")).not.toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
  });
});

describe("a region with no `shown` leaf at all (regionHides false)", () => {
  it("gives Access no Shown control whatsoever", () => {
    render(<LiveShownControl regionId="access" />);

    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("gives Access Full row/Chip only, no Hidden, from the display control", () => {
    render(<LiveDisplayControl regionId="access" />);

    const options = screen
      .getAllByRole("radio")
      .map((option) => option.textContent);
    expect(options).toEqual(["Full row", "Chip"]);
    expect(screen.queryByText("Hidden")).toBeNull();
  });

  it("drops Access's own display control on a narrow page - it has no applicable size", () => {
    const original = window.innerWidth;
    window.innerWidth = 500;
    try {
      render(<LiveDisplayControl regionId="access" />);
      expect(screen.queryAllByRole("radio")).toHaveLength(0);
    } finally {
      window.innerWidth = original;
    }
  });
});

describe("Microphone's own control (mobile absence, voice-off gating)", () => {
  afterEach(() => {
    setMobileApp(false);
    useSettingsStore.setState({ voiceInputEnabled: true });
  });

  it("is absent in the installed mobile app, on both the page's and the dock's controls", () => {
    setMobileApp(true);
    render(<LiveDisplayControl regionId="mic" />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    cleanup();

    render(<LiveShownControl regionId="mic" />);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("disables the dock's switch and names the reason when voice input is off", () => {
    useSettingsStore.setState({ voiceInputEnabled: false });
    render(<LiveShownControl regionId="mic" />);

    const toggle = screen.getByRole("switch", { name: "Show Microphone" });
    expect(toggle.hasAttribute("disabled")).toBe(true);
    const describedById = toggle.getAttribute("aria-describedby");
    expect(describedById).not.toBeNull();
    expect(document.getElementById(describedById as string)?.textContent).toBe(
      "Enable Voice input in General settings to show the microphone.",
    );
  });
});
