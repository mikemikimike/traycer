import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutFormHostContext } from "@/components/layout-editor/inspector/layout-form-host";
import { InspectorShell } from "@/components/layout-editor/inspector/inspector-shell";
import { RevertButton } from "@/components/layout-editor/inspector/inspector-row";
import { RegionDisplayControl } from "@/components/layout-editor/inspector/region-controls";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { ProvidersChildrenRow } from "@/components/layout-editor/inspector/rows/children-row";
import {
  BARE_ROW,
  regionRowItems,
  type SortableRowDecoration,
} from "@/components/layout-editor/inspector/rows/order-row-items";
import { SortableList } from "@/components/layout-editor/inspector/sortable-list";
import { SurfaceSection } from "@/components/layout-editor/inspector/surface-section";
import { regionDepiction } from "@/components/layout-editor/region-depiction";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import {
  ORDER_GROUPS,
  orderGroupInstruction,
} from "@/components/layout-editor/regions/surface-groups";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import { DEFAULT_RAIL, railDividerId } from "@/lib/layout/rail";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { RegionId } from "@/lib/layout/region-id";

/**
 * The inspector's sortable list, through the section that draws it (L-24,
 * L-31).
 *
 * Rendered as the real section rather than as the list alone, because the two
 * things under test are relationships with the surfaces around it: a reorder
 * has to be ONE entry on the editor's own history, and a cancelled grab has to
 * stop before the editor's Escape ladder, which listens on the shell.
 */

function section(regionId: RegionId, onExit: () => void): ReactNode {
  return (
    <InspectorShell onExit={onExit}>
      <RegionSection regionId={regionId} onOpenProvider={vi.fn()} />
    </InspectorShell>
  );
}

/**
 * The same list on the other host (L-03, L-95), where the rows carry their own
 * controls: the Settings page draws a surface card with `onMove: null`, so its
 * rows are unordered AND decorated, which is the combination R1-02 was about.
 * Chat is the surface with no picture and no order group, so the card is its
 * two rows and nothing else.
 */
function chatCard(
  openRows: ReadonlyArray<string>,
  onToggleRow: (rowId: string) => void,
): ReactNode {
  return (
    <LayoutFormHostContext value="page">
      <SurfaceSection
        surface="chat"
        snapshot={snapshot()}
        filter=""
        openRows={openRows}
        onToggleRow={onToggleRow}
        surfaceRows={null}
      />
    </LayoutFormHostContext>
  );
}

function snapshot(): LayoutSnapshot {
  const state = useLayoutStore.getState();
  return {
    basePreset: state.basePreset,
    overrides: state.overrides,
    arrangement: state.arrangement,
  };
}

function row(id: string): HTMLElement {
  const node = document.querySelector(`[data-sortable-id="${id}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`no such row: ${id}`);
  return node;
}

function rows(): ReadonlyArray<HTMLElement> {
  return [...document.querySelectorAll<HTMLElement>("[data-sortable-id]")];
}

/** The element carrying the row's operation, which is never the whole line. */
function grabOf(rowNode: HTMLElement): HTMLElement {
  const node = rowNode.querySelector('[role="button"]');
  if (!(node instanceof HTMLElement)) throw new Error("row has no grab");
  return node;
}

/**
 * The element a row's grab names as its presence rule: the second of the two
 * descriptions, the first being the list's one shared line of grab
 * instructions.
 */
function ruleOf(rowNode: HTMLElement): HTMLElement {
  const ids = (grabOf(rowNode).getAttribute("aria-describedby") ?? "").split(
    " ",
  );
  const node = document.getElementById(ids.at(-1) ?? "");
  if (!(node instanceof HTMLElement)) throw new Error("row has no rule");
  return node;
}

/** Anything a screen reader names as a control, or a Tab stop can land on. */
const INTERACTIVE =
  'a[href], button, input, select, textarea, [tabindex], [role="button"], [role="radio"], [role="radiogroup"], [role="switch"], [role="checkbox"]';

/** A row's ONE state control, whatever shape its options take (L-121). */
const STATE_CONTROL = '[role="radiogroup"], [role="switch"]';

function rowOrder(): ReadonlyArray<string> {
  return [...document.querySelectorAll("[data-sortable-id]")].map(
    (node) => node.getAttribute("data-sortable-id") ?? "",
  );
}

function announcement(): string {
  return screen.getAllByRole("status").at(-1)?.textContent ?? "";
}

function dockOrder(): ReadonlyArray<string> {
  return useLayoutStore.getState().arrangement.dock;
}

function historyDepth(): number {
  return useLayoutEditorStore.getState().history.past.length;
}

/**
 * The shipped rail carries no dividers of its own any more (L-155): it is a
 * flat list of panels, and a divider exists only once a user adds one. Tests
 * that are about an EXISTING divider's own row seed one directly rather than
 * relying on a default the rail no longer ships.
 */
function seedRailDivider(): void {
  const arrangement = useLayoutStore.getState().arrangement;
  useLayoutStore.setState({
    arrangement: {
      ...arrangement,
      rail: [
        ...DEFAULT_RAIL.slice(0, 1),
        { kind: "divider", id: railDividerId(1) },
        ...DEFAULT_RAIL.slice(1),
      ],
      dividerSeq: 1,
    },
  });
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

describe("the sortable list's keyboard path (L-24, L-31)", () => {
  it("grabs with space, moves with the arrows and drops as one history entry", () => {
    render(section("runningAgents", vi.fn()));
    const start = dockOrder();
    const grabbed = row(start[0]);

    fireEvent.keyDown(grabbed, { key: " " });

    expect(announcement()).toContain("Grabbed");
    // A grab moves nothing yet: the list shows where it would land.
    expect(dockOrder()).toEqual(start);

    fireEvent.keyDown(grabbed, { key: "ArrowDown" });
    fireEvent.keyDown(grabbed, { key: "ArrowDown" });

    const movedDownTwo = [start[1], start[2], start[0], ...start.slice(3)];

    expect(rowOrder()).toEqual(movedDownTwo);
    expect(dockOrder()).toEqual(start);
    expect(announcement()).toContain(`position 3 of ${String(start.length)}`);

    fireEvent.keyDown(grabbed, { key: " " });

    expect(dockOrder()).toEqual(movedDownTwo);
    // Two arrow presses, one entry: undo puts the row back where it was.
    expect(historyDepth()).toBe(1);
    expect(announcement()).toContain("Dropped");

    useLayoutEditorStore.getState().undo();

    expect(dockOrder()).toEqual(start);
  });

  it("puts a cancelled grab back and stops the escape short of the ladder", () => {
    const onExit = vi.fn();
    render(section("runningAgents", onExit));
    const start = dockOrder();
    const grabbed = row(start[0]);

    fireEvent.keyDown(grabbed, { key: " " });
    fireEvent.keyDown(grabbed, { key: "ArrowDown" });
    expect(rowOrder()).toEqual([start[1], start[0], ...start.slice(2)]);

    fireEvent.keyDown(grabbed, { key: "Escape" });

    expect(rowOrder()).toEqual(start);
    expect(dockOrder()).toEqual(start);
    expect(historyDepth()).toBe(0);
    expect(announcement()).toContain("Cancelled");
    // The section is still open and the editor is still here: a cancelled
    // grab is its own rung of the Escape ladder.
    expect(onExit).not.toHaveBeenCalled();
    expect(useLayoutEditorStore.getState().selected).toBeNull();
  });

  it("drops a grab that loses focus rather than leaving it swallowing arrows", () => {
    render(section("runningAgents", vi.fn()));
    const start = dockOrder();
    const grabbed = row(start[0]);

    fireEvent.keyDown(grabbed, { key: " " });
    fireEvent.keyDown(grabbed, { key: "ArrowDown" });
    fireEvent.blur(grabbed);

    expect(rowOrder()).toEqual(start);
    expect(dockOrder()).toEqual(start);
    expect(historyDepth()).toBe(0);
  });

  it("nudges by one on Alt+Arrow, which is one entry of its own", () => {
    render(section("runningAgents", vi.fn()));
    const start = dockOrder();

    fireEvent.keyDown(row(start[2]), { key: "ArrowUp", altKey: true });

    expect(dockOrder()).toEqual([
      start[0],
      start[2],
      start[1],
      ...start.slice(3),
    ]);
    expect(historyDepth()).toBe(1);
  });

  it("leaves a bare arrow to the index, which is the surface that walks", () => {
    render(section("runningAgents", vi.fn()));
    const start = dockOrder();

    fireEvent.keyDown(row(start[0]), { key: "ArrowDown" });

    expect(dockOrder()).toEqual(start);
    expect(historyDepth()).toBe(0);
  });
});

describe("what a row claims as its own (R1-02)", () => {
  it("keeps the dock's own row controls out of the grab", () => {
    // The rail is the inspector's decorated list: every divider carries a real
    // Remove button, which used to sit INSIDE the `role="button"` line. The
    // shipped rail carries none of its own (L-155), so this seeds one.
    seedRailDivider();
    render(section("railAgents", vi.fn()));

    const decorated = rows().filter(
      (node) => node.querySelectorAll(INTERACTIVE).length > 1,
    );
    expect(decorated.length).toBeGreaterThan(0);
    for (const rowNode of rows()) {
      expect(
        grabOf(rowNode).querySelectorAll(INTERACTIVE),
        rowNode.getAttribute("data-sortable-id") ?? "",
      ).toHaveLength(0);
    }
  });

  it("keeps the page's row controls out of the grab, and out of its name", () => {
    render(chatCard([], vi.fn()));

    const minimap = row("minimap");
    // The row really does carry controls - a side choice and a Shown switch -
    // so the emptiness asserted below is a place, not an absence.
    expect(
      minimap.querySelectorAll('[role="radio"], [role="switch"]').length,
    ).toBeGreaterThan(1);
    for (const rowNode of rows()) {
      expect(grabOf(rowNode).querySelectorAll(INTERACTIVE)).toHaveLength(0);
    }

    // A composite widget names itself from its contents: the row is "Minimap",
    // never "Minimap Left Right Show Minimap". Said of EVERY row in the card,
    // hinted or not, because the precondition that used to stand here excluded
    // the only rows the defect was ever about (R2-08).
    const facts = regionFacts("minimap");
    expect(grabOf(minimap).textContent).toBe(facts.name);
    const named = screen.getByRole("button", { name: facts.name });
    expect(named).toBe(grabOf(minimap));
  });

  it("still opens an unordered row's disclosure from the keyboard", () => {
    const toggled = vi.fn();
    render(chatCard([], toggled));
    // Context usage is the chat row with something behind it (Style and
    // Fine-tune); the minimap row has no disclosure at all.
    const grab = grabOf(row("contextUsage"));

    fireEvent.keyDown(grab, { key: " " });
    fireEvent.keyDown(grab, { key: "Enter" });

    expect(toggled.mock.calls).toEqual([["contextUsage"], ["contextUsage"]]);
    expect(grab.getAttribute("aria-expanded")).toBe("false");
  });
});

/**
 * The page row's own anatomy, built from the row builders rather than through
 * a surface card: what is under test is the ROW - its one state control, the
 * slot it reserves for a revert, where its presence rule lives and what it
 * draws for a glyph - and which regions get which of those is the card's
 * decision, on the other side of this seam.
 */
describe("the page's row anatomy (L-120, L-121, L-122, R2-08)", () => {
  /** One plain rail panel and one that carries a presence rule and a revert. */
  const ROW_IDS: ReadonlyArray<RegionId> = ["railAgents", "railPullRequests"];
  const CHANGED: RegionId = "railPullRequests";

  function PageRowList(props: {
    /** Which rows are showing their disclosure, as the page owns it (L-89). */
    readonly openIds: ReadonlyArray<string>;
  }): ReactNode {
    const snap = snapshot();
    const values = effectiveLayoutValues(snap.basePreset, snap.overrides);

    function decorate(id: string): SortableRowDecoration {
      const regionId = ROW_IDS.find((candidate) => candidate === id);
      if (regionId === undefined) return BARE_ROW;
      const changed = regionId === CHANGED;
      return {
        ...BARE_ROW,
        changed,
        hint: regionFacts(regionId).hint,
        // The real rail button, which is what the Sidebar card draws instead
        // of the plinth the owner complained about (L-120).
        glyph: regionDepiction(regionId, values, snap.arrangement),
        control: <RegionDisplayControl regionId={regionId} values={values} />,
        revert: changed ? (
          <RevertButton
            label={`Revert ${regionFacts(regionId).name}`}
            onRevert={() => undefined}
          />
        ) : null,
        detail: <p data-testid={`${regionId}-detail`}>Style and fine-tune</p>,
        open: props.openIds.includes(regionId),
        onToggleOpen: () => undefined,
      };
    }

    return (
      <LayoutFormHostContext value="page">
        <SortableList
          label="Sidebar panels"
          selectedId={null}
          items={regionRowItems(ROW_IDS, values, decorate)}
          onMove={() => undefined}
        />
      </LayoutFormHostContext>
    );
  }

  it("reserves the revert's slot on every row, filled on one of them", () => {
    render(<PageRowList openIds={[]} />);

    // The box exists whether or not there is anything in it, which is what
    // stops the control column moving when a value changes (LV2-11).
    expect(
      rows().map((node) => node.querySelectorAll("[data-revert-slot]").length),
    ).toEqual([1, 1]);
    expect(screen.getAllByRole("button", { name: /^Revert / })).toHaveLength(1);
    expect(
      row(CHANGED).querySelector("[data-revert-slot]")?.childElementCount,
    ).toBe(1);
    expect(
      row("railAgents").querySelector("[data-revert-slot]")?.childElementCount,
    ).toBe(0);
  });

  it("gives a row exactly one state control, outside its grab", () => {
    render(<PageRowList openIds={[]} />);

    for (const node of rows()) {
      expect(node.querySelectorAll(STATE_CONTROL)).toHaveLength(1);
      // Still true with a real component drawn inside the grab: the glyph is
      // `inert`, so the picture of a rail button is not a second button.
      expect(grabOf(node).querySelectorAll(INTERACTIVE)).toHaveLength(0);
    }
    expect(
      screen.getByRole("radiogroup", {
        name: `${regionFacts("railAgents").name} display`,
      }),
    ).toBeDefined();
  });

  it("describes the row by its presence rule instead of naming itself from it", () => {
    render(<PageRowList openIds={[]} />);
    const hint = regionFacts(CHANGED).hint;
    const grab = grabOf(row(CHANGED));

    expect(hint).not.toBeNull();
    expect(grab.textContent).toBe(regionFacts(CHANGED).name);

    const described = (grab.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id));
    const rule = described.find((node) => node?.textContent === hint);
    expect(rule).toBeDefined();
    // A description is a SIBLING of the control it describes; inside it, it is
    // part of the control's name instead (R2-08).
    expect(grab.contains(rule ?? null)).toBe(false);
    // The grab instructions are still there beside it.
    expect(described.length).toBe(2);
  });

  /**
   * One row height for a plain row and a hinted one (R3-08, LV2-11).
   *
   * Measured as the thing that CAUSED the difference rather than as a pixel
   * count jsdom cannot give: the rule used to be an extra line inside the row's
   * own padding box, so a list of nine panels had rows of two different heights
   * depending on which of them happened to have a presence rule. It is the
   * first line of the disclosure now, and while the row is closed it is present
   * and described but takes no space at all.
   */
  it("keeps the presence rule out of the row's line, and in its disclosure", () => {
    render(<PageRowList openIds={[]} />);
    const hint = regionFacts(CHANGED).hint;
    const closed = ruleOf(row(CHANGED));

    // Still reachable without opening anything, and still costing no height.
    expect(closed.className).toContain("sr-only");
    // The line is the padding box every row draws, hinted or not, and the rule
    // is outside it on both - which is the whole of the fix.
    for (const node of rows()) {
      const line = node.querySelector("[data-row-line]");
      expect(line).not.toBeNull();
      expect(line?.contains(closed)).toBe(false);
    }

    cleanup();
    render(<PageRowList openIds={[CHANGED]} />);
    const opened = ruleOf(row(CHANGED));
    const detail = row(CHANGED).querySelector("[data-sortable-detail]");

    // Opened, it is the first thing the row says about itself.
    expect(detail?.firstElementChild).toBe(opened);
    expect(opened.className).not.toContain("sr-only");
    expect(opened.textContent).toBe(hint);
  });

  it("draws the real component as the row's glyph, in place of the icon", () => {
    render(<PageRowList openIds={[]} />);
    const glyph = row("railAgents").querySelector("[data-row-glyph]");

    expect(glyph).not.toBeNull();
    expect(glyph?.hasAttribute("inert")).toBe(true);
    expect(glyph?.querySelector("svg")).not.toBeNull();
    // One picture per row: the registry icon is not drawn beside it.
    expect(row("railAgents").querySelectorAll("[data-row-icon]")).toHaveLength(
      0,
    );
  });
});

/**
 * One header component, composed by both hosts (R3-11).
 *
 * The page's surface card and the dock's Providers level each used to BUILD
 * this header - the same gutter, the same `h3`, the same `max-w-[72ch]`
 * paragraph - so a change to its shape had to be made in two files or the two
 * stopped matching, which is the drift R1-04 named one layer down. What the two
 * hosts are allowed to differ by is the row scale, and nothing else.
 */
describe("the list header, in both hosts (R3-11)", () => {
  /** The Status bar card, whose one list is the providers (L-123). */
  function statusBarCard(): ReactNode {
    return (
      <LayoutFormHostContext value="page">
        <SurfaceSection
          surface="statusBar"
          snapshot={snapshot()}
          filter=""
          openRows={[]}
          onToggleRow={vi.fn()}
          surfaceRows={null}
        />
      </LayoutFormHostContext>
    );
  }

  /** The same list in the dock, under Usage limits (L-26). */
  function providersLevel(): ReactNode {
    const snap = snapshot();
    return (
      <ProvidersChildrenRow
        values={effectiveLayoutValues(snap.basePreset, snap.overrides)}
        arrangement={snap.arrangement}
        onOpenProvider={null}
      />
    );
  }

  /** What the two hosts may differ by: the row's own gutter and type scale. */
  function shapeOf(
    node: HTMLElement | null | undefined,
  ): ReadonlyArray<string> {
    return (node?.className ?? "")
      .split(" ")
      .filter(
        (name) =>
          name !== "" &&
          !name.startsWith("px-") &&
          !name.startsWith("py-") &&
          !name.startsWith("text-ui"),
      );
  }

  function headingOf(): HTMLElement {
    return screen.getByRole("heading", {
      name: ORDER_GROUPS.usageProviders.label ?? "",
      level: 3,
    });
  }

  it("draws one header shape wherever the list is drawn", () => {
    const words = orderGroupInstruction("usageProviders");

    render(statusBarCard());
    const onPage = headingOf();
    expect(onPage.nextElementSibling?.textContent).toBe(words);
    const pageShape = [
      shapeOf(onPage.parentElement),
      shapeOf(onPage.parentElement?.parentElement),
    ];

    cleanup();
    render(providersLevel());
    const inDock = headingOf();

    // Same words, said once, in the same box: the instruction is the header's
    // description on both hosts rather than a footnote under one of them.
    expect(inDock.nextElementSibling?.textContent).toBe(words);
    expect([
      shapeOf(inDock.parentElement),
      shapeOf(inDock.parentElement?.parentElement),
    ]).toEqual(pageShape);
  });
});

describe("the rail's dividers as items (L-25)", () => {
  function railIds(): ReadonlyArray<string> {
    return useLayoutStore.getState().arrangement.rail.map((entry) => entry.id);
  }

  it("adds a boundary before the last panel, as one entry (L-159)", () => {
    render(section("railAgents", vi.fn()));
    const before = railIds();

    fireEvent.click(screen.getByRole("button", { name: "Add divider" }));

    const after = railIds();
    expect(after).toHaveLength(before.length + 1);
    const newDividerId = after.find((id) => !before.includes(id)) ?? "";
    // Never an id a divider has held before, so the rail's own ids stay unique.
    expect(newDividerId).not.toBe("");
    // Sits between the second-to-last and last rail rows rather than
    // appended past the last icon: a divider past the last icon in a
    // justify-start column spaces nothing, so the press would read as a
    // no-op.
    expect(after.at(-2)).toBe(newDividerId);
    expect(after.at(-1)).toBe(before.at(-1));
    expect(historyDepth()).toBe(1);
  });

  it("removes one from its own row", () => {
    seedRailDivider();
    render(section("railAgents", vi.fn()));
    const before = railIds();
    const dividerId = before.find((id) => id.startsWith("divider:")) ?? "";

    fireEvent.click(
      screen.getAllByRole("button", { name: "Remove divider" })[0],
    );

    expect(railIds()).not.toContain(dividerId);
    expect(railIds()).toHaveLength(before.length - 1);
    expect(historyDepth()).toBe(1);
  });

  it("draws a rule on a divider row, which is the whole of what it is", () => {
    seedRailDivider();
    render(section("railAgents", vi.fn()));
    const dividerId = railIds().find((id) => id.startsWith("divider:")) ?? "";
    const dividerRow = row(dividerId);

    // A hairline spanning the row, and no state to speak of: the thing that
    // represents a boundary used to be the emptiest item in the list (LV2-12).
    expect(dividerRow.querySelector("[data-divider-rule]")).not.toBeNull();
    expect(dividerRow.querySelectorAll(STATE_CONTROL)).toHaveLength(0);
    // Its one verb sits in the same reserved slot a member's revert does, so
    // the column does not move between the two kinds of row.
    expect(
      dividerRow.querySelector("[data-revert-slot]")?.querySelector("button"),
    ).not.toBeNull();
  });

  it("moves a divider like any other item", () => {
    seedRailDivider();
    render(section("railAgents", vi.fn()));
    const before = railIds();
    const dividerId = before.find((id) => id.startsWith("divider:")) ?? "";
    const grabbed = row(dividerId);

    fireEvent.keyDown(grabbed, { key: " " });
    fireEvent.keyDown(grabbed, { key: "ArrowUp" });
    fireEvent.keyDown(grabbed, { key: " " });

    const after = railIds();
    expect(after.indexOf(dividerId)).toBe(before.indexOf(dividerId) - 1);
    expect(historyDepth()).toBe(1);
  });
});
