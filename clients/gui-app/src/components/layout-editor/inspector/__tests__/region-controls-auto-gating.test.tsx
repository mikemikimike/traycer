import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RegionDisplayControl } from "@/components/layout-editor/inspector/region-controls";
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
 * Item 4 - rail Auto (G6, L-128 overturned): `RegionDisplayControl` is the
 * ONE display control in both hosts now, so it alone carries every gate -
 * `regionHides` (has a `shown` leaf at all), `isAutoRailRegionId` (Pull
 * requests and Comments only, L-93 overturned) and the sizeable/Access split.
 *
 * Rendered live off the store, so a click is checked against what actually
 * got WRITTEN rather than only against the control's own redraw.
 */

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
    origin: { kind: "tab" },
  });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("a rail panel with no presence rule of its own (isAutoRailRegionId false)", () => {
  it("offers only Shown/Hidden, no Auto", () => {
    expect(regionFacts("railAgents").hint).toBeNull();

    render(<LiveDisplayControl regionId="railAgents" />);

    const group = screen.getByRole("radiogroup", { name: "Agents display" });
    expect(
      [...group.querySelectorAll('[role="radio"]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Shown", "Hidden"]);
  });

  it("writes the plain Visibility literal, never `auto`", () => {
    render(<LiveDisplayControl regionId="railAgents" />);
    expect(shownOf("railAgents")).toBe("shown");

    fireEvent.click(screen.getByRole("radio", { name: "Hidden" }));
    expect(shownOf("railAgents")).toBe("hidden");

    fireEvent.click(screen.getByRole("radio", { name: "Shown" }));
    // Back on writes the literal `shown` - never `auto`, which this panel's
    // value can no longer even hold (L-93 overturned).
    expect(shownOf("railAgents")).toBe("shown");
  });
});

describe("a rail panel WITH a presence rule of its own (isAutoRailRegionId true)", () => {
  it("keeps the tri-state radiogroup for Pull requests", () => {
    expect(regionFacts("railPullRequests").hint).not.toBeNull();

    render(<LiveDisplayControl regionId="railPullRequests" />);

    const group = screen.getByRole("radiogroup", {
      name: "Pull Requests display",
    });
    expect(
      [...group.querySelectorAll('[role="radio"]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Auto", "Shown", "Hidden"]);
  });

  it("keeps the tri-state radiogroup for the other hinted panel too (Comments)", () => {
    expect(regionFacts("railComments").hint).not.toBeNull();

    render(<LiveDisplayControl regionId="railComments" />);

    const group = screen.getByRole("radiogroup", {
      name: "Comments display",
    });
    expect(
      [...group.querySelectorAll('[role="radio"]')].map(
        (node) => node.textContent,
      ),
    ).toEqual(["Auto", "Shown", "Hidden"]);
  });
});

describe("a region with no `shown` leaf at all (regionHides false)", () => {
  it("gives Access Icon and label/Icon only only, no Hidden", () => {
    render(<LiveDisplayControl regionId="access" />);

    const options = screen
      .getAllByRole("radio")
      .map((option) => option.textContent);
    expect(options).toEqual(["Icon and label", "Icon only"]);
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

  it("is absent in the installed mobile app", () => {
    setMobileApp(true);
    render(<LiveDisplayControl regionId="mic" />);
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("disables every option and names the reason when voice input is off", () => {
    useSettingsStore.setState({ voiceInputEnabled: false });
    render(<LiveDisplayControl regionId="mic" />);

    const options = screen.getAllByRole("radio");
    expect(options.every((option) => option.hasAttribute("disabled"))).toBe(
      true,
    );
    const describedById = options[0]?.getAttribute("aria-describedby");
    expect(describedById).not.toBeNull();
    expect(document.getElementById(describedById as string)?.textContent).toBe(
      "Enable Voice input in General settings to show the microphone.",
    );
  });
});
