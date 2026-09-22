import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createRef, type ComponentPropsWithRef, type ReactNode } from "react";
import {
  SideTabRow,
  type SideTabRowClose,
  type SideTabRowProps,
} from "../side-strip/side-tab-row";
import { SideSplitRowPair } from "../side-strip/side-split-row-pair";
import {
  SIDE_SPLIT_PAIR_CLASS,
  SIDE_TAB_ACTIVE_CLASS,
  SIDE_TAB_COLORLESS_TILE_CLASS,
  SIDE_TAB_GROUP_LINE_CLASS,
  SIDE_TAB_LEADING_CLASS,
  SIDE_TAB_ROW_CLASS,
  SIDE_TAB_SESSION_ACTIVE_CLASS,
  SIDE_TAB_TILE_ACTIVE_CLASS,
  SIDE_TAB_TILE_CLASS,
  SIDE_TAB_TILE_HOVER_CLASS,
  SIDE_TAB_TINT_FILL_CLASS,
} from "../side-strip/side-strip-tokens";
import { SESSION_TAB_LABEL_CLASS } from "../header-tab-visual";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ROW_TEST_ID = "tab-epic-e1";

/** A frame fixture: the div props plus the data attributes the strip sets. */
type Frame = ComponentPropsWithRef<"div"> & {
  readonly [key: `data-${string}`]: string;
};

function closeControl(onClose: () => void): SideTabRowClose {
  return {
    label: "Close Fix login",
    testId: "tab-close-epic-e1",
    disabled: false,
    onClose,
  };
}

function rowFrame(extra: Frame): Frame {
  return { "data-testid": ROW_TEST_ID, ...extra };
}

function baseProps(): SideTabRowProps {
  return {
    frame: rowFrame({}),
    variant: "expanded",
    active: false,
    session: null,
    tint: null,
    groupLine: null,
    leading: <span data-testid="leading-glyph" />,
    tile: { kind: "monogram", text: "FL" },
    badge: null,
    title: "Fix login",
    titleText: "Fix login",
    leaderBadge: null,
    close: null,
    waitingLabel: null,
    dropIndicator: null,
    pairPreview: null,
    dragSource: false,
  };
}

function renderRow(overrides: Partial<SideTabRowProps>): HTMLElement {
  render(<SideTabRow {...baseProps()} {...overrides} />);
  return screen.getByTestId(ROW_TEST_ID);
}

function hasClasses(element: Element, classes: string): boolean {
  return classes.split(" ").every((token) => element.classList.contains(token));
}

function closeWrapper(): HTMLElement {
  const wrapper = screen.getByTestId("tab-close-epic-e1").parentElement;
  if (wrapper === null) throw new Error("expected the close wrapper");
  return wrapper;
}

function trailing(row: HTMLElement): HTMLElement {
  const slot = row.querySelector<HTMLElement>(
    '[data-testid="side-tab-trailing"]',
  );
  if (slot === null) throw new Error("expected a trailing slot");
  return slot;
}

describe("SideTabRow expanded trailing slot", () => {
  const leader: ReactNode = <span data-testid="leader-badge">1</span>;

  it("shows the leader badge over the close and the chip", () => {
    for (const active of [true, false]) {
      const row = renderRow({
        active,
        leaderBadge: leader,
        close: closeControl(() => {}),
        waitingLabel: "Approve",
      });
      const slot = trailing(row);
      expect(slot.querySelector('[data-testid="leader-badge"]')).not.toBeNull();
      expect(screen.queryByTestId("tab-close-epic-e1")).toBeNull();
      expect(screen.queryByTestId("side-tab-waiting-chip")).toBeNull();
      cleanup();
    }
  });

  it("shows the close on the active row without hover, and no chip", () => {
    renderRow({
      active: true,
      close: closeControl(() => {}),
      waitingLabel: "Reply",
    });
    const wrapper = closeWrapper();
    expect(wrapper.dataset.revealed).toBe("always");
    expect(wrapper.classList.contains("opacity-0")).toBe(false);
    expect(wrapper.classList.contains("pointer-events-none")).toBe(false);
    expect(screen.queryByTestId("side-tab-waiting-chip")).toBeNull();
  });

  it("reveals the close on hover or keyboard focus on an inactive row", () => {
    renderRow({ active: false, close: closeControl(() => {}) });
    const wrapper = closeWrapper();
    expect(wrapper.dataset.revealed).toBe("on-hover-or-focus");
    expect(hasClasses(wrapper, "pointer-events-none opacity-0")).toBe(true);
    expect(
      hasClasses(
        wrapper,
        "group-hover/side-tab:opacity-100 group-focus-visible/side-tab:opacity-100 group-has-[:focus-visible]/side-tab:opacity-100",
      ),
    ).toBe(true);
    expect(wrapper.className).not.toContain("header-tab");
  });

  it("keeps the chip at rest and swaps it for the close on reveal", () => {
    renderRow({
      active: false,
      close: closeControl(() => {}),
      waitingLabel: "Approve",
    });
    const chip = screen.getByTestId("side-tab-waiting-chip");
    expect(chip.textContent).toBe("Approve");
    const chipCell = chip.parentElement;
    expect(
      chipCell !== null &&
        hasClasses(
          chipCell,
          "col-start-1 row-start-1 group-hover/side-tab:opacity-0 group-has-[:focus-visible]/side-tab:opacity-0",
        ),
    ).toBe(true);
    expect(hasClasses(closeWrapper(), "col-start-1 row-start-1")).toBe(true);
  });

  it.each(["Approve", "Reply"] as const)(
    "shows the %s chip when there is no close",
    (label) => {
      renderRow({ waitingLabel: label });
      const chip = screen.getByTestId("side-tab-waiting-chip");
      expect(chip.textContent).toBe(label);
      expect(chip.dataset.variant).toBe("warning");
      expect(chip.parentElement?.className).not.toContain("opacity-0");
    },
  );

  it("renders an empty trailing slot when nothing applies", () => {
    const row = renderRow({});
    expect(trailing(row).childElementCount).toBe(0);
  });

  it("closes without activating the row", () => {
    const onClose = vi.fn();
    const onRowClick = vi.fn();
    renderRow({
      active: true,
      close: closeControl(onClose),
      frame: rowFrame({ onClick: onRowClick }),
    });
    fireEvent.click(screen.getByTestId("tab-close-epic-e1"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onRowClick).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: "Close Fix login" }),
    ).toBeTruthy();
  });
});

function byTestId(root: HTMLElement, testId: string): HTMLElement {
  const element = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (element === null) throw new Error(`expected ${testId}`);
  return element;
}

function hoverCard(): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    '[data-slot="hover-card-content"]',
  );
}

function dwell(row: HTMLElement): void {
  fireEvent.pointerEnter(row, { pointerType: "mouse" });
  act(() => {
    vi.advanceTimersByTime(1000);
  });
}

describe("SideTabRow expanded paint", () => {
  it("lays out leading, title, trailing in that order", () => {
    const row = renderRow({});
    const order = Array.from(row.children)
      .map((child) => child.getAttribute("data-testid"))
      .filter((id) => id !== null);
    expect(order).toEqual([
      "side-tab-leading",
      "side-tab-title",
      "side-tab-trailing",
    ]);
    expect(hasClasses(row, SIDE_TAB_ROW_CLASS)).toBe(true);
  });

  it("fades a string title and keeps a rename input as given", () => {
    const row = renderRow({});
    expect(row.querySelector(".header-tab-title-text")?.textContent).toBe(
      "Fix login",
    );
    cleanup();
    const renamed = renderRow({
      title: <input data-testid="rename-input" defaultValue="Fix login" />,
    });
    expect(
      renamed.querySelector('[data-testid="rename-input"]'),
    ).not.toBeNull();
    expect(renamed.querySelector(".header-tab-title-text")).toBeNull();
  });

  it("shows the status glyph alone for a tab with neither icon nor colour", () => {
    const row = renderRow({ tint: null, badge: "running" });
    const leading = byTestId(row, "side-tab-leading");
    expect(leading.dataset.leading).toBe("glyph");
    expect(hasClasses(leading, SIDE_TAB_LEADING_CLASS)).toBe(true);
    expect(
      leading.querySelector('[data-testid="leading-glyph"]'),
    ).not.toBeNull();
    expect(
      row.querySelector('[data-testid="side-tab-leading-tile"]'),
    ).toBeNull();
    expect(row.querySelector('[data-testid="side-tab-rail-badge"]')).toBeNull();
  });

  it("shows a coloured tab's monogram on a tinted 16px tile with the corner badge", () => {
    const row = renderRow({ tint: "#3366ff", badge: "failed" });
    const leading = byTestId(row, "side-tab-leading");
    expect(leading.dataset.leading).toBe("tile");
    expect(hasClasses(leading, SIDE_TAB_LEADING_CLASS)).toBe(true);
    expect(leading.querySelector('[data-testid="leading-glyph"]')).toBeNull();
    const tile = byTestId(row, "side-tab-leading-tile");
    expect(tile.textContent).toBe("FL");
    expect(tile.dataset.tinted).toBe("true");
    expect(hasClasses(tile, SIDE_TAB_TINT_FILL_CLASS)).toBe(true);
    expect(tile.style.getPropertyValue("--side-tab-tint")).toBe("#3366ff");
    expect(byTestId(leading, "side-tab-rail-badge").dataset.kind).toBe(
      "failed",
    );
  });

  it("shows a custom icon on its tile, neutral when the tab has no colour", () => {
    const row = renderRow({
      tint: null,
      tile: { kind: "icon", icon: <span data-testid="custom-icon">🚀</span> },
      badge: "waiting",
    });
    const tile = byTestId(row, "side-tab-leading-tile");
    expect(tile.querySelector('[data-testid="custom-icon"]')).not.toBeNull();
    expect(tile.dataset.tinted).toBe("false");
    expect(hasClasses(tile, SIDE_TAB_COLORLESS_TILE_CLASS)).toBe(true);
    expect(tile.style.getPropertyValue("--side-tab-tint")).toBe("");
    expect(byTestId(row, "side-tab-rail-badge").dataset.kind).toBe("waiting");
  });

  it("fills the active row and not an inactive one", () => {
    const active = renderRow({ active: true });
    expect(hasClasses(active, SIDE_TAB_ACTIVE_CLASS)).toBe(true);
    cleanup();
    const idle = renderRow({ active: false });
    expect(hasClasses(idle, SIDE_TAB_ACTIVE_CLASS)).toBe(false);
  });

  it("draws the group colour line outside the fill, joined across the gap", () => {
    const row = renderRow({ groupLine: "#ff8800", active: true });
    const line = byTestId(row, "side-tab-group-line");
    expect(line.style.getPropertyValue("--side-tab-group-line")).toBe(
      "#ff8800",
    );
    expect(hasClasses(line, SIDE_TAB_GROUP_LINE_CLASS)).toBe(true);
    expect(line.className).not.toContain("rounded");
  });

  it("keeps the hover card closed while expanded", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const row = renderRow({});
    dwell(row);
    expect(hoverCard()).toBeNull();
  });
});

describe("SideTabRow collapsed", () => {
  it("renders no trailing slot, even active, with a close and with focus", () => {
    const row = renderRow({
      variant: "collapsed",
      active: true,
      close: closeControl(() => {}),
      waitingLabel: "Approve",
      leaderBadge: <span data-testid="leader-badge">1</span>,
      frame: rowFrame({ tabIndex: 0 }),
    });
    act(() => row.focus());
    expect(row.querySelector('[data-testid="side-tab-trailing"]')).toBeNull();
    expect(screen.queryByTestId("tab-close-epic-e1")).toBeNull();
    expect(screen.queryByTestId("side-tab-waiting-chip")).toBeNull();
    expect(screen.queryByTestId("leader-badge")).toBeNull();
    expect(row.querySelector('[data-testid="side-tab-leading"]')).toBeNull();
  });

  it("is the 32px tile itself, with active drawn as an inset ring on the tile", () => {
    const row = renderRow({
      variant: "collapsed",
      active: true,
      tint: "#22aa66",
    });
    expect(hasClasses(row, SIDE_TAB_TILE_CLASS)).toBe(true);
    expect(hasClasses(row, SIDE_TAB_TILE_ACTIVE_CLASS)).toBe(true);
    expect(hasClasses(row, SIDE_TAB_ACTIVE_CLASS)).toBe(false);
    expect(hasClasses(row, SIDE_TAB_ROW_CLASS)).toBe(false);
    cleanup();
    const idle = renderRow({ variant: "collapsed", active: false });
    expect(hasClasses(idle, SIDE_TAB_TILE_HOVER_CLASS)).toBe(true);
    expect(hasClasses(idle, SIDE_TAB_TILE_ACTIVE_CLASS)).toBe(false);
  });

  it("tints the monogram tile with the tab colour", () => {
    const row = renderRow({ variant: "collapsed", tint: "#22aa66" });
    expect(row.dataset.tileKind).toBe("monogram");
    expect(row.dataset.tinted).toBe("true");
    expect(row.textContent).toBe("FL");
    expect(row.style.getPropertyValue("--side-tab-tint")).toBe("#22aa66");
    expect(hasClasses(row, SIDE_TAB_TINT_FILL_CLASS)).toBe(true);
    expect(hasClasses(row, SIDE_TAB_ACTIVE_CLASS)).toBe(false);
  });

  it("gives a colourless tab the neutral tile", () => {
    const row = renderRow({
      variant: "collapsed",
      tint: null,
      tile: { kind: "icon", icon: <svg data-testid="custom-icon" /> },
    });
    expect(row.dataset.tileKind).toBe("icon");
    expect(row.dataset.tinted).toBe("false");
    expect(hasClasses(row, SIDE_TAB_COLORLESS_TILE_CLASS)).toBe(true);
    expect(row.style.getPropertyValue("--side-tab-tint")).toBe("");
    expect(row.querySelector('[data-testid="custom-icon"]')).not.toBeNull();
  });

  it("shows a neutral tile with the muted spinner while the title generates", () => {
    const row = renderRow({
      variant: "collapsed",
      tint: "#22aa66",
      tile: { kind: "generating" },
    });
    expect(row.dataset.tileKind).toBe("generating");
    expect(hasClasses(row, SIDE_TAB_COLORLESS_TILE_CLASS)).toBe(true);
    expect(hasClasses(row, SIDE_TAB_TINT_FILL_CLASS)).toBe(false);
    const spinner = screen.getByTestId("side-tab-tile-generating");
    expect(spinner.classList.contains("text-muted-foreground")).toBe(true);
    expect(row.textContent).not.toContain("FL");
  });

  it("puts the one badge on the tile", () => {
    const row = renderRow({ variant: "collapsed", badge: "waiting" });
    expect(byTestId(row, "side-tab-rail-badge").dataset.kind).toBe("waiting");
    cleanup();
    const quiet = renderRow({ variant: "collapsed", badge: null });
    expect(
      quiet.querySelector('[data-testid="side-tab-rail-badge"]'),
    ).toBeNull();
  });

  it("opens the full title as a hover card on the content-facing side", () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    for (const [edge, side] of [
      ["left", "right"],
      ["right", "left"],
    ] as const) {
      render(
        <div data-edge={edge}>
          <SideTabRow
            {...baseProps()}
            variant="collapsed"
            titleText="Fix the login bug on Safari"
          />
        </div>,
      );
      dwell(screen.getByTestId(ROW_TEST_ID));
      const card = hoverCard();
      expect(card?.textContent).toBe("Fix the login bug on Safari");
      expect(card?.dataset.side).toBe(side);
      cleanup();
    }
  });

  it.each([
    ["the drag source", { dragSource: true }],
    ["a drop target", { dropIndicator: "before" }],
    ["a pair target", { pairPreview: "left" }],
  ] as const)("keeps the hover card closed on %s", (_name, dragState) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const row = renderRow({ variant: "collapsed", ...dragState });
    dwell(row);
    expect(hoverCard()).toBeNull();
  });

  it("keeps the same row element when the variant changes", () => {
    const ref = createRef<HTMLDivElement>();
    const { rerender } = render(
      <SideTabRow {...baseProps()} frame={rowFrame({ ref })} />,
    );
    const expandedRow = ref.current;
    rerender(
      <SideTabRow
        {...baseProps()}
        variant="collapsed"
        frame={rowFrame({ ref })}
      />,
    );
    expect(ref.current).not.toBeNull();
    expect(ref.current).toBe(expandedRow);
    expect(ref.current?.dataset.sideTab).toBe("collapsed");
  });
});

describe("SideTabRow session row", () => {
  it("fills the active session row and keeps its marker lit", () => {
    const row = renderRow({ session: "active", active: true, tint: "#f5a524" });
    expect(hasClasses(row, SIDE_TAB_SESSION_ACTIVE_CLASS)).toBe(true);
    expect(hasClasses(row, SESSION_TAB_LABEL_CLASS)).toBe(true);
    expect(hasClasses(row, SIDE_TAB_ACTIVE_CLASS)).toBe(false);
    const marker = row.querySelector<HTMLElement>("[data-layout-session-tab]");
    expect(marker?.dataset.layoutSessionTab).toBe("filled");
    expect(marker?.dataset.orientation).toBe("vertical");
  });

  it("carries the resting cap in the tab colour", () => {
    const row = renderRow({ session: "rest", tint: "#f5a524" });
    const marker = row.querySelector<HTMLElement>("[data-layout-session-tab]");
    expect(marker?.dataset.layoutSessionTab).toBe("rest");
    expect(marker?.dataset.orientation).toBe("vertical");
    expect(marker?.style.getPropertyValue("--layout-session-tab-color")).toBe(
      "#f5a524",
    );
    expect(hasClasses(row, SIDE_TAB_SESSION_ACTIVE_CLASS)).toBe(false);
  });

  it("renders no marker on an ordinary tab", () => {
    const row = renderRow({ session: null });
    expect(row.querySelector("[data-layout-session-tab]")).toBeNull();
  });
});

describe("SideTabRow drag states", () => {
  it.each([
    ["before", "-top-0.5"],
    ["after", "-bottom-0.5"],
  ] as const)("draws the %s drop line at the row edge", (side, edgeClass) => {
    const row = renderRow({ dropIndicator: side });
    const indicator = row.querySelector<HTMLElement>(
      '[data-testid="tab-drop-indicator"]',
    );
    expect(indicator?.dataset.side).toBe(side);
    expect(indicator?.classList.contains(edgeClass)).toBe(true);
    expect(indicator?.firstElementChild?.classList.contains("h-0.5")).toBe(
      true,
    );
  });

  it.each([
    ["left", "top-1 bottom-1/2"],
    ["right", "top-1/2 bottom-1"],
  ] as const)("highlights the %s pair-preview half", (side, halfClasses) => {
    const row = renderRow({ pairPreview: side });
    const preview = row.querySelector<HTMLElement>(
      '[data-testid="side-tab-pair-preview"]',
    );
    expect(preview?.dataset.side).toBe(side);
    expect(preview !== null && hasClasses(preview, halfClasses)).toBe(true);
    expect(
      preview !== null &&
        hasClasses(preview, "bg-primary/20 ring-2 ring-primary"),
    ).toBe(true);
  });

  it("draws neither when idle", () => {
    const row = renderRow({});
    expect(row.querySelector('[data-testid="tab-drop-indicator"]')).toBeNull();
    expect(
      row.querySelector('[data-testid="side-tab-pair-preview"]'),
    ).toBeNull();
  });

  it("hides the drag source's paint without removing it", () => {
    const row = renderRow({ dragSource: true });
    expect(row.classList.contains("opacity-0")).toBe(true);
    expect(row.querySelector('[data-testid="side-tab-title"]')).not.toBeNull();
  });
});

describe("SideTabRow frame", () => {
  it("spreads the frame's props, handlers and ref onto the row element", () => {
    const ref = createRef<HTMLDivElement>();
    const onKeyDown = vi.fn();
    const onPointerDown = vi.fn();
    render(
      <SideTabRow
        {...baseProps()}
        frame={rowFrame({
          ref,
          role: "tab",
          "aria-selected": true,
          "aria-label": "Fix login",
          tabIndex: 0,
          "data-strip-item-id": "epic:e1",
          className: "extra-frame-class",
          onKeyDown,
          onPointerDown,
        })}
      />,
    );
    const row = screen.getByRole("tab", { name: "Fix login" });
    expect(row).toBe(ref.current);
    expect(row.dataset.testid).toBe(ROW_TEST_ID);
    expect(row.dataset.stripItemId).toBe("epic:e1");
    expect(row.getAttribute("aria-selected")).toBe("true");
    expect(row.tabIndex).toBe(0);
    expect(row.classList.contains("extra-frame-class")).toBe(true);
    expect(row.classList.contains("group/side-tab")).toBe(true);
    fireEvent.keyDown(row, { key: "Enter" });
    fireEvent.pointerDown(row);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});

describe("SideSplitRowPair", () => {
  it.each(["expanded", "collapsed"] as const)(
    "joins two %s members in the rail capsule's container",
    (variant) => {
      const ref = createRef<HTMLDivElement>();
      const frame: Frame = {
        ref,
        "data-strip-item-id": "split:s1",
        "data-strip-item-mergeable": "false",
      };
      render(
        <SideSplitRowPair
          frame={frame}
          variant={variant}
          testId="split-tab-group-s1"
          first={<div data-testid="member-top" />}
          second={<div data-testid="member-bottom" />}
        />,
      );
      const pair = screen.getByTestId("split-tab-group-s1");
      expect(pair).toBe(ref.current);
      expect(pair.dataset.stripItemMergeable).toBe("false");
      expect(hasClasses(pair, SIDE_SPLIT_PAIR_CLASS)).toBe(true);
      expect(hasClasses(pair, "rounded-xl p-0.5 flex-col")).toBe(true);
      const ids = Array.from(pair.children).map((child) =>
        child.getAttribute("data-testid"),
      );
      expect(ids).toEqual([
        "member-top",
        "side-split-row-pair-seam",
        "member-bottom",
      ]);
      const hairline = screen.getByTestId(
        "side-split-row-pair-seam",
      ).firstElementChild;
      expect(
        hairline !== null && hasClasses(hairline, "h-px bg-border/60"),
      ).toBe(true);
    },
  );
});
