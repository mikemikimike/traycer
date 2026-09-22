import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LayoutFormHostContext } from "@/components/layout-editor/inspector/layout-form-host";
import { RegionFilter } from "@/components/layout-editor/inspector/region-filter";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";

/**
 * The two hosts as the page and the dock compose them, and nothing else: the
 * field's whole contract is which keys it takes and what it says it filters.
 */
function renderFilter(props: {
  readonly host: "inspector" | "page";
  readonly onArrowDown: (() => void) | null;
  readonly onEnter: (() => void) | null;
}): void {
  render(
    <LayoutFormHostContext value={props.host}>
      <RegionFilter
        ref={null}
        onArrowDown={props.onArrowDown}
        onEnter={props.onEnter}
      />
    </LayoutFormHostContext>,
  );
}

function field(name: string): HTMLElement {
  return screen.getByRole("textbox", { name });
}

beforeEach(() => {
  useLayoutEditorStore.getState().setFilter("");
  useLayoutEditorStore.getState().setKeyboardNav(false);
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().setFilter("");
  useLayoutEditorStore.getState().setKeyboardNav(false);
});

describe("the filter takes only the keys its host will act on (R2-04)", () => {
  it("leaves ArrowDown alone for a host with nowhere to go", () => {
    renderFilter({ host: "page", onArrowDown: null, onEnter: null });

    // `fireEvent` answers false when the event was canceled, which is the only
    // observable difference between a key left to the browser and one taken
    // and dropped.
    const delivered = fireEvent.keyDown(field("Filter these settings"), {
      key: "ArrowDown",
    });

    expect(delivered).toBe(true);
    expect(useLayoutEditorStore.getState().keyboardNav).toBe(false);
  });

  it("takes ArrowDown for a host that has a row to move to, and writes no session flag", () => {
    const onArrowDown = vi.fn();
    renderFilter({ host: "inspector", onArrowDown, onEnter: null });

    const delivered = fireEvent.keyDown(field("Filter regions"), {
      key: "ArrowDown",
    });

    expect(delivered).toBe(false);
    expect(onArrowDown).toHaveBeenCalledTimes(1);
    // `keyboardNav` is a fact about an editor SESSION. The field is drawn in a
    // host that has none, so lighting the canvas belongs to the handler.
    expect(useLayoutEditorStore.getState().keyboardNav).toBe(false);
  });

  it("leaves Enter alone for a host with no first match (R1-17)", () => {
    renderFilter({ host: "page", onArrowDown: null, onEnter: null });

    const delivered = fireEvent.keyDown(field("Filter these settings"), {
      key: "Enter",
    });

    expect(delivered).toBe(true);
  });

  it("takes Enter for a host that opens one", () => {
    const onEnter = vi.fn();
    renderFilter({ host: "inspector", onArrowDown: null, onEnter });

    const delivered = fireEvent.keyDown(field("Filter regions"), {
      key: "Enter",
    });

    expect(delivered).toBe(false);
    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});

describe("clearing the filter (L-125)", () => {
  it("offers a clear button only while there is something to clear", () => {
    renderFilter({ host: "page", onArrowDown: null, onEnter: null });

    expect(screen.queryByRole("button", { name: "Clear filter" })).toBeNull();

    fireEvent.change(field("Filter these settings"), {
      target: { value: "mini" },
    });

    expect(
      screen.queryByRole("button", { name: "Clear filter" }),
    ).not.toBeNull();
  });

  it("empties the filter and returns focus to the field", () => {
    renderFilter({ host: "page", onArrowDown: null, onEnter: null });
    const input = field("Filter these settings");
    fireEvent.change(input, { target: { value: "mini" } });

    fireEvent.click(screen.getByRole("button", { name: "Clear filter" }));

    expect(useLayoutEditorStore.getState().filter).toBe("");
    // A clear that leaves focus on a button that has just disappeared is a
    // keyboard dead end, which is why Escape alone was not enough.
    expect(document.activeElement).toBe(input);
  });

  it("still clears on Escape", () => {
    renderFilter({ host: "inspector", onArrowDown: null, onEnter: null });
    const input = field("Filter regions");
    fireEvent.change(input, { target: { value: "mini" } });

    fireEvent.keyDown(input, { key: "Escape" });

    expect(useLayoutEditorStore.getState().filter).toBe("");
  });
});

describe("the gutter the field sits in is the host's (L-154)", () => {
  /** The box the field is drawn in, which is what carries the host's inset. */
  function gutter(name: string): HTMLElement {
    const box = field(name).closest("div.py-2");
    if (!(box instanceof HTMLElement)) throw new Error("no field box");
    return box;
  }

  it("indents the field inside the dock, which has no column of its own", () => {
    renderFilter({ host: "inspector", onArrowDown: null, onEnter: null });

    expect(gutter("Filter regions").className).toContain("px-3");
  });

  it("leaves the page's field flush with the cards it filters", () => {
    renderFilter({ host: "page", onArrowDown: null, onEnter: null });

    // A field indented inside the card edge reads as narrower than the
    // settings it filters, and the band behind it then has to bleed back out
    // to reach them - which is the full-bleed stripe L-154 is about.
    expect(gutter("Filter these settings").className).not.toContain("px-");
  });
});
