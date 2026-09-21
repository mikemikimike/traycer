import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PresetsBlock } from "@/components/layout-editor/inspector/presets-block";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

function miniatures(): ReadonlyArray<HTMLElement> {
  return screen.getAllByTestId("preset-miniature");
}

function frameOf(miniature: HTMLElement): HTMLElement {
  const frame = miniature.firstElementChild;
  if (!(frame instanceof HTMLElement)) {
    throw new Error("expected the scaled frame inside the miniature box");
  }
  return frame;
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

describe("the preset miniature (L-43, I-03, I-18)", () => {
  it("is a picture of the app rather than an empty frame", () => {
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      const text = miniature.textContent;
      // A transcript, real tab labels and a composer: the three things whose
      // absence left ~60% of the card flat `bg-card`, which every dark preset
      // defines identically to `--background`.
      expect(text).toContain("Make the task list easier to scan.");
      expect(text).toContain("Sample chat");
      expect(text).toContain("Describe the next change...");
    }
  });

  it("stays uniformly scaled: one transform on one frame", () => {
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      const frame = frameOf(miniature);
      expect(frame.style.transform).toMatch(/^scale\(/);
      expect(frame.style.width).toBe("1000px");
      expect(frame.style.height).toBe("620px");
    }
  });

  it("places the dock the way the app places it (L-97)", () => {
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    const docks = screen.getAllByTestId("preset-dock");
    expect(docks.length).toBeGreaterThan(0);
    let framed = 0;
    let chipped = 0;
    for (const dock of docks) {
      // The rows are ONE frame, not a card each, and it is the last thing
      // before the composer - which is what the tuck under it is made of.
      const frames = within(dock).queryAllByTestId("preset-dock-frame");
      expect(frames.length).toBeLessThan(2);
      const composer = dock.nextElementSibling;
      expect(composer?.getAttribute("data-testid")).toBe("preset-composer");

      const chips = within(dock).queryAllByTestId("preset-dock-chips");
      if (frames.length === 1) {
        framed += 1;
        expect(dock.lastElementChild).toBe(frames[0]);
      }
      if (chips.length === 1) {
        chipped += 1;
        // Pills above, at the composer's left edge.
        expect(dock.firstElementChild).toBe(chips[0]);
      }
    }
    // The cards differ by density and by nothing else, so both shapes have to
    // be on screen for the comparison to say anything (G1-02).
    expect(framed).toBeGreaterThan(0);
    expect(chipped).toBeGreaterThan(0);
  });

  it("draws at the seeded ratio when the box has not been measured", () => {
    // jsdom reports `clientWidth` 0 for every element, which is the same
    // reading a collapsed group or a hidden tab gives in the browser. Taking
    // it would have been `scale(0)` - a card that renders nothing at all
    // (I-18).
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      expect(frameOf(miniature).style.transform).toBe("scale(0.081)");
    }
  });
});
