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
import {
  DEFAULT_ARRANGEMENT,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useSideTabStripStore } from "@/stores/layout/side-tab-strip-store";
import { useSettingsStore } from "@/stores/settings/settings-store";

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
  useSettingsStore.setState({ taskTabLayout: "scroll" });
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
  useSideTabStripStore.setState({ collapsed: false });
});

afterEach(() => {
  cleanup();
  useSettingsStore.setState({ taskTabLayout: "scroll" });
  useLayoutEditorStore.getState().endSession();
  useSideTabStripStore.setState({ collapsed: false });
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

    // Default shows every dock member at full size, so this card is the one
    // that had a bordered rounded-top box per row inside a further one.
    const dock = within(card("Default")).getByTestId("app-frame-dock");
    const frames = dock.querySelectorAll('[data-layout-depiction="dock"]');
    expect(frames).toHaveLength(1);
    // The rows are that frame's own children, which is the other half of the
    // claim: one frame drawn around nothing would pass the count alone. Read
    // off the arrangement, so the two members L-142 added move it with them.
    expect(frames[0]?.childElementCount).toBe(DEFAULT_ARRANGEMENT.dock.length);
    expect(DEFAULT_ARRANGEMENT.dock.length).toBeGreaterThan(1);
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

// Finding 5: `MiniaturePanel` draws the same sample rows through the shared
// `AppFrameLiveAgentItems` the Activity depiction uses, so the preset card's
// panel cannot show a different row anatomy than that other picture does.
describe("the preset miniature's panel (L-43): live agent row anatomy", () => {
  it("shows the same nested indent, waiting chip and idle time as the Activity depiction", () => {
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      const plan = within(miniature)
        .getByText("Plan the migration")
        .closest("button");
      const tests = within(miniature)
        .getByText("Write the tests")
        .closest("button");
      const index = within(miniature)
        .getByText("Rebuild the index")
        .closest("button");
      if (plan === null || tests === null || index === null) {
        throw new Error("expected all three sample rows to render as buttons");
      }

      const depth0 = Number.parseInt(plan.style.paddingInlineStart, 10);
      expect(Number.parseInt(index.style.paddingInlineStart, 10)).toBe(depth0);
      expect(Number.parseInt(tests.style.paddingInlineStart, 10) - depth0).toBe(
        16,
      ); // INDENT_PX

      expect(
        within(plan).getByTestId("strip-live-agent-waiting-chip").textContent,
      ).toBe("Reply");
      expect(within(plan).queryByTestId("chat-row-idle-time")).toBeNull();
      for (const row of [tests, index]) {
        expect(
          within(row).queryByTestId("strip-live-agent-waiting-chip"),
        ).toBeNull();
        expect(within(row).getByTestId("chat-row-idle-time")).toBeTruthy();
      }
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
    useSettingsStore.setState({ taskTabLayout: "shrink" });
    render(<PresetsBlock onPreviewPreset={() => {}} />);
    useLayoutEditorStore.getState().beginSession({
      entry: "pointer",
      source: "direct_ui",
      startedAt: 0,
    });

    fireEvent.click(resetButton());

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(useLayoutStore.getState().basePreset).toBe("default");
    expect(useSettingsStore.getState().taskTabLayout).toBe("shrink");

    // The safety net the modal was standing in for: one gesture, one step.
    useLayoutEditorStore.getState().undo();
    expect(useLayoutStore.getState().basePreset).toBe("compact");
  });

  it("resets task tab layout on the page even when the layout snapshot is default", () => {
    useSettingsStore.setState({ taskTabLayout: "shrink" });
    render(
      <LayoutFormHostContext value="page">
        <ResetEverythingButton snapshot={getLayoutSnapshot()} />
      </LayoutFormHostContext>,
    );

    fireEvent.click(resetButton());
    const dialog = screen.getByRole("dialog");
    expect(useSettingsStore.getState().taskTabLayout).toBe("shrink");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Reset everything" }),
    );
    expect(useSettingsStore.getState().taskTabLayout).toBe("scroll");
  });

  it("keeps task tab layout when applying a preset", () => {
    useSettingsStore.setState({ taskTabLayout: "shrink" });
    render(
      <LayoutFormHostContext value="page">
        <PresetsBlock onPreviewPreset={() => {}} />
      </LayoutFormHostContext>,
    );

    fireEvent.click(card("Compact"));

    expect(useLayoutStore.getState().basePreset).toBe("compact");
    expect(useSettingsStore.getState().taskTabLayout).toBe("shrink");
  });
});

/**
 * S-01, S-06, S-29: the miniature is a picture of the STORED arrangement, not
 * a fixed layout - it follows the tab strip placement and the sidebar side,
 * and a preset click (which is values-only, L-20) never moves either.
 */
describe("the miniature follows the stored placement and sidebar side", () => {
  function setArrangement(overrides: Partial<LayoutArrangement>): void {
    useLayoutStore.setState({
      ...DEFAULT_LAYOUT_SNAPSHOT,
      arrangement: { ...DEFAULT_ARRANGEMENT, ...overrides },
      layoutCarryDone: true,
    });
  }

  it.each(["left", "right"] as const)(
    "draws the side strip at the stored %s edge, positioned there, with no top bar left behind",
    (edge) => {
      setArrangement({ tabStripPlacement: edge });
      render(<PresetsBlock onPreviewPreset={() => {}} />);

      for (const miniature of miniatures()) {
        const strip = within(miniature).getByTestId("app-frame-side-strip");
        const wrapper = strip.parentElement;
        const row = wrapper?.parentElement ?? null;
        if (wrapper === null || row === null) {
          throw new Error("expected the strip's width wrapper and its row");
        }
        // Position in the row is an output independent of the wrapper's own
        // border class - a strip on the wrong side with the right class
        // would still fail this.
        expect(
          edge === "left" ? row.firstElementChild : row.lastElementChild,
        ).toBe(wrapper);
        // No top bar left mounted alongside the strip.
        expect(frameOf(miniature).querySelector(".h-10.border-b")).toBeNull();
      }
    },
  );

  it("keeps the top bar, on the ground with no border, and draws no side strip, for the stored `top` placement", () => {
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      expect(
        within(miniature).queryByTestId("app-frame-side-strip"),
      ).toBeNull();
      const topBar = frameOf(miniature).querySelector(
        ".h-10.shrink-0.items-center",
      );
      expect(topBar).not.toBeNull();
      // The bar sits on the shell's own ground now, not a bordered band.
      expect(topBar?.classList.contains("border-b")).toBe(false);
    }
  });

  it.each(["left", "right"] as const)(
    "orders the task panel sheet relative to the content sheet for a %s sidebar, whatever the strip's placement",
    (side) => {
      setArrangement({ sidebarSide: side, tabStripPlacement: "right" });
      render(<PresetsBlock onPreviewPreset={() => {}} />);

      for (const miniature of miniatures()) {
        const surface = within(miniature).getByTestId(
          "preset-miniature-surface",
        );
        const sheet = surface.querySelector<HTMLElement>(
          '[data-shell-sheet="task"]',
        );
        if (sheet === null) throw new Error("expected the one task sheet");
        // No per-pane marker any more (one-sheet design): the panel is the
        // rail's own parent pane, and the content pane is the sheet's other
        // direct child.
        const panel = within(sheet).getByTestId(
          "preset-miniature-rail",
        ).parentElement;
        const content = [...sheet.children].find((child) => child !== panel);
        if (panel === null || content === undefined) {
          throw new Error("expected both the panel and content sheets");
        }
        expect(
          side === "left"
            ? panel.nextElementSibling
            : panel.previousElementSibling,
        ).toBe(content);
        // The rail still lives across the panel's own top, whichever side it lands on.
        expect(
          within(panel).getByTestId("preset-miniature-rail"),
        ).not.toBeNull();
      }
    },
  );

  it("follows the collapsed store flag: a 60px strip collapsed, 240px expanded", () => {
    setArrangement({ tabStripPlacement: "left" });
    useSideTabStripStore.setState({ collapsed: true });
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      const strip = within(miniature).getByTestId("app-frame-side-strip");
      const wrapper = strip.parentElement;
      if (wrapper === null) {
        throw new Error("expected the strip's width wrapper");
      }
      expect(wrapper.style.width).toBe("60px");
    }
    cleanup();

    useSideTabStripStore.setState({ collapsed: false });
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      const strip = within(miniature).getByTestId("app-frame-side-strip");
      const wrapper = strip.parentElement;
      if (wrapper === null) {
        throw new Error("expected the strip's width wrapper");
      }
      expect(wrapper.style.width).toBe("240px");
    }
  });

  it("gives the miniature's one task sheet its data-shell-sheet marker", () => {
    setArrangement({ sidebarSide: "left" });
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const miniature of miniatures()) {
      const surface = within(miniature).getByTestId("preset-miniature-surface");
      const sheets = [
        ...surface.querySelectorAll<HTMLElement>("[data-shell-sheet]"),
      ];
      // One-sheet design: the marker sits once, on the box holding both
      // panes, not on the panel and content panes separately.
      expect(sheets.map((sheet) => sheet.dataset.shellSheet)).toEqual(["task"]);
    }
  });

  it("never moves the placement or the sidebar side when a preset is clicked, and each click still lands (L-20, S-29)", () => {
    setArrangement({ tabStripPlacement: "left", sidebarSide: "right" });
    render(<PresetsBlock onPreviewPreset={() => {}} />);

    for (const presetId of ["Compact", "Detailed", "Default"]) {
      fireEvent.click(card(presetId));
      expect(useLayoutStore.getState().basePreset).toBe(presetId.toLowerCase());
      expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe(
        "left",
      );
      expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("right");
      for (const miniature of miniatures()) {
        expect(
          within(miniature).queryByTestId("app-frame-side-strip"),
        ).not.toBeNull();
      }
    }
  });
});
