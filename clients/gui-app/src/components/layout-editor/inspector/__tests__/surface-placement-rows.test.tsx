import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InspectorIndex } from "@/components/layout-editor/inspector/inspector-index";
import {
  SidebarSideRow,
  TabStripPositionRow,
} from "@/components/layout-editor/inspector/rows/surface-placement-rows";
import { SURFACE_GROUPS } from "@/components/layout-editor/regions/region-grammar";
import { setMobileApp } from "@/lib/mobile-app";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * The Tabs surface's Position row and the Sidebar surface's Side row: each
 * writes the stored arrangement, a write inside a session is one undo step
 * that Discard puts back, and the revert shows only while the value differs
 * from the shipped one.
 */

function historyDepth(): number {
  return useLayoutEditorStore.getState().history.past.length;
}

function pick(group: string, label: string): void {
  const radiogroup = screen.getByRole("radiogroup", { name: group });
  const option = Array.from(
    radiogroup.querySelectorAll<HTMLElement>("[role='radio']"),
  ).find((node) => node.textContent === label);
  if (option === undefined) throw new Error(`no option ${label} in ${group}`);
  fireEvent.click(option);
}

function beginSession(): void {
  useLayoutEditorStore.getState().beginSession({
    entry: "keyboard",
    source: "direct_ui",
    startedAt: 0,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
});

afterEach(() => {
  cleanup();
  setMobileApp(false);
  useLayoutEditorStore.getState().setFilter("");
  useLayoutEditorStore.getState().endSession();
});

describe("<TabStripPositionRow />", () => {
  it("draws Top / Left / Right over the stored placement", () => {
    render(<TabStripPositionRow />);

    const options = Array.from(
      screen
        .getByRole("radiogroup", { name: "Tabs position" })
        .querySelectorAll("[role='radio']"),
    );
    expect(options.map((node) => node.textContent)).toEqual([
      "Top",
      "Left",
      "Right",
    ]);
    expect(options.map((node) => node.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
    ]);
    expect(screen.getByText("Position")).toBeTruthy();
  });

  it("writes the store at rest, with no history", () => {
    render(<TabStripPositionRow />);

    pick("Tabs position", "Left");

    expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe(
      "left",
    );
    expect(historyDepth()).toBe(0);
  });

  it("is one undo step in a session, and Discard puts it back", () => {
    beginSession();
    render(<TabStripPositionRow />);

    pick("Tabs position", "Right");
    expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe(
      "right",
    );
    expect(historyDepth()).toBe(1);

    useLayoutEditorStore.getState().undo();
    expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe("top");

    useLayoutEditorStore.getState().redo();
    expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe(
      "right",
    );

    useLayoutEditorStore.getState().discard();
    expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe("top");
  });

  it("offers a revert only while the placement differs from the shipped one", () => {
    render(<TabStripPositionRow />);
    expect(
      screen.queryByRole("button", { name: "Revert tabs position" }),
    ).toBeNull();

    pick("Tabs position", "Left");
    fireEvent.click(
      screen.getByRole("button", { name: "Revert tabs position" }),
    );

    expect(useLayoutStore.getState().arrangement.tabStripPlacement).toBe("top");
    expect(
      screen.queryByRole("button", { name: "Revert tabs position" }),
    ).toBeNull();
  });
});

describe("<SidebarSideRow />", () => {
  it("draws Left / Right over the stored side", () => {
    render(<SidebarSideRow />);

    const options = Array.from(
      screen
        .getByRole("radiogroup", { name: "Sidebar side" })
        .querySelectorAll("[role='radio']"),
    );
    expect(options.map((node) => node.textContent)).toEqual(["Left", "Right"]);
    expect(options.map((node) => node.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
    expect(screen.getByText("Side")).toBeTruthy();
  });

  it("writes the store at rest", () => {
    render(<SidebarSideRow />);

    pick("Sidebar side", "Right");

    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("right");
    expect(historyDepth()).toBe(0);
  });

  it("is one undo step in a session, and Discard puts it back", () => {
    beginSession();
    render(<SidebarSideRow />);

    pick("Sidebar side", "Right");
    expect(historyDepth()).toBe(1);

    useLayoutEditorStore.getState().undo();
    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("left");

    useLayoutEditorStore.getState().redo();
    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("right");

    useLayoutEditorStore.getState().discard();
    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("left");
  });

  it("offers a revert only while the side differs from the shipped one", () => {
    render(<SidebarSideRow />);
    expect(
      screen.queryByRole("button", { name: "Revert sidebar side" }),
    ).toBeNull();

    pick("Sidebar side", "Right");
    fireEvent.click(
      screen.getByRole("button", { name: "Revert sidebar side" }),
    );

    expect(useLayoutStore.getState().arrangement.sidebarSide).toBe("left");
    expect(
      screen.queryByRole("button", { name: "Revert sidebar side" }),
    ).toBeNull();
  });
});

/** The index group under one surface heading, by the heading's text. */
function indexGroup(label: string): HTMLElement | null {
  const heading = Array.from(
    document.querySelectorAll<HTMLElement>("div.uppercase"),
  ).find((node) => node.textContent === label);
  return heading?.parentElement ?? null;
}

describe("the dock's index", () => {
  it("draws Position under Tabs and Side under Sidebar, and neither elsewhere", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    const tabs = indexGroup("Tabs");
    const sidebar = indexGroup("Sidebar");
    expect(
      tabs?.querySelector("[role='radiogroup'][aria-label='Tabs position']"),
    ).not.toBeNull();
    expect(
      sidebar?.querySelector("[role='radiogroup'][aria-label='Sidebar side']"),
    ).not.toBeNull();
    for (const group of SURFACE_GROUPS) {
      if (group.id === "topBar" || group.id === "sidebar") continue;
      expect(
        indexGroup(group.label)?.querySelector("[role='radiogroup']") ?? null,
        group.id,
      ).toBeNull();
    }
  });

  it("keeps the Tabs heading and Position for a filter only the row matches", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    act(() => {
      useLayoutEditorStore.getState().setFilter("vertical tabs");
    });

    const tabs = indexGroup("Tabs");
    expect(
      tabs?.querySelector("[role='radiogroup'][aria-label='Tabs position']"),
    ).not.toBeNull();
    expect(tabs?.querySelector("[data-region-id]") ?? null).toBeNull();
    expect(indexGroup("Sidebar")).toBeNull();
    expect(screen.queryByText(/No region matches/)).toBeNull();
  });
});

describe("in the installed mobile app", () => {
  it("draws neither row", () => {
    setMobileApp(true);
    render(
      <>
        <TabStripPositionRow />
        <SidebarSideRow />
      </>,
    );

    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
