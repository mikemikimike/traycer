import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutFormHostContext } from "@/components/layout-editor/inspector/layout-form-host";
import { InspectorShell } from "@/components/layout-editor/inspector/inspector-shell";
import { RevertButton } from "@/components/layout-editor/inspector/inspector-row";
import { RegionDisplayControl } from "@/components/layout-editor/inspector/region-controls";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import {
  BARE_ROW,
  regionRowItems,
  type SortableRowDecoration,
} from "@/components/layout-editor/inspector/rows/order-row-items";
import { SortableList } from "@/components/layout-editor/inspector/sortable-list";
import { SurfaceSection } from "@/components/layout-editor/inspector/surface-section";
import { regionDepiction } from "@/components/layout-editor/region-depiction";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
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

    expect(rowOrder()).toEqual([start[1], start[2], start[0]]);
    expect(dockOrder()).toEqual(start);
    expect(announcement()).toContain("position 3 of 3");

    fireEvent.keyDown(grabbed, { key: " " });

    expect(dockOrder()).toEqual([start[1], start[2], start[0]]);
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
    expect(rowOrder()).toEqual([start[1], start[0], start[2]]);

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

    expect(dockOrder()).toEqual([start[0], start[2], start[1]]);
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
    // Remove button, which used to sit INSIDE the `role="button"` line.
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

  function PageRowList(): ReactNode {
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
    render(<PageRowList />);

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
    render(<PageRowList />);

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
    render(<PageRowList />);
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

  it("draws the real component as the row's glyph, in place of the icon", () => {
    render(<PageRowList />);
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

describe("the rail's dividers as items (L-25)", () => {
  function railIds(): ReadonlyArray<string> {
    return useLayoutStore.getState().arrangement.rail.map((entry) => entry.id);
  }

  it("adds a boundary at the end, as one entry", () => {
    render(section("railAgents", vi.fn()));
    const before = railIds();

    fireEvent.click(screen.getByRole("button", { name: "Add divider" }));

    const after = railIds();
    expect(after).toHaveLength(before.length + 1);
    // Never an id a divider has held before, so the rail's own ids stay unique.
    expect(before).not.toContain(after.at(-1));
    expect(historyDepth()).toBe(1);
  });

  it("removes one from its own row, merging the groups either side", () => {
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

  it("moves a divider like any other item, which is what regroups the rail", () => {
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
