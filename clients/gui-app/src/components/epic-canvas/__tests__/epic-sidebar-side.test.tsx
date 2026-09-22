import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TabSurfaceActivityProvider } from "@/components/layout/tab-surface-activity";
import { EpicSidebarColumn } from "@/components/epic-canvas/sidebar/epic-sidebar-column";
import { EpicSurface } from "@/components/epic-tabs/epic-surface";
import { ChatFilterMenu } from "@/components/epic-canvas/sidebar/epic-sidebar-filter-menu";
import {
  SidebarSideContext,
  useSidebarPopoverSide,
} from "@/components/epic-canvas/sidebar/sidebar-side-context";
import { pointerEvent } from "@/components/epic-canvas/canvas/__tests__/test-pointer-events";
import {
  DEFAULT_SIDEBAR_WIDTH_PX,
  useLeftPanelStore,
} from "@/stores/epics/left-panel-store";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { useLayoutStore } from "@/stores/layout/layout-store";

const EPIC_ID = "sidebar-side-epic";
const TAB_ID = "sidebar-side-tab";
const HOST_ID = "sidebar-side-host";
const KEYBOARD_RESIZE_STEP_PX = 24;

// The column and surface tests below exercise `EpicSidebarColumn`'s own
// fragment ordering and `EpicSurface`'s row ordering - not the panel bodies
// or the rail's icon set, which the existing sidebar suites already cover.
// Stubbing both keeps the render light and keeps this suite from drifting
// when their internals change for unrelated reasons.
vi.mock("@/components/epic-canvas/sidebar/epic-sidebar", () => ({
  EpicLeftPanelHost: () => <div data-testid="epic-sidebar-host-stub" />,
  EpicLeftPanelLoadingHost: () => (
    <div data-testid="epic-sidebar-loading-stub" />
  ),
}));

vi.mock("@/components/epic-canvas/sidebar/epic-sidebar-rail", () => ({
  EpicLeftPanelRail: (props: { readonly orientation: string }) => (
    <div
      data-testid="epic-rail-live-stub"
      data-orientation={props.orientation}
    />
  ),
  EpicLeftPanelStaticRail: (props: { readonly orientation: string }) => (
    <div
      data-testid="epic-rail-static-stub"
      data-orientation={props.orientation}
    />
  ),
}));

vi.mock("@/lib/epic-selectors", () => ({
  useEpicSnapshotLoaded: () => true,
  useEpicSnapshotFetchError: () => null,
}));

// EpicSurface's own dependencies, stubbed the same minimal way
// `epic-surface.test.tsx` does: this suite is about which side the column
// renders on, not about session bootstrap or browser-session plumbing.
vi.mock("@tanstack/react-router", () => ({
  useMatch: () => undefined,
}));

vi.mock("@/hooks/ui/use-mobile-viewport", () => ({
  useIsMobileViewport: () => false,
}));

vi.mock("@/providers/epic-session-provider", () => ({
  EpicSessionProvider: (props: { readonly children: ReactNode }) => (
    <>{props.children}</>
  ),
}));

vi.mock("@/components/epic-canvas/renderers/browser-sessions-provider", () => ({
  BrowserSessionsProvider: (props: { readonly children: ReactNode }) => (
    <>{props.children}</>
  ),
}));

vi.mock("@/components/epic-canvas/epic-route-session-body", () => ({
  EpicRouteSessionBody: (props: { readonly tabId: string }) => (
    <div data-testid={`epic-canvas-body-${props.tabId}`} />
  ),
}));

vi.mock("@/components/epic-canvas/pip/agent-browser-pip", () => ({
  AgentBrowserPip: () => null,
}));

// Only reached by the direct rail render in the last describe block below,
// which imports the REAL rail module (bypassing the stub above) to check the
// indicator and tooltip mirror. Mirrors the same two mocks
// `epic-sidebar.test.tsx` uses to render the rail standalone.
vi.mock("@/components/epic-canvas/hooks/use-canvas-host-id", () => ({
  useCanvasHostId: () => HOST_ID,
}));
vi.mock("@/hooks/host/use-host-client-for-host-id", () => ({
  useHostDirectoryEntryForHostId: () => null,
  useHostClientForHostId: () => null,
}));

function resetStores() {
  window.localStorage.clear();
  useLeftPanelStore.setState({
    mainCollapsedByTabId: {},
    sidebarWidthPx: DEFAULT_SIDEBAR_WIDTH_PX,
  });
  useLayoutStore.setState({ arrangement: DEFAULT_ARRANGEMENT });
}

beforeEach(resetStores);
afterEach(() => {
  cleanup();
  resetStores();
});

function renderColumn(side: "left" | "right") {
  return render(
    <TooltipProvider>
      <div className="flex" data-testid="column-wrapper">
        <EpicSidebarColumn epicId={EPIC_ID} tabId={TAB_ID} side={side} />
      </div>
    </TooltipProvider>,
  );
}

function wrapperChildTestIds(): ReadonlyArray<string | undefined> {
  return [...screen.getByTestId("column-wrapper").children].map(
    (child) => (child as HTMLElement).dataset.testid,
  );
}

describe("<EpicSidebarColumn /> side (S-06)", () => {
  it("matches today's order and classes with the default (left) side", () => {
    renderColumn("left");

    expect(wrapperChildTestIds()).toEqual([
      "epic-sidebar-column",
      "epic-sidebar-resize-handle",
    ]);
    const handle = screen.getByTestId("epic-sidebar-resize-handle");
    expect(handle.className).toContain("before:left-0");
    expect(handle.className).toContain("before:rounded-tl-lg");
    expect(handle.className).toContain("before:border-l");
    expect(handle.className).not.toContain("before:right-0");
  });

  it("orders the fragment [handle, panel] for a right sidebar and mirrors the handle's edge classes", () => {
    renderColumn("right");

    expect(wrapperChildTestIds()).toEqual([
      "epic-sidebar-resize-handle",
      "epic-sidebar-column",
    ]);
    const handle = screen.getByTestId("epic-sidebar-resize-handle");
    expect(handle.className).toContain("before:right-0");
    expect(handle.className).toContain("before:rounded-tr-lg");
    expect(handle.className).toContain("before:border-r");
    expect(handle.className).not.toContain("before:left-0");
  });

  it("puts the collapsed rail at the pane's outer edge on both sides", () => {
    act(() => {
      useLeftPanelStore.getState().setMainCollapsed(TAB_ID, true);
    });

    renderColumn("left");
    expect(wrapperChildTestIds()).toEqual([
      "epic-rail-static-stub",
      "epic-sidebar-column",
      "epic-sidebar-resize-handle",
    ]);
    cleanup();

    renderColumn("right");
    expect(wrapperChildTestIds()).toEqual([
      "epic-sidebar-resize-handle",
      "epic-sidebar-column",
      "epic-rail-static-stub",
    ]);
  });

  function setUpRightDragSurface(): {
    readonly handle: HTMLElement;
    readonly panel: HTMLElement;
  } {
    renderColumn("right");
    const handle = screen.getByTestId("epic-sidebar-resize-handle");
    const panel = screen.getByTestId("epic-sidebar-column");
    const flexRow = handle.parentElement;
    if (flexRow === null) throw new Error("resize handle must have a parent");
    vi.spyOn(flexRow, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 1000, 800),
    );
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, DEFAULT_SIDEBAR_WIDTH_PX, 800),
    );
    return { handle, panel };
  }

  it("negates the drag delta for a right sidebar: dragging toward the canvas (leftward) widens the panel", () => {
    const { handle, panel } = setUpRightDragSurface();

    fireEvent(
      handle,
      pointerEvent("pointerdown", {
        pointerId: 7,
        clientX: 500,
        clientY: 10,
        button: 0,
      }),
    );
    fireEvent(
      handle,
      pointerEvent("pointermove", {
        pointerId: 7,
        clientX: 400,
        clientY: 10,
        button: 0,
      }),
    );

    expect(panel.style.width).toBe(`${DEFAULT_SIDEBAR_WIDTH_PX + 100}px`);

    fireEvent(
      handle,
      pointerEvent("pointerup", {
        pointerId: 7,
        clientX: 400,
        clientY: 10,
        button: 0,
      }),
    );
    expect(useLeftPanelStore.getState().sidebarWidthPx).toBe(
      DEFAULT_SIDEBAR_WIDTH_PX + 100,
    );
  });

  it("negates the arrow nudge for a right sidebar: ArrowLeft grows it, ArrowRight shrinks it", () => {
    const { handle } = setUpRightDragSurface();

    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(useLeftPanelStore.getState().sidebarWidthPx).toBe(
      DEFAULT_SIDEBAR_WIDTH_PX + KEYBOARD_RESIZE_STEP_PX,
    );

    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(useLeftPanelStore.getState().sidebarWidthPx).toBe(
      DEFAULT_SIDEBAR_WIDTH_PX,
    );
  });
});

describe("<EpicSurface /> sidebar side (S-06)", () => {
  function renderSurface(tabId: string, epicId: string) {
    return render(
      <TabSurfaceActivityProvider activity={{ visible: true, focused: true }}>
        <EpicSurface epicId={epicId} tabId={tabId} />
      </TabSurfaceActivityProvider>,
    );
  }

  function surfaceChildTestIds(tabId: string): ReadonlyArray<string> {
    const container = document.querySelector(`[data-epic-surface="${tabId}"]`);
    if (container === null) throw new Error("epic surface row not found");
    // The body slot is a plain wrapper div around `EpicRouteSessionBody`
    // (unchanged by this ticket), so its own testid is one level down.
    return [...container.children].map((child) => {
      const element = child as HTMLElement;
      return (
        element.dataset.testid ??
        element.querySelector("[data-testid]")?.getAttribute("data-testid") ??
        ""
      );
    });
  }

  it("puts the sidebar column before the body with the default (left) side", () => {
    renderSurface(TAB_ID, EPIC_ID);

    expect(surfaceChildTestIds(TAB_ID)).toEqual([
      "epic-sidebar-column",
      "epic-sidebar-resize-handle",
      `epic-canvas-body-${TAB_ID}`,
    ]);
  });

  it("puts the sidebar column after the body when sidebarSide is right", () => {
    act(() => {
      useLayoutStore.setState({
        arrangement: { ...DEFAULT_ARRANGEMENT, sidebarSide: "right" },
      });
    });

    renderSurface(TAB_ID, EPIC_ID);

    expect(surfaceChildTestIds(TAB_ID)).toEqual([
      `epic-canvas-body-${TAB_ID}`,
      "epic-sidebar-resize-handle",
      "epic-sidebar-column",
    ]);
  });

  it("agrees across two split panes, since the side is global", () => {
    act(() => {
      useLayoutStore.setState({
        arrangement: { ...DEFAULT_ARRANGEMENT, sidebarSide: "right" },
      });
    });

    render(
      <>
        <TabSurfaceActivityProvider activity={{ visible: true, focused: true }}>
          <EpicSurface epicId="epic-a" tabId="tab-a" />
        </TabSurfaceActivityProvider>
        <TabSurfaceActivityProvider
          activity={{ visible: true, focused: false }}
        >
          <EpicSurface epicId="epic-b" tabId="tab-b" />
        </TabSurfaceActivityProvider>
      </>,
    );

    expect(surfaceChildTestIds("tab-a")[0]).toBe("epic-canvas-body-tab-a");
    expect(surfaceChildTestIds("tab-b")[0]).toBe("epic-canvas-body-tab-b");
  });
});

describe("useSidebarPopoverSide() (S-06)", () => {
  function Probe() {
    const side = useSidebarPopoverSide();
    return <div data-testid="popover-side-probe" data-side={side} />;
  }

  it("opens right for the default (left) sidebar with no provider", () => {
    render(<Probe />);
    expect(screen.getByTestId("popover-side-probe").dataset.side).toBe("right");
  });

  it("opens left for a right-docked sidebar", () => {
    render(
      <SidebarSideContext.Provider value="right">
        <Probe />
      </SidebarSideContext.Provider>,
    );
    expect(screen.getByTestId("popover-side-probe").dataset.side).toBe("left");
  });

  it("opens right for an explicitly left-docked sidebar", () => {
    render(
      <SidebarSideContext.Provider value="left">
        <Probe />
      </SidebarSideContext.Provider>,
    );
    expect(screen.getByTestId("popover-side-probe").dataset.side).toBe("right");
  });
});

describe("<EpicLeftPanelStaticRail /> indicator mirror (S-06)", () => {
  it("mirrors the active indicator's edge for a right-docked sidebar", async () => {
    // Bypasses the module-level stub above to render the REAL rail: this is
    // the one place in this suite that checks the rail's own DOM, not the
    // column's fragment order.
    const { EpicLeftPanelStaticRail } = await vi.importActual<
      typeof import("@/components/epic-canvas/sidebar/epic-sidebar-rail")
    >("@/components/epic-canvas/sidebar/epic-sidebar-rail");

    render(
      <TooltipProvider>
        <SidebarSideContext.Provider value="right">
          <EpicLeftPanelStaticRail
            epicId={EPIC_ID}
            tabId={TAB_ID}
            orientation="vertical"
          />
        </SidebarSideContext.Provider>
      </TooltipProvider>,
    );

    // "chats" is the default active panel (DEFAULT_LEFT_PANEL_ID).
    const activeButton = screen.getByTestId("epic-rail-chats");
    const indicator = activeButton.querySelector(
      ".pointer-events-none.rounded-full.bg-primary",
    );
    if (indicator === null) throw new Error("active indicator not found");
    expect(indicator.className).toContain("right-0");
    expect(indicator.className).toContain("rounded-r-none");
    expect(indicator.className).not.toContain("left-0");

    // Radix opens a Tooltip on focus with no hover delay, unlike a pointer
    // hover (which waits on TooltipProvider's delayDuration) - the one open
    // path this suite can trigger synchronously in jsdom.
    fireEvent.focus(activeButton);
    expect(screen.getByRole("tooltip").getAttribute("data-side")).toBe("left");
  });
});

describe("a real sidebar popover under a right sidebar (S-06)", () => {
  it("opens ChatFilterMenu's content on data-side=left, not the hard-coded right", () => {
    render(
      <SidebarSideContext.Provider value="right">
        <ChatFilterMenu epicId={EPIC_ID} tabId={TAB_ID} canArchive={false} />
      </SidebarSideContext.Provider>,
    );

    // Radix's DropdownMenuTrigger opens on pointerdown, not the click event.
    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Filter agents" }),
      { button: 0 },
    );

    expect(
      screen
        .getByTestId("epic-sidebar-agent-view-menu")
        .getAttribute("data-side"),
    ).toBe("left");
  });
});
