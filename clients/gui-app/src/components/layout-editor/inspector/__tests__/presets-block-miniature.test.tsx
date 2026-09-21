import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  PresetsBlock,
  ResetEverythingButton,
} from "@/components/layout-editor/inspector/presets-block";
import { LayoutFormHostContext } from "@/components/layout-editor/inspector/layout-form-host";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
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

/** The card for one preset, which is the control the miniature sits inside. */
function card(preset: string): HTMLElement {
  return screen.getByRole("button", { name: `${preset} preset` });
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

    const docks = screen.getAllByTestId("app-frame-dock");
    expect(docks.length).toBeGreaterThan(0);
    let framed = 0;
    let chipped = 0;
    for (const dock of docks) {
      // The rows are ONE frame, and it is the last thing before the composer -
      // which is what the tuck under it is made of.
      const frames = dock.querySelectorAll('[data-layout-depiction="dock"]');
      expect(frames.length).toBeLessThan(2);
      const composer = dock.nextElementSibling;
      expect(composer?.getAttribute("data-testid")).toBe("app-frame-composer");

      const chips = within(dock).queryAllByTestId("app-frame-dock-chips");
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

  it("draws a multi-row dock as ONE joined frame, not a card per row (R1-01)", () => {
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    // Default shows all three dock members at full size, so this card is the
    // one that had three bordered rounded-top boxes inside a fourth.
    const dock = within(card("Default")).getByTestId("app-frame-dock");
    const frames = dock.querySelectorAll('[data-layout-depiction="dock"]');
    expect(frames).toHaveLength(1);
    // The rows are that frame's own children, which is the other half of the
    // claim: one frame drawn around nothing would pass the count alone.
    expect(frames[0]?.childElementCount).toBe(3);
  });

  it("draws at a real ratio when the box has not been measured", () => {
    // jsdom reports `clientWidth` 0 for every element, which is the same
    // reading a collapsed group or a hidden tab gives in the browser. Taking
    // it would have been `scale(0)` - a card that renders nothing at all
    // (I-18). The seeded ratio itself is tunable; a card drawing SOMETHING is
    // not.
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      const scale = Number(
        /^scale\(([^)]+)\)$/.exec(frameOf(miniature).style.transform)?.[1],
      );
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThan(1);
    }
  });
});

describe('"Reset everything" is confirmed only where it cannot be undone (L-20, R1-07)', () => {
  function changeTheLayout(): void {
    useLayoutStore.setState({
      ...DEFAULT_LAYOUT_SNAPSHOT,
      basePreset: "compact",
      layoutCarryDone: true,
    });
  }

  function resetButton(): HTMLElement {
    return screen.getByRole("button", { name: "Reset everything" });
  }

  it("leaves the presets card on the page, where it is the danger card's", () => {
    changeTheLayout();
    render(
      <LayoutFormHostContext value="page">
        <PresetsBlock onPreviewPreset={() => {}} />
      </LayoutFormHostContext>,
    );

    // The one irreversible action on the page is last on it, in a
    // `tone="danger"` card of its own (redesign 4.4) - not a `size="sm"`
    // muted button beside "Reset to Compact". The page renders its own; the
    // card and its placement are pinned in the panel's suite.
    expect(
      screen.queryByRole("button", { name: "Reset everything" }),
    ).toBeNull();
  });

  it("keeps the benign counterpart on that card, in both hosts", () => {
    changeTheLayout();
    useLayoutStore.getState().setRegionValues("homeTab", { shown: "shown" });
    render(
      <LayoutFormHostContext value="page">
        <PresetsBlock onPreviewPreset={() => {}} />
      </LayoutFormHostContext>,
    );

    // "Reset to <preset>" is values-only and reversible, so it stays beside
    // the preset it names - and it has something of its own to do now that a
    // preset click no longer clears the delta (L-133).
    expect(
      screen.getByRole("button", { name: "Reset to Compact" }),
    ).toBeTruthy();
    expect(screen.getByTestId("preset-status-line").textContent).toBe(
      "Compact + 1 change",
    );
  });

  it("asks first on the Settings page, where there is no Undo", () => {
    changeTheLayout();
    render(
      <LayoutFormHostContext value="page">
        <ResetEverythingButton snapshot={getLayoutSnapshot()} />
      </LayoutFormHostContext>,
    );

    fireEvent.click(resetButton());

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Reset the whole layout?")).toBeTruthy();
    // Nothing has happened yet: the sentence the dialog shows is only true
    // while the write is still in front of the user.
    expect(useLayoutStore.getState().basePreset).toBe("compact");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset everything" }),
    );
    expect(useLayoutStore.getState().basePreset).toBe("default");
  });

  it("applies straight away in the docked inspector, where Undo puts it back", () => {
    changeTheLayout();
    render(<PresetsBlock onPreviewPreset={() => {}} />);
    useLayoutEditorStore.getState().beginSession({
      entry: "pointer",
      source: "direct_ui",
      startedAt: 0,
    });

    fireEvent.click(resetButton());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useLayoutStore.getState().basePreset).toBe("default");

    // The safety net the modal was standing in for: one gesture, one step.
    useLayoutEditorStore.getState().undo();
    expect(useLayoutStore.getState().basePreset).toBe("compact");
  });
});
