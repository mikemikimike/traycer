import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InspectorBackRow } from "@/components/layout-editor/inspector/inspector-back-row";
import { InspectorIndex } from "@/components/layout-editor/inspector/inspector-index";
import { InspectorShell } from "@/components/layout-editor/inspector/inspector-shell";
import { ProviderLevel } from "@/components/layout-editor/inspector/provider-level";
import { RegionSection } from "@/components/layout-editor/inspector/region-section";
import { regionFacts } from "@/components/layout-editor/regions/region-facts";
import { USAGE_PROVIDER_IDS } from "@/lib/layout/layout-arrangement";
import type { RateLimitProviderId } from "@/lib/rate-limit-providers";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The provider level's limit checklist reads the status bar's rate-limit cache
 * (L-96), which wants a host runtime this keyboard harness has no business
 * standing up. The windows themselves are `provider-limits-choose.test.tsx`'s
 * subject.
 */
vi.mock("@/components/layout-editor/inspector/provider-limit-windows", () => ({
  useProviderLimitWindows: () => ({ windows: [], drawnKeys: [] }),
}));

function isUsageProviderId(id: string): id is RateLimitProviderId {
  return USAGE_PROVIDER_IDS.some((candidate) => candidate === id);
}

function popLevel(): void {
  useLayoutEditorStore.getState().popInspectorLevel();
}

/**
 * The body `layout-editor.tsx` mounts, with which of the three screens shows
 * read straight off the editor store's own `selected`/`level`. Nothing here
 * belongs in the components under test; the harness only composes them the
 * way the editor root does, so the keyboard model can be driven without a
 * session, a canvas and a firewall around it.
 *
 * Escape is deliberately NOT part of it: the ladder is the editor root's own
 * `document` listener (I-02), and `layout-editor.test.tsx` drives it there.
 */
function Harness(props: { readonly onExit: () => void }): ReactNode {
  const selected = useLayoutEditorStore((state) => state.selected);
  const level = useLayoutEditorStore((state) => state.level);

  let body: ReactNode;
  if (level !== null) {
    body = (
      <>
        <InspectorBackRow
          key={`provider-${level.providerId}`}
          label={regionFacts("usageLimits").name}
          onBack={popLevel}
        />
        <ProviderLevel providerId={level.providerId} />
      </>
    );
  } else if (selected !== null) {
    body = (
      <>
        <InspectorBackRow
          key={`section-${selected}`}
          label="All regions"
          onBack={popLevel}
        />
        <RegionSection
          key={selected}
          regionId={selected}
          host="inspector"
          onOpenProvider={(providerId) => {
            if (!isUsageProviderId(providerId)) return;
            useLayoutEditorStore
              .getState()
              .openLevel({ kind: "usage-provider", providerId });
          }}
        />
      </>
    );
  } else {
    body = (
      <InspectorIndex
        onPreviewPreset={() => {
          // Preview wiring is the canvas's, and is driven elsewhere.
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
  it("walks the index with arrows and opens a region with Enter", () => {
    render(<Harness onExit={() => {}} />);

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

  it("opens the first match on Enter in the filter (I-08)", () => {
    render(<Harness onExit={() => {}} />);
    const filterInput = screen.getByRole("textbox", { name: "Filter regions" });

    fireEvent.change(filterInput, { target: { value: "minimap" } });
    fireEvent.keyDown(filterInput, { key: "Enter" });

    expect(useLayoutEditorStore.getState().selected).toBe("minimap");
  });

  it("leaves Enter alone when the filter matches nothing", () => {
    render(<Harness onExit={() => {}} />);
    const filterInput = screen.getByRole("textbox", { name: "Filter regions" });

    fireEvent.change(filterInput, { target: { value: "zzzz" } });
    fireEvent.keyDown(filterInput, { key: "Enter" });

    expect(useLayoutEditorStore.getState().selected).toBeNull();
  });
});

describe("the shared back row (L-89)", () => {
  it("takes focus on the way into a level and walks back out of it", () => {
    render(<Harness onExit={() => {}} />);

    // Focus starts on the first index row on entry, and the pointer opens a
    // section: the row that had focus unmounts with it, which is what used to
    // drop focus onto `<body>` (I-02).
    expect(document.activeElement?.getAttribute("data-region-id")).toBe(
      "homeTab",
    );
    fireEvent.click(screen.getByRole("button", { name: /Home tab/ }));

    const back = screen.getByRole("button", { name: "All regions" });
    expect(document.activeElement).toBe(back);

    fireEvent.click(back);
    expect(useLayoutEditorStore.getState().selected).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Filter regions" }),
    ).not.toBeNull();
    // And back out again, focus is in the index rather than on a row that no
    // longer exists.
    expect(document.activeElement?.getAttribute("data-region-id")).toBe(
      "homeTab",
    );
  });

  it("names the parent level rather than the index, one level deeper", () => {
    render(<Harness onExit={() => {}} />);

    fireEvent.click(screen.getByRole("button", { name: /Usage limits/ }));
    const providerRow = screen.getAllByRole("button", {
      name: /Anthropic|Claude|OpenAI|Codex/,
    })[0];
    fireEvent.click(providerRow);

    expect(useLayoutEditorStore.getState().level).not.toBeNull();
    const back = screen.getByRole("button", { name: "Usage limits" });
    expect(document.activeElement).toBe(back);

    fireEvent.click(back);
    expect(useLayoutEditorStore.getState().level).toBeNull();
    expect(useLayoutEditorStore.getState().selected).toBe("usageLimits");
    expect(screen.getByRole("button", { name: "All regions" })).not.toBeNull();
  });
});
