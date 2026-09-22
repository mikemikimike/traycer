import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InspectorShell } from "@/components/layout-editor/inspector/inspector-shell";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { railStackId, type RailEntry } from "@/lib/layout/rail";
import type { RegionId } from "@/lib/layout/region-id";
import { useLeftPanelStore } from "@/stores/epics/left-panel-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The rail's STACK link (L-166, L-167, L-168): a row of its own in the
 * Position list, a Remove of its own, and the button on the panel above it
 * that makes one.
 *
 * Rendered through the same seam the rail's other Position-list rows are
 * covered by (see `inspector/__tests__/sortable-list.test.tsx`): `RegionSection`
 * for a rail region, docked in `InspectorShell`, so a press lands through
 * `writeArrangement` -> `recordGesture` exactly as it does live. The Position
 * list this draws is the WHOLE rail's, not a slice of it - selecting one rail
 * region still shows every panel and stack link in the rail's own order
 * (L-25), which is why `section("railAgents", ...)` below is enough to reach
 * every row this file asserts on, including Terminals' and Comments'.
 */

function section(regionId: RegionId, onExit: () => void): ReactNode {
  return (
    <InspectorShell onExit={onExit}>
      <RegionSection regionId={regionId} onOpenProvider={vi.fn()} />
    </InspectorShell>
  );
}

function rows(): ReadonlyArray<HTMLElement> {
  return [...document.querySelectorAll<HTMLElement>("[data-sortable-id]")];
}

function row(id: string): HTMLElement {
  const node = document.querySelector(`[data-sortable-id="${id}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`no such row: ${id}`);
  return node;
}

function rowIds(): ReadonlyArray<string> {
  return rows().map((node) => node.getAttribute("data-sortable-id") ?? "");
}

function rail(): ReadonlyArray<RailEntry> {
  return useLayoutStore.getState().arrangement.rail;
}

/** The rail's panel ids alone, in order - what a stack write must not disturb. */
function panelIds(entries: ReadonlyArray<RailEntry>): ReadonlyArray<string> {
  return entries.flatMap((entry) => (entry.kind === "panel" ? [entry.id] : []));
}

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLeftPanelStore.setState({
    panelSectionCollapsedByPanelId: {},
    panelSectionWeightsByPanelId: {},
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

describe("the stack link as its own Position-list row (L-166, L-168)", () => {
  it("sits between the Agents row and the Artifacts row, with no grip", () => {
    render(section("railAgents", vi.fn()));
    const linkId = railStackId("railAgents", "railArtifacts");

    const ids = rowIds();
    expect(ids.indexOf("railAgents")).toBe(0);
    expect(ids.indexOf(linkId)).toBe(1);
    expect(ids.indexOf("railArtifacts")).toBe(2);

    const linkRow = row(linkId);
    expect(linkRow.querySelector('[role="button"]')?.textContent).toBe(
      "Stacked with the panel below",
    );
    // Not draggable: the link moves with its panels rather than on its own
    // (L-168), so its row carries no grip - the one thing that sets it apart
    // from a divider row, which IS draggable.
    expect(linkRow.querySelector("[data-row-grip]")).toBeNull();
  });

  it("removes the link on 'Remove stack', leaving both panels where they were", () => {
    render(section("railAgents", vi.fn()));
    const linkId = railStackId("railAgents", "railArtifacts");
    const before = rail();

    fireEvent.click(screen.getByRole("button", { name: "Remove stack" }));

    const after = rail();
    expect(
      after.some((entry) => entry.kind === "stack" && entry.id === linkId),
    ).toBe(false);
    expect(after).toHaveLength(before.length - 1);
    // Both panels stay exactly where they were, in the same order - unstacking
    // takes out the join and nothing else (L-168).
    expect(panelIds(after)).toEqual(panelIds(before));
  });
});

describe("stacking a panel from its own row (L-166, L-168)", () => {
  it("offers 'Stack <name> with the panel below' only where a join can be made", () => {
    render(section("railAgents", vi.fn()));

    // Terminals sits directly above Browsers and neither is half of a pair
    // yet: the one case the button is FOR.
    expect(
      screen.getByRole("button", {
        name: "Stack terminals with the panel below",
      }),
    ).toBeDefined();
    // Agents is already stacked - the link sits directly below it.
    expect(
      screen.queryByRole("button", {
        name: "Stack agents with the panel below",
      }),
    ).toBeNull();
    // Artifacts is already stacked too - it is the link's other half.
    expect(
      screen.queryByRole("button", {
        name: "Stack artifacts with the panel below",
      }),
    ).toBeNull();
    // Comments is the rail's last row: nothing sits below it to join.
    expect(
      screen.queryByRole("button", {
        name: "Stack comments with the panel below",
      }),
    ).toBeNull();
  });

  it("keeps the pressed panel ABOVE and moves nothing (L-170)", () => {
    render(section("railAgents", vi.fn()));
    const before = panelIds(rail());

    fireEvent.click(
      screen.getByRole("button", {
        name: "Stack terminals with the panel below",
      }),
    );

    const after = rail();
    // The row promises "with the panel below", so Terminals stays where it is
    // and Browsers stays where it is: the join is placed between them and the
    // panel ORDER is untouched, which is the same promise Remove makes.
    expect(panelIds(after)).toEqual(before);
    const linkId = railStackId("railTerminals", "railBrowsers");
    const linkIndex = after.findIndex(
      (entry) => entry.kind === "stack" && entry.id === linkId,
    );
    expect(linkIndex).toBeGreaterThan(-1);
    expect(after[linkIndex - 1]).toEqual({
      kind: "panel",
      id: "railTerminals",
    });
    expect(after[linkIndex + 1]).toEqual({ kind: "panel", id: "railBrowsers" });
  });

  it("draws the Stack verb in a slot every row reserves (L-122, L-170)", () => {
    render(section("railAgents", vi.fn()));

    // The verb is per-row - the two stacked panels have none and the last
    // panel has none - so the column it sits in has to be reserved by the
    // LIST, or the controls beside it start at a different x on different
    // rows of one list and jump when a stack is made.
    const slots = rows().map(
      (node) => node.querySelectorAll("[data-stack-slot]").length,
    );
    expect(slots.every((count) => count === 1)).toBe(true);
    expect(
      row("railComments").querySelector("[data-stack-slot]")?.children.length,
    ).toBe(0);
    expect(
      row("railTerminals").querySelector("[data-stack-slot]")?.children.length,
    ).toBe(1);
  });

  it("opens a rejoined pair with both sections showing (L-170)", () => {
    render(section("railAgents", vi.fn()));
    // Collapse one half of the shipped pair, take the pair apart, then put it
    // back: while the two are apart neither draws a chevron, so the flag has
    // had no control that could clear it and must not come back with the join.
    useLeftPanelStore.getState().togglePanelSectionCollapsed("artifacts");
    fireEvent.click(screen.getByRole("button", { name: "Remove stack" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: "Stack agents with the panel below",
      }),
    );

    expect(
      useLeftPanelStore.getState().panelSectionCollapsedByPanelId.artifacts,
    ).toBe(false);
    expect(
      rail().some(
        (entry) =>
          entry.kind === "stack" &&
          entry.id === railStackId("railAgents", "railArtifacts"),
      ),
    ).toBe(true);
  });
});
