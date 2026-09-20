import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectorIndex } from "@/components/layout-editor/inspector/inspector-index";
import { InspectorShell } from "@/components/layout-editor/inspector/inspector-shell";
import { ProviderLevel } from "@/components/layout-editor/inspector/provider-level";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { USAGE_PROVIDER_IDS } from "@/lib/layout/layout-arrangement";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

function isUsageProviderId(id: string): id is RateLimitProviderId {
  return USAGE_PROVIDER_IDS.some((candidate) => candidate === id);
}

/**
 * A minimal stand-in for what tickets 05/07 mount: which of the three screens
 * shows is read straight off the editor store's own `selected`/`level`, the
 * same way `popInspectorLevel`'s own ladder (index -> section -> provider) is
 * documented to work. Nothing here belongs in the components under test -
 * this harness only proves they compose the way the later tickets will.
 */
function Harness(props: { readonly onExit: () => void }): ReactNode {
  const selected = useLayoutEditorStore((state) => state.selected);
  const level = useLayoutEditorStore((state) => state.level);

  let body: ReactNode;
  if (level !== null) {
    body = (
      <ProviderLevel
        providerId={level.providerId}
        onBack={() => {
          useLayoutEditorStore.getState().popInspectorLevel();
        }}
      />
    );
  } else if (selected !== null) {
    body = (
      <RegionSection
        regionId={selected}
        host="inspector"
        onOpenProvider={(providerId) => {
          if (!isUsageProviderId(providerId)) return;
          useLayoutEditorStore
            .getState()
            .openLevel({ kind: "usage-provider", providerId });
        }}
      />
    );
  } else {
    body = (
      <InspectorIndex
        host="inspector"
        onPreviewPreset={() => {
          // Preview wiring is the canvas's, a later ticket.
        }}
      />
    );
  }

  return <InspectorShell onExit={props.onExit}>{body}</InspectorShell>;
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
    floatPosition: null,
    lockedBy: "none",
  });
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
});

describe("inspector keyboard model (L-31)", () => {
  it("walks the index with arrows, opens a region with Enter, and Escape walks back until it exits", () => {
    let doneCount = 0;
    render(
      <Harness
        onExit={() => {
          doneCount += 1;
        }}
      />,
    );

    const filterInput = screen.getByRole("textbox", { name: "Filter regions" });

    // ArrowDown from the filter reaches the first index row (L-31). The
    // topBar group is declared first and "Home tab" is its only region, so
    // it is the first row regardless of the registry's own key order.
    fireEvent.keyDown(filterInput, { key: "ArrowDown" });
    expect(document.activeElement?.getAttribute("data-region-id")).toBe(
      "homeTab",
    );

    // ArrowDown again walks to the next row.
    const firstRow = document.activeElement;
    if (firstRow === null) throw new Error("expected a focused row");
    fireEvent.keyDown(firstRow, { key: "ArrowDown" });
    expect(document.activeElement).not.toBe(firstRow);
    expect(document.activeElement?.getAttribute("data-region-id")).not.toBe(
      "homeTab",
    );

    // Back to the first row, then Enter opens its section.
    const secondRow = document.activeElement;
    if (secondRow === null) throw new Error("expected a focused row");
    fireEvent.keyDown(secondRow, { key: "ArrowUp" });
    const backAtFirstRow = document.activeElement;
    if (backAtFirstRow === null) throw new Error("expected a focused row");
    expect(backAtFirstRow.getAttribute("data-region-id")).toBe("homeTab");
    fireEvent.keyDown(backAtFirstRow, { key: "Enter" });
    expect(useLayoutEditorStore.getState().selected).toBe("homeTab");
    // `@testing-library/jest-dom` is not wired into this repo's vitest
    // setup, so presence is read via `query*` + a plain null check.
    expect(screen.queryByText("Home tab")).not.toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Filter regions" }),
    ).toBeNull();

    // First Escape (inside the open section) walks back to the index -
    // `popInspectorLevel` pops `selected`, not the whole editor.
    const sectionHeading = screen.getByText("Home tab");
    fireEvent.keyDown(sectionHeading, { key: "Escape" });
    expect(useLayoutEditorStore.getState().selected).toBeNull();
    expect(doneCount).toBe(0);
    expect(
      screen.queryByRole("textbox", { name: "Filter regions" }),
    ).not.toBeNull();

    // Second Escape (already at the index) exits the editor.
    fireEvent.keyDown(screen.getByRole("textbox", { name: "Filter regions" }), {
      key: "Escape",
    });
    expect(doneCount).toBe(1);
  });

  it("returns focus to the filter on ArrowUp from the first row", () => {
    render(<Harness onExit={() => {}} />);
    const filterInput = screen.getByRole("textbox", { name: "Filter regions" });

    fireEvent.keyDown(filterInput, { key: "ArrowDown" });
    const firstRow = document.activeElement;
    if (firstRow === null) throw new Error("expected a focused row");
    expect(firstRow.getAttribute("data-region-id")).toBe("homeTab");

    fireEvent.keyDown(firstRow, { key: "ArrowUp" });
    expect(document.activeElement).toBe(filterInput);
  });
});
