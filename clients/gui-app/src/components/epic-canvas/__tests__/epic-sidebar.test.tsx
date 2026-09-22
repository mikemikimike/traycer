import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  EpicLeftPanelHost,
  EpicLeftPanelLoadingHost,
} from "@/components/epic-canvas/sidebar/epic-sidebar";
import { EpicLeftPanelRail } from "@/components/epic-canvas/sidebar/epic-sidebar-rail";
import { useEpicDndStore } from "@/components/epic-canvas/dnd/dnd-store";
import type {
  EpicCanvasDropPreview,
  EpicCanvasLeftPanelRailDragData,
} from "@/components/epic-canvas/dnd/dnd";
import { useLeftPanelStore } from "@/stores/epics/left-panel-store";
import { type PanelVisibilityOverrideById } from "@/lib/left-panel-ids";
import {
  applyRail,
  clearRailVisibilityOverrides,
  currentLayoutArrangement,
  setRailVisibilityOverride,
} from "@/lib/layout/rail-view";
import { panelVisibilityOverridesFromValues } from "@/lib/layout/rail";
import { moveRailPanelBeside } from "@/lib/layout/layout-arrangement";
import { effectiveLayoutValues } from "@/lib/layout/layout-presets";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { PaneVisibilityContext } from "@/components/epic-tabs/pane-visibility-context";
import {
  prPresenceScopeKey,
  usePrPresenceStore,
} from "@/stores/epics/pr-presence-store";
import {
  tabSurfaceKey,
  useSurfaceHostSelectionStore,
} from "@/stores/host/surface-host-selection-store";
import { SidebarProvider } from "@/components/ui/sidebar";
import { persistKey, STORE_KEYS } from "@/lib/persist";

interface CapturedDroppableInput {
  readonly id: string;
  readonly data: unknown;
}

interface TestState {
  droppableInputs: CapturedDroppableInput[];
  draggableInputs: CapturedDroppableInput[];
  activeArtifactId: string | null;
  activeArtifact: { readonly kind: "spec" } | null;
}

const testState = vi.hoisted<TestState>(() => ({
  droppableInputs: [],
  draggableInputs: [],
  activeArtifactId: null,
  activeArtifact: null,
}));

const browserPanelState = vi.hoisted(() => ({
  value: {
    lifecycle: "live" as const,
    items: [],
    errorMessage: null,
    retry: vi.fn(),
    closeTab: vi.fn(() => Promise.resolve()),
  },
}));

const browserCanvasState = vi.hoisted(() => ({
  prepareOpenTileInTabFocusTarget: vi.fn(),
  prepareSetActiveTileTabFocusTarget: vi.fn(),
}));

const tileNavigationMocks = vi.hoisted(() => ({
  openTile: vi.fn(),
}));
vi.mock("@/hooks/epic/use-epic-tile-navigation", () => ({
  useEpicTileNavigation: () => tileNavigationMocks,
}));

vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    useDroppable: (input: CapturedDroppableInput) => {
      testState.droppableInputs.push(input);
      return {
        setNodeRef: () => undefined,
        isOver: false,
      };
    },
    useDraggable: (input: CapturedDroppableInput) => {
      testState.draggableInputs.push(input);
      return {
        setNodeRef: () => undefined,
        listeners: undefined,
        attributes: {},
        isDragging: false,
      };
    },
  };
});

vi.mock("@/stores/epics/canvas/store", () => ({
  useActiveEpicArtifactId: () => testState.activeArtifactId,
  useEpicCanvasStore: (
    selector: (state: typeof browserCanvasState) => unknown,
  ) => selector(browserCanvasState),
  findOpenArtifactInTab: () => null,
}));

vi.mock("@/components/epic-canvas/renderers/browser-sessions-context", () => ({
  useBrowserSessionsContext: () => browserPanelState.value,
}));
vi.mock("@/components/epic-canvas/renderers/browser-sessions-provider", () => ({
  BrowserSessionsHostProvider: (props: { readonly children: ReactNode }) =>
    props.children,
  BrowserSessionsHostBoundary: (props: { readonly children: ReactNode }) =>
    props.children,
}));

vi.mock("@/hooks/epic/use-epic-nested-focus-navigation", () => ({
  useEpicNestedFocusNavigation:
    () => (_epicId: string, _tabId: string, prepare: () => unknown) =>
      prepare(),
}));

vi.mock("@/components/epic-canvas/sidebar/epic-terminal-sidebar", () => ({
  TerminalsPanelActions: () => null,
  TerminalsPanelBody: () => <div data-testid="epic-test-terminals-body" />,
}));

vi.mock("@/components/epic-canvas/pr/pr-panel-body", () => ({
  PrPanelBody: () => <div data-testid="epic-test-pr-body" />,
}));
vi.mock("@/components/epic-canvas/git-diff/git-diff-panel-body-live", () => ({
  GitDiffPanelBodyLive: () => <div data-testid="epic-test-git-diff-body" />,
}));

vi.mock("@/components/epic-canvas/sidebar/epic-sidebar-artifact-tree", () => ({
  ArtifactReadLifecycleBridge: () => null,
  ArtifactTreePanelBody: () => null,
}));

vi.mock("@/lib/epic-selectors", () => ({
  useEpicArtifact: () => testState.activeArtifact,
  useEpicChatRecords: () => [],
  useEpicArtifactRecords: () => [],
  useAncestorIds: () => [],
  useRootIds: () => [],
  useEpicPermissionRole: () => "owner",
  useEpicConnectionStatus: () => "open",
}));

// The rail and panel hosts read PR presence under the CANVAS host - the Epic
// session's - which is the key `pr-panel-body.tsx` records it under. This
// suite used to seed the app-wide read instead; after the readers were
// re-pointed that mock would have been stranded (installed, never read) and
// the PR rail item would have silently vanished from every assertion below,
// which is exactly the producer/consumer split the re-point fixed.
vi.mock("@/components/epic-canvas/hooks/use-canvas-host-id", () => ({
  useCanvasHostId: () => HOST_ID,
}));
vi.mock("@/hooks/host/use-host-client-for-host-id", () => ({
  useHostDirectoryEntryForHostId: () => ({ label: "Test host" }),
  useHostClientForHostId: () => null,
}));

const EPIC_ID = "epic-sidebar-test";
const TAB_ID = "epic-sidebar-tab";
const PINNED_HOST_ID = "epic-sidebar-pinned-host";

// One client for the file's lifetime - a fresh one per render strands
// observers on the old one.
const testQueryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, gcTime: 0 },
    mutations: { retry: false },
  },
});
const HOST_ID = "epic-sidebar-host";

function resetLeftPanelStore(): void {
  window.localStorage.clear();
  useSurfaceHostSelectionStore.setState({ selections: {} });
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
  useLeftPanelStore.setState({
    activePanelIdByTabId: {},
    mainCollapsedByTabId: {},
    commentsPanelRevealedByTabId: {},
    localRootCreatePendingByEpicPanel: {},
    acknowledgedRootCreatePendingByEpicPanel: {},
  });
}

/** The rail's show/hide, which lives in the layout store now (one region each). */
function visibilityOverrides(): PanelVisibilityOverrideById {
  const state = useLayoutStore.getState();
  return panelVisibilityOverridesFromValues(
    effectiveLayoutValues(state.basePreset, state.overrides),
  );
}

/**
 * The Pull Requests panel is presence-gated, so the rail only carries its icon
 * once this epic has observed a PR. Rail-geometry tests want the full default
 * complement of panels, so they seed presence; the gate itself is covered
 * separately below.
 */
function setPullRequestPresenceForHost(
  hostId: string,
  hasPullRequests: boolean,
): void {
  usePrPresenceStore.setState({
    hasItemsByScopeKey: hasPullRequests
      ? { [prPresenceScopeKey(hostId, EPIC_ID)]: true }
      : {},
  });
}

function setPullRequestPresence(hasPullRequests: boolean): void {
  setPullRequestPresenceForHost(HOST_ID, hasPullRequests);
}

function pinPullRequestsTo(hostId: string): void {
  useSurfaceHostSelectionStore
    .getState()
    .setSelection(tabSurfaceKey("pull-requests", TAB_ID), hostId);
}

function resetDndStore(): void {
  useEpicDndStore.getState().dragEnded();
}

function setRailDragState(
  source: EpicCanvasLeftPanelRailDragData,
  preview: EpicCanvasDropPreview,
): void {
  useEpicDndStore.setState({ activeSource: source, dropPreview: preview });
}

function resetTestState(): void {
  testState.droppableInputs = [];
  testState.draggableInputs = [];
  testState.activeArtifactId = null;
  testState.activeArtifact = null;
  tileNavigationMocks.openTile.mockClear();
}

describe("<EpicLeftPanelRail />", () => {
  beforeEach(() => {
    resetLeftPanelStore();
    resetDndStore();
    resetTestState();
    setPullRequestPresence(true);
  });

  afterEach(() => {
    cleanup();
    resetLeftPanelStore();
    resetDndStore();
    resetTestState();
    setPullRequestPresence(false);
  });

  it("does not open the graph when another rail entry is activated", () => {
    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="vertical"
      />,
    );

    fireEvent.click(screen.getByTestId("epic-rail-terminals"));

    expect(tileNavigationMocks.openTile).not.toHaveBeenCalled();
  });

  it("renders default registry panels and registers rail icon and background drop targets", () => {
    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="vertical"
      />,
    );

    // Every default panel draws its own rail icon (L-155): there is no group
    // concept left to combine Agents and Artifacts under one button.
    expect(screen.getByTestId("epic-rail-chats")).not.toBeNull();
    expect(screen.getByTestId("epic-rail-artifacts")).not.toBeNull();
    expect(screen.getByTestId("epic-rail-terminals")).not.toBeNull();
    expect(screen.getByTestId("epic-rail-browsers")).not.toBeNull();
    expect(screen.getByTestId("epic-rail-git-diff")).not.toBeNull();
    expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();
    expect(screen.getByTestId("epic-rail-file-tree")).not.toBeNull();
    expect(screen.getByTestId("epic-rail-sharing")).not.toBeNull();
    expect(screen.queryByTestId("epic-rail-comments")).toBeNull();

    expect(
      testState.droppableInputs.find(
        (input) =>
          input.id === `left-panel-rail-list-target:${EPIC_ID}:pane:${TAB_ID}`,
      ),
    ).not.toBeUndefined();
    expect(
      testState.droppableInputs.find(
        (input) => input.id === `left-panel-rail-target:chats:pane:${TAB_ID}`,
      ),
    ).not.toBeUndefined();
  });

  it("draws the shipped rail as nine evenly spaced icons with no dividers", () => {
    // "Every panel available": comments needs its own reveal + a commentable
    // artifact, same as `revealCommentsPanel` below.
    testState.activeArtifactId = "artifact-1";
    testState.activeArtifact = { kind: "spec" };
    useLeftPanelStore.getState().revealCommentsPanel(TAB_ID);

    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="vertical"
      />,
    );

    const rail = screen.getByTestId("epic-sidebar-rail");
    expect(
      Array.from(rail.children).map((child) =>
        child.getAttribute("data-testid"),
      ),
    ).toEqual([
      "epic-rail-chats",
      "epic-rail-artifacts",
      "epic-rail-terminals",
      "epic-rail-browsers",
      "epic-rail-git-diff",
      "epic-rail-pull-requests",
      "epic-rail-file-tree",
      "epic-rail-sharing",
      "epic-rail-comments",
    ]);
    // The shipped rail (`DEFAULT_RAIL`) carries no divider entries - the
    // rail's own `gap-1` is the only spacing between icons, and no button
    // adds a margin of its own on top of it.
    expect(screen.queryAllByTestId("epic-rail-divider")).toHaveLength(0);
    expect(rail.className).toContain("gap-1");
    for (const child of Array.from(rail.children)) {
      expect(child.className).not.toMatch(/\bm[xytrbl]?-\d/);
    }
    // A button's accessible name is now its own panel's title - never a
    // "X + Y" label for a group that no longer exists.
    expect(
      screen.getByTestId("epic-rail-chats").getAttribute("aria-label"),
    ).toBe("Agents");
  });

  it("namespaces duplicate Epic rail registrations by view tab", () => {
    render(
      <>
        <EpicLeftPanelRail
          epicId={EPIC_ID}
          tabId="pane-a"
          orientation="vertical"
        />
        <EpicLeftPanelRail
          epicId={EPIC_ID}
          tabId="pane-b"
          orientation="vertical"
        />
      </>,
    );

    const ids = [
      ...testState.droppableInputs.map((input) => input.id),
      ...testState.draggableInputs.map((input) => input.id),
    ];
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => id.endsWith(":pane:pane-a"))).toBe(true);
    expect(ids.some((id) => id.endsWith(":pane:pane-b"))).toBe(true);
  });

  it("switches inactive rail icons and toggles collapse on the active panel", () => {
    useLeftPanelStore.getState().setMainCollapsed(TAB_ID, true);
    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="vertical"
      />,
    );

    fireEvent.click(screen.getByTestId("epic-rail-terminals"));

    expect(useLeftPanelStore.getState().getActivePanelId(TAB_ID)).toBe(
      "terminals",
    );
    expect(useLeftPanelStore.getState().isMainCollapsed(TAB_ID)).toBe(false);

    fireEvent.click(screen.getByTestId("epic-rail-terminals"));

    expect(useLeftPanelStore.getState().isMainCollapsed(TAB_ID)).toBe(true);
  });

  it("collapses on a click of the LIT icon, even when the active panel is hidden (R5R-09)", () => {
    // The rail lights whatever the body fell back to, so the click handler has
    // to compare against THAT and not against `activePanelId`. It used to take
    // the "switch panels" branch here, so the first click did nothing visible
    // and only the second collapsed the column.
    useLeftPanelStore.getState().setActivePanelId(TAB_ID, "chats");
    act(() => {
      setRailVisibilityOverride("chats", false);
    });
    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="vertical"
      />,
    );

    // Agents is hidden, so the body and the rail both fall back to Artifacts.
    expect(screen.queryByTestId("epic-rail-chats")).toBeNull();
    expect(
      screen.getByTestId("epic-rail-artifacts").getAttribute("aria-current"),
    ).toBe("true");

    fireEvent.click(screen.getByTestId("epic-rail-artifacts"));

    expect(useLeftPanelStore.getState().isMainCollapsed(TAB_ID)).toBe(true);
  });

  it("uses a bottom indicator instead of a filled tile for the active horizontal rail icon", () => {
    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="horizontal"
      />,
    );

    const activeRailButton = screen.getByTestId("epic-rail-chats");

    expect(activeRailButton.className).toContain("hover:bg-transparent");
    expect(activeRailButton.className).not.toContain("bg-accent");
    expect(activeRailButton.innerHTML).toContain("bottom-0");
  });

  it("renders comments only after reveal with an active commentable artifact", () => {
    testState.activeArtifactId = "artifact-1";
    testState.activeArtifact = { kind: "spec" };
    useLeftPanelStore.getState().revealCommentsPanel(TAB_ID);

    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="vertical"
      />,
    );

    expect(screen.getByTestId("epic-rail-comments")).not.toBeNull();
  });

  it("shows the rail drop slot for a section-origin drop on rail background", () => {
    setRailDragState(
      {
        kind: "left-panel-rail-item",
        viewTabId: TAB_ID,
        panelId: "artifacts",
        origin: "panel-section",
      },
      { kind: "left-panel-rail-list", viewTabId: TAB_ID },
    );

    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="vertical"
      />,
    );

    expect(screen.getByTestId("epic-rail-panel-drop-slot")).not.toBeNull();
    expect(
      screen
        .getByTestId("epic-sidebar-rail")
        .lastElementChild?.getAttribute("data-testid"),
    ).toBe("epic-rail-panel-drop-slot");
  });

  it("renders one canonical rail boundary for equivalent before and after drops", () => {
    setRailDragState(
      {
        kind: "left-panel-rail-item",
        viewTabId: TAB_ID,
        panelId: "sharing",
        origin: "rail",
      },
      {
        kind: "left-panel-rail",
        viewTabId: TAB_ID,
        panelId: "terminals",
        position: "after",
      },
    );

    render(
      <EpicLeftPanelRail
        epicId={EPIC_ID}
        tabId={TAB_ID}
        orientation="vertical"
      />,
    );

    expect(screen.getAllByTestId("epic-rail-panel-drop-line")).toHaveLength(1);
    expect(screen.queryByTestId("epic-rail-panel-drop-slot")).toBeNull();
    expect(
      Array.from(screen.getByTestId("epic-sidebar-rail").children).map(
        (element) => element.getAttribute("data-testid"),
      ),
    ).toEqual([
      "epic-rail-chats",
      "epic-rail-artifacts",
      "epic-rail-terminals",
      "epic-rail-panel-drop-line",
      "epic-rail-browsers",
      "epic-rail-git-diff",
      "epic-rail-pull-requests",
      "epic-rail-file-tree",
      "epic-rail-sharing",
    ]);
  });

  /**
   * A divider is a spacer the user adds to the rail (L-155): at rest it draws
   * as the rail's own gap and nothing more, and it becomes a handle only for
   * the rail the user is actually customizing (L-109, R3-06). The shipped
   * rail carries none, so most of these seed one first.
   */
  describe("dividers", () => {
    function renderRail(paneVisible: boolean) {
      return render(
        <PaneVisibilityContext value={paneVisible}>
          <EpicLeftPanelRail
            epicId={EPIC_ID}
            tabId={TAB_ID}
            orientation="vertical"
          />
        </PaneVisibilityContext>,
      );
    }

    function seedRailWithDivider(): void {
      const rail = currentLayoutArrangement().rail;
      applyRail([
        ...rail.slice(0, 3),
        { kind: "divider", id: "divider:1" },
        ...rail.slice(3),
      ]);
    }

    afterEach(() => {
      useLayoutEditorStore.getState().endSession();
    });

    it("draws nothing between panels at rest, so the shipped rail is its buttons", () => {
      renderRail(true);

      const rail = screen.getByTestId("epic-sidebar-rail");
      // Every child is a panel button: no divider entry exists on the
      // shipped rail, so there is nothing else to draw.
      for (const child of rail.children) expect(child.tagName).toBe("BUTTON");
      expect(screen.queryAllByTestId("epic-rail-divider")).toHaveLength(0);
    });

    it("draws an added divider as a plain resting spacer outside a session", () => {
      seedRailWithDivider();

      renderRail(true);

      const dividers = screen.getAllByTestId("epic-rail-divider");
      expect(dividers).toHaveLength(1);
      expect(dividers[0].hasAttribute("data-rail-divider-resting")).toBe(true);
      expect(dividers[0].getAttribute("data-layout-draggable")).toBeNull();
    });

    it("becomes a draggable rail member while this pane is being customized", () => {
      seedRailWithDivider();
      useLayoutEditorStore.getState().beginSession({
        entry: "pointer",
        source: "direct_ui",
        startedAt: 0,
      });

      renderRail(true);

      const dividers = screen.getAllByTestId("epic-rail-divider");
      expect(dividers.length).toBeGreaterThan(0);
      for (const element of dividers) {
        expect(element.getAttribute("data-layout-draggable")).toBe("1");
        expect(element.getAttribute("data-layout-group")).toBe("rail");
        expect(element.getAttribute("data-layout-member")).toMatch(/^divider:/);
        expect(element.hasAttribute("data-rail-divider-resting")).toBe(false);
      }
    });

    it("marks nothing draggable in a hidden pane's rail during a session", () => {
      seedRailWithDivider();
      useLayoutEditorStore.getState().beginSession({
        entry: "pointer",
        source: "direct_ui",
        startedAt: 0,
      });

      renderRail(false);

      expect(
        screen
          .getByTestId("epic-sidebar-rail")
          .querySelectorAll("[data-layout-draggable]"),
      ).toHaveLength(0);
      // The divider is still drawn - just as the same resting spacer it is
      // outside a session, never omitted.
      for (const divider of screen.getAllByTestId("epic-rail-divider")) {
        expect(divider.hasAttribute("data-rail-divider-resting")).toBe(true);
      }
    });
  });

  describe("Pull Requests presence gate", () => {
    function renderRail() {
      return render(
        <EpicLeftPanelRail
          epicId={EPIC_ID}
          tabId={TAB_ID}
          orientation="vertical"
        />,
      );
    }

    it("keeps the rail icon while the epic has a PR", () => {
      renderRail();

      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();
    });

    it("drops the rail icon for an epic with no PRs", () => {
      setPullRequestPresence(false);
      renderRail();

      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();
      // The gate must not disturb its neighbours in the rail.
      expect(screen.getByTestId("epic-rail-git-diff")).not.toBeNull();
      expect(screen.getByTestId("epic-rail-file-tree")).not.toBeNull();
    });

    it("keeps the rail icon for a PR-less epic the user checked on", () => {
      setPullRequestPresence(false);
      setRailVisibilityOverride("pull-requests", true);
      renderRail();

      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();
    });

    it("drops the rail icon for a populated epic the user unchecked", () => {
      setRailVisibilityOverride("pull-requests", false);
      renderRail();

      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();
    });

    it("scopes presence to the active host", () => {
      // A baseline recorded under a different host must not reveal the panel
      // here - PR discovery is per (hostId, epicId).
      usePrPresenceStore.setState({
        hasItemsByScopeKey: {
          [prPresenceScopeKey("some-other-host", EPIC_ID)]: true,
        },
      });
      renderRail();

      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();
    });
  });
  describe("presence still reveals a gated panel", () => {
    function renderRail() {
      return render(
        <EpicLeftPanelRail
          epicId={EPIC_ID}
          tabId={TAB_ID}
          orientation="vertical"
        />,
      );
    }

    it("adds the Pull Requests icon the moment a PR is discovered", () => {
      setPullRequestPresence(false);
      renderRail();
      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();

      act(() => {
        setPullRequestPresence(true);
      });

      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();
    });

    it("adds the Comments icon the moment the panel is revealed", () => {
      testState.activeArtifactId = "artifact-1";
      testState.activeArtifact = { kind: "spec" };
      renderRail();
      expect(screen.queryByTestId("epic-rail-comments")).toBeNull();

      act(() => {
        useLeftPanelStore.getState().revealCommentsPanel(TAB_ID);
      });

      expect(screen.getByTestId("epic-rail-comments")).not.toBeNull();
    });

    it("keeps a panel the user switched off hidden when presence arrives", () => {
      // The whole point of the override: an explicit "off" outranks the
      // presence gate, in both directions and at any later moment.
      setPullRequestPresence(false);
      setRailVisibilityOverride("pull-requests", false);
      setRailVisibilityOverride("comments", false);
      testState.activeArtifactId = "artifact-1";
      testState.activeArtifact = { kind: "spec" };
      renderRail();

      act(() => {
        setPullRequestPresence(true);
        useLeftPanelStore.getState().revealCommentsPanel(TAB_ID);
      });

      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();
      expect(screen.queryByTestId("epic-rail-comments")).toBeNull();
    });

    it("resumes following presence once the override is cleared", () => {
      setPullRequestPresence(true);
      setRailVisibilityOverride("pull-requests", false);
      renderRail();
      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();

      act(() => {
        clearRailVisibilityOverrides();
      });

      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();
    });
  });

  describe("host-pinned Pull Requests availability", () => {
    function renderLiveHost(): void {
      render(
        <SidebarProvider>
          <EpicLeftPanelHost epicId={EPIC_ID} tabId={TAB_ID} side="left" />
        </SidebarProvider>,
      );
    }

    function renderLoadingHost(): void {
      render(
        <SidebarProvider>
          <EpicLeftPanelLoadingHost
            epicId={EPIC_ID}
            tabId={TAB_ID}
            side="left"
          />
        </SidebarProvider>,
      );
    }

    function renderRail(): void {
      render(
        <EpicLeftPanelRail
          epicId={EPIC_ID}
          tabId={TAB_ID}
          orientation="vertical"
        />,
      );
    }

    it("uses the persisted B pin for live, loading and rail availability", () => {
      pinPullRequestsTo(PINNED_HOST_ID);
      setPullRequestPresenceForHost(PINNED_HOST_ID, true);
      useLeftPanelStore.getState().setActivePanelId(TAB_ID, "pull-requests");

      renderLiveHost();
      expect(
        screen.getByTestId("epic-sidebar").getAttribute("data-left-panel-id"),
      ).toBe("pull-requests");

      cleanup();
      renderLoadingHost();
      expect(
        screen.getByTestId("epic-sidebar").getAttribute("data-left-panel-id"),
      ).toBe("pull-requests");

      cleanup();
      renderRail();
      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();
    });

    it("follows canvas host A when unpinned and ignores B-only presence", () => {
      setPullRequestPresenceForHost(PINNED_HOST_ID, true);
      renderRail();
      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();

      act(() => {
        setPullRequestPresenceForHost(HOST_ID, true);
      });

      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();
    });

    it("retains an active PR panel across A-to-B selection until B is observed", () => {
      setPullRequestPresenceForHost(HOST_ID, true);
      useLeftPanelStore.getState().setActivePanelId(TAB_ID, "pull-requests");
      const rendered = render(
        <EpicLeftPanelRail
          epicId={EPIC_ID}
          tabId={TAB_ID}
          orientation="vertical"
        />,
      );

      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();

      act(() => {
        pinPullRequestsTo(PINNED_HOST_ID);
        usePrPresenceStore.setState({ hasItemsByScopeKey: {} });
      });

      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();

      act(() => {
        useLeftPanelStore.getState().setActivePanelId(TAB_ID, "chats");
      });
      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();

      act(() => {
        setPullRequestPresenceForHost(PINNED_HOST_ID, true);
      });
      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();

      act(() => {
        setRailVisibilityOverride("pull-requests", false);
      });
      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();

      rendered.unmount();
    });
  });

  describe("rail context menu", () => {
    function renderRail() {
      return render(
        <EpicLeftPanelRail
          epicId={EPIC_ID}
          tabId={TAB_ID}
          orientation="vertical"
        />,
      );
    }

    function openRailMenu(): void {
      fireEvent.contextMenu(screen.getByTestId("epic-sidebar-rail"));
    }

    it("lists every panel with its current visibility", () => {
      testState.activeArtifactId = "artifact-1";
      testState.activeArtifact = { kind: "spec" };
      renderRail();
      openRailMenu();

      // Every panel in the registry is offered, not just the gated ones - the
      // menu is the only place a hidden panel can be found again.
      expect(
        screen
          .getAllByRole("menuitemcheckbox")
          .map((item) => item.textContent.replace(/No PRs yet|Needs.*/, "")),
      ).toEqual([
        "Agents",
        "Terminals",
        "Browsers",
        "Artifacts",
        "Git Diff",
        "Pull Requests",
        "File Tree",
        "Sharing",
        "Comments",
      ]);
      // Checked state mirrors the rail: PRs are present, comments are not yet
      // revealed.
      expect(
        screen
          .getByTestId("epic-rail-toggle-pull-requests")
          .getAttribute("aria-checked"),
      ).toBe("true");
      expect(
        screen
          .getByTestId("epic-rail-toggle-comments")
          .getAttribute("aria-checked"),
      ).toBe("false");
    });

    it("hides a panel when its item is unchecked", () => {
      renderRail();
      openRailMenu();

      fireEvent.click(screen.getByTestId("epic-rail-toggle-terminals"));

      expect(visibilityOverrides()).toEqual({
        terminals: false,
      });
      expect(screen.queryByTestId("epic-rail-terminals")).toBeNull();
    });

    it("reveals a presence-gated panel when its item is checked", () => {
      setPullRequestPresence(false);
      renderRail();
      expect(screen.queryByTestId("epic-rail-pull-requests")).toBeNull();

      openRailMenu();
      fireEvent.click(screen.getByTestId("epic-rail-toggle-pull-requests"));

      expect(screen.getByTestId("epic-rail-pull-requests")).not.toBeNull();
    });

    it("stores nothing when the checked value already matches the panel's rule", () => {
      renderRail();
      openRailMenu();

      // Re-checking an already-visible panel must not freeze today's answer:
      // Pull Requests has to keep following PR discovery. Selecting closes the
      // menu, so the second toggle needs it reopened.
      fireEvent.click(screen.getByTestId("epic-rail-toggle-pull-requests"));
      openRailMenu();
      fireEvent.click(screen.getByTestId("epic-rail-toggle-pull-requests"));

      expect(visibilityOverrides()).toEqual({});
    });

    it("offers a direct hide for the icon that was right-clicked", () => {
      renderRail();

      fireEvent.contextMenu(screen.getByTestId("epic-rail-terminals"));
      fireEvent.click(screen.getByTestId("epic-rail-hide-pointed-panel"));

      expect(visibilityOverrides()).toEqual({
        terminals: false,
      });
    });

    it("omits the direct hide when the empty rail was right-clicked", () => {
      renderRail();
      openRailMenu();

      expect(screen.queryByTestId("epic-rail-hide-pointed-panel")).toBeNull();
    });

    it("targets the icon under the pointer, not the last one right-clicked", () => {
      renderRail();

      fireEvent.contextMenu(screen.getByTestId("epic-rail-terminals"));
      expect(
        screen.getByTestId("epic-rail-hide-pointed-panel").textContent,
      ).toBe("Hide 'Terminals'");

      // Rail background next: the capture-phase reset has to clear the panel
      // the previous right-click recorded.
      openRailMenu();
      expect(screen.queryByTestId("epic-rail-hide-pointed-panel")).toBeNull();
    });

    it("resets every override at once", () => {
      setRailVisibilityOverride("sharing", false);
      setRailVisibilityOverride("comments", true);
      renderRail();
      openRailMenu();

      fireEvent.click(screen.getByTestId("epic-rail-reset-panel-visibility"));

      expect(visibilityOverrides()).toEqual({});
    });

    it("omits the reset item while nothing is overridden", () => {
      renderRail();
      openRailMenu();

      expect(
        screen.queryByTestId("epic-rail-reset-panel-visibility"),
      ).toBeNull();
    });

    it("refuses to hide the last visible panel", () => {
      for (const panelId of [
        "terminals",
        "browsers",
        "artifacts",
        "git-diff",
        "pull-requests",
        "file-tree",
        "sharing",
      ] as const) {
        setRailVisibilityOverride(panelId, false);
      }
      renderRail();
      openRailMenu();

      // Agents is all that is left; the body always renders some panel, so an
      // empty rail would leave nothing to click back with.
      const lastItem = screen.getByTestId("epic-rail-toggle-chats");
      expect(lastItem.getAttribute("data-disabled")).not.toBeNull();
      expect(screen.queryByTestId("epic-rail-hide-pointed-panel")).toBeNull();

      fireEvent.click(lastItem);
      expect(visibilityOverrides().chats).toBeUndefined();
    });

    it("highlights the fallback icon when the active panel is hidden", () => {
      useLeftPanelStore.getState().setActivePanelId(TAB_ID, "sharing");
      setRailVisibilityOverride("sharing", false);
      renderRail();

      // The body falls back to Agents, so the rail must mark Agents - not sit
      // with no icon current at all.
      expect(
        screen.getByTestId("epic-rail-chats").getAttribute("aria-current"),
      ).toBe("true");
    });
  });
});

/**
 * The sidebar body draws the one panel the rail says is active, and it draws
 * it WHOLE (L-157, R5R-01).
 *
 * Per-panel section collapse is deleted, and the case that forced it is an
 * upgrade rather than a gesture: a user who collapsed Artifacts while it was
 * stacked under Chats had `{artifacts: true}` written to localStorage, which
 * was harmless while a sibling took the space. With one panel in the body a
 * honoured flag is a title row over an empty column, and the rail cannot clear
 * it - clicking the lit icon collapses the whole main panel instead.
 */
describe("the displayed panel is never collapsed (L-157)", () => {
  beforeEach(() => {
    resetLeftPanelStore();
    resetDndStore();
    resetTestState();
    setPullRequestPresence(false);
  });

  afterEach(() => {
    cleanup();
    resetLeftPanelStore();
    resetDndStore();
    resetTestState();
  });

  function renderHost(): void {
    render(
      <QueryClientProvider client={testQueryClient}>
        <SidebarProvider>
          <EpicLeftPanelHost epicId={EPIC_ID} tabId={TAB_ID} side="left" />
        </SidebarProvider>
      </QueryClientProvider>,
    );
  }

  it("draws the body for a panel a persisted collapse flag names", async () => {
    // The shape the shipped build wrote: the flag is a key this store no
    // longer has, so it must be inert rather than obeyed.
    window.localStorage.setItem(
      persistKey(STORE_KEYS.leftPanel),
      JSON.stringify({
        state: {
          activePanelIdByTabId: { [TAB_ID]: "terminals" },
          panelSectionCollapsedByPanelId: { terminals: true },
        },
        version: 3,
      }),
    );
    await useLeftPanelStore.persist.rehydrate();
    renderHost();

    // The body itself, not just its title row: a collapsed section rendered
    // the header alone, with nothing under it.
    expect(screen.getByTestId("epic-test-terminals-body")).toBeTruthy();
    expect(
      screen.getByTestId("epic-left-panel-section-terminals").children.length,
    ).toBeGreaterThan(1);
  });

  it("offers no collapse control on the section header", () => {
    useLeftPanelStore.getState().setActivePanelId(TAB_ID, "terminals");
    renderHost();

    // The chevron and the title-as-button are both gone: the sidebar's one
    // collapse lives on the rail, as `mainCollapsedByTabId`.
    expect(screen.queryByRole("button", { name: /^Collapse /u })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Expand /u })).toBeNull();
  });
});

describe("Browsers panel registration", () => {
  beforeEach(() => {
    resetLeftPanelStore();
    resetDndStore();
    resetTestState();
    setPullRequestPresence(false);
    browserPanelState.value = {
      lifecycle: "live",
      items: [],
      errorMessage: null,
      retry: vi.fn(),
      closeTab: vi.fn(() => Promise.resolve()),
    };
    browserCanvasState.prepareOpenTileInTabFocusTarget.mockReset();
    browserCanvasState.prepareSetActiveTileTabFocusTarget.mockReset();
  });

  afterEach(() => {
    cleanup();
    resetLeftPanelStore();
    resetDndStore();
    resetTestState();
    setPullRequestPresence(false);
  });

  it("activates the registered browser body and keeps sibling panel mechanics", () => {
    useLeftPanelStore.getState().setActivePanelId(TAB_ID, "terminals");

    // The browsers body reaches Query through its add action, so this panel
    // cannot mount without a client - unlike the siblings it is compared to.
    render(
      <QueryClientProvider client={testQueryClient}>
        <EpicLeftPanelRail
          epicId={EPIC_ID}
          tabId={TAB_ID}
          orientation="vertical"
        />
        <SidebarProvider>
          <EpicLeftPanelHost epicId={EPIC_ID} tabId={TAB_ID} side="left" />
        </SidebarProvider>
      </QueryClientProvider>,
    );

    const rail = screen.getByTestId("epic-sidebar-rail");
    const railIds = Array.from(rail.children).map((child) =>
      child.getAttribute("data-testid"),
    );
    expect(railIds).toEqual([
      "epic-rail-chats",
      "epic-rail-artifacts",
      "epic-rail-terminals",
      "epic-rail-browsers",
      "epic-rail-git-diff",
      "epic-rail-file-tree",
      "epic-rail-sharing",
    ]);
    expect(
      screen.getByTestId("epic-sidebar").getAttribute("data-left-panel-id"),
    ).toBe("terminals");
    expect(screen.getByTestId("epic-test-terminals-body")).toBeTruthy();

    fireEvent.click(screen.getByTestId("epic-rail-browsers"));

    expect(useLeftPanelStore.getState().getActivePanelId(TAB_ID)).toBe(
      "browsers",
    );
    expect(
      screen.getByTestId("epic-sidebar").getAttribute("data-left-panel-id"),
    ).toBe("browsers");
    expect(screen.getByTestId("epic-browsers-panel-empty")).toBeTruthy();

    // Dragging Browsers before Terminals reorders the flat rail directly -
    // there is no group to merge into any more (L-155).
    act(() => {
      applyRail(
        moveRailPanelBeside(
          currentLayoutArrangement(),
          "browsers",
          "terminals",
          false,
        ).rail,
      );
    });
    const reorderedRailIds = Array.from(
      screen.getByTestId("epic-sidebar-rail").children,
    ).map((child) => child.getAttribute("data-testid"));
    expect(reorderedRailIds.indexOf("epic-rail-browsers")).toBeLessThan(
      reorderedRailIds.indexOf("epic-rail-terminals"),
    );
  });
});
