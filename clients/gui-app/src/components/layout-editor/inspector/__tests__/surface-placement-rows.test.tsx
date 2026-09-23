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
  SideStripViewRow,
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

describe("<SideStripViewRow /> (D8)", () => {
  function withVerticalStrip(): void {
    useLayoutStore.setState({
      ...DEFAULT_LAYOUT_SNAPSHOT,
      layoutCarryDone: true,
      arrangement: {
        ...DEFAULT_LAYOUT_SNAPSHOT.arrangement,
        tabStripPlacement: "left",
      },
    });
  }

  it("draws Layered / Activity over the stored view", () => {
    render(<SideStripViewRow />);

    const options = Array.from(
      screen
        .getByRole("radiogroup", { name: "Tabs view" })
        .querySelectorAll("[role='radio']"),
    );
    expect(options.map((node) => node.textContent)).toEqual([
      "Layered",
      "Activity",
    ]);
    expect(options.map((node) => node.getAttribute("aria-checked"))).toEqual([
      "true",
      "false",
    ]);
    expect(screen.getByText("View")).toBeTruthy();
  });

  it("is disabled with a reason while the tabs are at the top, which is the shipped default", () => {
    render(<SideStripViewRow />);

    const options = screen
      .getByRole("radiogroup", { name: "Tabs view" })
      .querySelectorAll<HTMLButtonElement>("[role='radio']");
    expect([...options].every((option) => option.disabled)).toBe(true);
    expect(
      screen.getByText("Applies when tabs are at the left or right."),
    ).toBeTruthy();
  });

  it("is enabled with no status once the tabs move to a vertical strip", () => {
    withVerticalStrip();
    render(<SideStripViewRow />);

    const options = screen
      .getByRole("radiogroup", { name: "Tabs view" })
      .querySelectorAll<HTMLButtonElement>("[role='radio']");
    expect([...options].every((option) => option.disabled)).toBe(false);
    expect(
      screen.queryByText("Applies when tabs are at the left or right."),
    ).toBeNull();
  });

  it("writes the store at rest, with no history", () => {
    withVerticalStrip();
    render(<SideStripViewRow />);

    pick("Tabs view", "Activity");

    expect(useLayoutStore.getState().arrangement.sideStripView).toBe(
      "activity",
    );
    expect(historyDepth()).toBe(0);
  });

  it("is one undo step in a session, and Discard puts it back", () => {
    withVerticalStrip();
    beginSession();
    render(<SideStripViewRow />);

    pick("Tabs view", "Activity");
    expect(useLayoutStore.getState().arrangement.sideStripView).toBe(
      "activity",
    );
    expect(historyDepth()).toBe(1);

    useLayoutEditorStore.getState().undo();
    expect(useLayoutStore.getState().arrangement.sideStripView).toBe("layered");

    useLayoutEditorStore.getState().redo();
    expect(useLayoutStore.getState().arrangement.sideStripView).toBe(
      "activity",
    );

    useLayoutEditorStore.getState().discard();
    expect(useLayoutStore.getState().arrangement.sideStripView).toBe("layered");
  });

  it("offers a revert only while the view differs from the shipped one", () => {
    withVerticalStrip();
    render(<SideStripViewRow />);
    expect(
      screen.queryByRole("button", { name: "Revert tabs view" }),
    ).toBeNull();

    pick("Tabs view", "Activity");
    fireEvent.click(screen.getByRole("button", { name: "Revert tabs view" }));

    expect(useLayoutStore.getState().arrangement.sideStripView).toBe("layered");
    expect(
      screen.queryByRole("button", { name: "Revert tabs view" }),
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
  it("draws Position and View under Tabs and Side under Sidebar, and neither elsewhere", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    const tabs = indexGroup("Tabs");
    const sidebar = indexGroup("Sidebar");
    expect(
      tabs?.querySelector("[role='radiogroup'][aria-label='Tabs position']"),
    ).not.toBeNull();
    expect(
      tabs?.querySelector("[role='radiogroup'][aria-label='Tabs view']"),
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

/**
 * `LitSurfacePlacementRow` (D14, ticket 09): the dock half of the canvas's
 * placement bar, lit while its surface is the canvas selection.
 */
describe("the dock's placement row lights up with its surface", () => {
  function litRow(surface: "topBar" | "sidebar"): HTMLElement | null {
    return document.querySelector(`[data-surface-placement-row="${surface}"]`);
  }

  it("lights the Tabs row while topBar is selected, and no other row", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);
    expect(litRow("topBar")?.hasAttribute("data-lit")).toBe(false);

    act(() => {
      useLayoutEditorStore.getState().selectSurface("topBar");
    });

    expect(litRow("topBar")?.getAttribute("data-lit")).toBe("1");
    expect(litRow("sidebar")?.hasAttribute("data-lit")).toBe(false);
  });

  it("lights the Sidebar row while sidebar is selected", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    act(() => {
      useLayoutEditorStore.getState().selectSurface("sidebar");
    });

    expect(litRow("sidebar")?.getAttribute("data-lit")).toBe("1");
    expect(litRow("topBar")?.hasAttribute("data-lit")).toBe(false);
  });

  it("un-lights once the surface is deselected", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);
    act(() => {
      useLayoutEditorStore.getState().selectSurface("topBar");
    });
    expect(litRow("topBar")?.getAttribute("data-lit")).toBe("1");

    act(() => {
      useLayoutEditorStore.getState().popInspectorLevel();
    });

    expect(litRow("topBar")?.hasAttribute("data-lit")).toBe(false);
  });

  // Finding 4: unlike the "vertical tabs" filter above, which the Tabs
  // group's OWN keywords still match, this filter matches nothing about the
  // Tabs surface at all. The group must still survive - and its placement
  // row still light and be mountable for `scrollIntoView` - purely because
  // it is the canvas SELECTION, not because the filter let it through.
  it("keeps and lights the selected surface's row even under a filter the surface has nothing to do with", () => {
    render(<InspectorIndex onPreviewPreset={() => {}} />);

    act(() => {
      useLayoutEditorStore.getState().selectSurface("topBar");
      useLayoutEditorStore.getState().setFilter("minimap");
    });

    expect(indexGroup("Tabs")).not.toBeNull();
    expect(litRow("topBar")?.getAttribute("data-lit")).toBe("1");
    expect(
      litRow("topBar")?.querySelector(
        "[role='radiogroup'][aria-label='Tabs position']",
      ),
    ).not.toBeNull();
    // The unrelated filter still does its job for everything else.
    expect(indexGroup("Sidebar")).toBeNull();
  });
});

describe("in the installed mobile app", () => {
  it("draws none of the three rows (S-39)", () => {
    setMobileApp(true);
    render(
      <>
        <TabStripPositionRow />
        <SideStripViewRow />
        <SidebarSideRow />
      </>,
    );

    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});
