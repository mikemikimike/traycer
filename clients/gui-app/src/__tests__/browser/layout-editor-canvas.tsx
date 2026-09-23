import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { LazyMotion, domAnimation } from "motion/react";
import { MockHostMessenger } from "@traycer-clients/shared/host-client/mock/mock-host-messenger";
import { MockRunnerHost } from "@traycer-clients/shared/host-client/mock/mock-runner-host";
import { RootDndProvider } from "@/components/epic-canvas/dnd/root-dnd-provider";
import {
  PanelTaskHeader,
  SidebarWidthResizeHandle,
} from "@/components/epic-canvas/sidebar/epic-sidebar-column";
import { StripLiveAgentsPortal } from "@/components/epic-canvas/sidebar/strip-live-agents";
import { LayoutEditor } from "@/components/layout-editor/layout-editor";
import {
  LAYOUT_REGION_IDS,
  regionFacts,
} from "@/components/layout-editor/regions/region-facts";
import { AppColumnFrame } from "@/components/layout/app-column-frame";
import {
  appColumnChrome,
  sideStripOwnsTitleBar,
} from "@/components/layout/header/app-title-band-kind";
import { useAppColumnChromeInput } from "@/components/layout/use-app-column-chrome-input";
import { TabChrome } from "@/components/layout/tabs/header-tab-visual";
import { SideTabStrip } from "@/components/layout/tabs/side-strip/side-tab-strip";
import { SampleSceneProvider } from "@/components/sample-workspace/sample-scene-provider";
import { SampleWorkspaceBody } from "@/components/sample-workspace/sample-workspace-body";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { HostNotificationsIndicatorStateResponse } from "@traycer/protocol/host/notifications/contracts";
import type { AgentActivityByEpic } from "@traycer/protocol/host/agent/activity";
import {
  HostRuntimeProvider,
  hostRpcRegistry,
  type HostRpcRegistry,
  type MessengerFactory,
} from "@/lib/host";
import { useArrangementValue } from "@/lib/layout-overrides";
import {
  insertRailDivider,
  sideTabStripEdge,
  stackRailPanels,
  type EdgeSide,
  type SideStripView,
  type TabStripPlacement,
} from "@/lib/layout/layout-arrangement";
import { EpicSessionContext } from "@/lib/registries/epic-session-registry";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { RegionId } from "@/lib/layout/region-id";
import { createPersistentMemoryHistory } from "@/lib/persistent-history";
import { RunnerHostProvider } from "@/providers/runner-host-provider";
import { __setAgentActivityStateForTests } from "@/stores/agent-activity-store";
import { useSidebarWidthPx } from "@/stores/epics/left-panel-store";
import { useAuthStore } from "@/stores/auth/auth-store";
import type { EpicStreamClientFactory } from "@/stores/epics/open-epic/store";
import { openStoreForTest } from "@/stores/epics/open-epic/test-support/open-store-for-test";
import type { TreeNode } from "@/stores/epics/open-epic/types";
import {
  useSettingsStore,
  type ThemeMode,
} from "@/stores/settings/settings-store";
import { useSideTabStripStore } from "@/stores/layout/side-tab-strip-store";
import {
  useLayoutEditorStore,
  type LayoutDockMode,
} from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  getLayoutSnapshot,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { sampleWorkspaceTabModule } from "@/stores/tabs/kinds/sample-workspace";
import { tabItemId } from "@/stores/tabs/layout";
import { useTabsStore } from "@/stores/tabs/store";
import { tabAppearance } from "@/stores/tabs/types";
import { seedSideStripTabs } from "./side-tab-strip-seed";
import "@/lib/theme-applier";
import "@/index.css";
import "@/components/layout-editor/layout-editor.css";

/**
 * THE CANVAS INTERACTION REGRESSION (L-115 .. L-135), in real Chrome with real
 * mouse input.
 *
 * Three review gates and thousands of jsdom tests passed while the sample
 * workspace's chat pane was wrapped in `inert`, so in the shipped app nothing
 * on it could be hovered, selected by pointing or dragged (LV2-01). jsdom has
 * no hit testing, no layout and no paint order, so none of that was observable
 * there and none of it can be observed there now. This fixture mounts the app
 * column the way `app-shell.tsx` builds it, puts the REAL sample scene inside
 * it and the REAL editor beside it, and the driver drives it with
 * `Input.dispatchMouseEvent`.
 *
 * What it mounts, and why that is the app:
 *
 * - `AppColumnFrame`, the shell's own composition of the app column
 *   (`app-shell.tsx` renders the same component), inside the same
 *   `RootDndProvider`, with the placement and band kind read through
 *   `useAppColumnChromeInput` and `appColumnChrome`, exactly as the shell
 *   reads them. For `top` its `header` slot is an opaque `relative z-20`
 *   header specimen. That header is not decoration: it is the element that painted
 *   over the editing outline when the outline was the column's own `outline`
 *   (LV2-04), so the frame's pixels are measured under the same condition that
 *   broke it. It also carries the editor's own TAB, in the real `TabChrome`,
 *   bottom-aligned exactly as the strip aligns it. For `left` and `right` the
 *   `strip` slot is the REAL `SideTabStrip` over a seeded tabs store (top
 *   block, rows through `useStripTabItem`, the session row, the foot), and a
 *   band kind of `"band"` draws the REAL `DesktopMenuHeader variant="title-band"`;
 *   the specimen header is never used for a side placement.
 * - `SampleWorkspaceBody`, which is the sample rail, the sample transcript and
 *   minimap, the REAL chat lower dock with its real panels, and the REAL
 *   composer toolbar fed the scene's sample dictation control (L-98, L-116).
 * - `<LayoutEditor column={...} />` verbatim, so `useLayoutCanvas`,
 *   `installEditFirewall`, the selection ring, the hover chip and the
 *   inspector are the shipped wiring rather than a re-statement of it.
 *
 * The query `?tabs=top|left|right&collapsed=0|1&wco=none|mac|win|mac-fullscreen&dock=right|left|float`
 * is read once before mount. It seeds the stored placement, the strip's
 * collapsed flag and the inspector dock, and for a desktop `wco` it stands in
 * for the preload and for `window-controls-overlay.ts`: `window.runnerHost` is
 * the fixture's runner host carrying `menu.platform`, so `isFramelessDesktop()`
 * and `resolveDesktopPlatform` answer as on that desktop, and `.wco` goes on
 * `<html>` (except `mac-fullscreen`, where macOS drops the overlay). There is
 * no popup bridge, so the Windows band is its empty drag band, and the
 * `env(titlebar-area-*)` fallbacks (82px leading inset, 40px band) stand in for
 * the real values. `&surface=sample|epic` picks what the surface frame holds
 * (the sample workspace's route sheet, or a task's panel and content sheets
 * with the real width handle between them), `&sidebar=left|right` and
 * `&view=layered|activity` seed the arrangement, and `&account=1` signs a
 * fixture user in, so the foot draws the account row. What cannot be
 * simulated here - native window controls,
 * real `env()` values, `-webkit-app-region`, the menu bar's native popups and
 * the signed-in foot - is the Staging pass's (tickets/12, "Staging checklist").
 *
 * The session is begun through the editor store's own `beginSession`, which is
 * what `editor-session.ts` calls once past the door. Nothing here writes a
 * `data-layout-*` attribute by hand: every attribute the driver asserts on is
 * one the product put there.
 *
 * `window.__layoutCanvasProbe.ready` gates all of it.
 */

/**
 * The editor tab's colour, taken from the tab the app really opens.
 *
 * Restating `var(--warning-foreground)` here would make the fixture agree with
 * itself rather than with the product, and the thing being measured on this
 * tab is precisely what the chrome does with the colour it is handed.
 */
const SESSION_TAB_COLOR: string | null =
  tabAppearance(sampleWorkspaceTabModule.build(null))?.color ?? null;

/**
 * The editor's own tab, on the geometry that puts it under the frame (L-163).
 *
 * `app-shell.tsx` gives the header `h-10` and the strip bottom-aligns an `h-9`
 * tab inside it, so the tab's top edge and the editing frame's dotted stroke,
 * held 4px inside the column, are the same line to within a rounding error.
 * The real `TabChrome` in its `session` state is what paints the tab, and it
 * reads only props, so A9 can ask this specimen what the product does. The
 * width is fixed because a tab's width is a SIMULATED fact here, the same
 * exception the preset miniature takes.
 */
function SessionTabSpecimen(): ReactNode {
  return (
    <span data-fixture-session-tab className="relative h-9 w-48 shrink-0">
      <TabChrome isActive color={SESSION_TAB_COLOR} session />
      {/* The label colour the real tab gives itself on this fill, restated
          rather than imported: `header-tab-visual.tsx` exports components
          only, and a string export would cost that file its fast refresh. */}
      <span className="relative z-20 flex h-full items-center justify-center text-background">
        Customizing
      </span>
    </span>
  );
}

/**
 * Why a region has no node on this canvas, one line each.
 *
 * All three are shell chrome the app column draws OUTSIDE the sample tab, and
 * each resolves a runtime this fixture has no host for. The driver prints them
 * rather than counting them as covered.
 */
const NO_CANVAS_NODE: Readonly<Partial<Record<RegionId, string>>> = {
  homeTab:
    "at the top placement this fixture's header is a specimen with no tab strip; the real Home is measured in the side-strip variants, where the real SideTabStrip draws it",
  usageLimits:
    "the status bar's usage cluster resolves the watched host's rate-limit subscription, which needs a live host",
  resourceMonitor:
    "StatusBarResourceSegment resolves its readings through the desktop sampler and the resource registry, neither of which exists off Electron",
};

/** The fixture's desktop stand-in: which window chrome `wco` simulates. */
type FixtureWindowChrome = "none" | "mac" | "win" | "mac-fullscreen";

/**
 * What the app column's surface frame holds: the sample workspace, which is a
 * route sheet in the app, or a task's two sheets (panel and content), which is
 * what the joined tab and the Activity view are about.
 */
type FixtureSurface = "sample" | "epic";

interface CanvasVariant {
  readonly tabs: TabStripPlacement;
  readonly collapsed: boolean;
  readonly wco: FixtureWindowChrome;
  readonly dock: LayoutDockMode;
  readonly surface: FixtureSurface;
  readonly sidebar: EdgeSide;
  readonly view: SideStripView;
  /** Signed in, so the foot draws the account row and the strip the Inbox. */
  readonly account: boolean;
}

interface LayoutCanvasProbe {
  readonly ready: boolean;
  /** The query this document was mounted with, as parsed. */
  readonly variant: CanvasVariant;
  readonly regionIds: ReadonlyArray<RegionId>;
  readonly noCanvasNode: Readonly<Partial<Record<RegionId, string>>>;
  /** Each region's own name, so the driver checks the chip against the product's word. */
  readonly names: Readonly<Record<string, string>>;
  /** Back to the shipped defaults, so every phase starts from the same layout. */
  readonly reset: () => void;
  readonly beginSession: () => void;
  readonly endSession: () => void;
  readonly setDockMode: (mode: LayoutDockMode) => void;
  /** Both the leading dock members at Chip, which is what folds them into pills. */
  readonly foldDockPills: () => void;
  readonly unfoldDockPills: () => void;
  readonly setMicShown: (shown: boolean) => void;
  /** Hidden AND Chip, the shape whose only picture used to be the row it never takes. */
  readonly hideChangedFilesAsChip: () => void;
  /**
   * One divider in the rail, between Artifacts and Terminals.
   *
   * The shipped rail has none (L-155), and the two rail drag plans need a
   * divider to aim at. Written through the arrangement's own `insertRail
   * Divider`, so the entry the driver grabs is the one the product mints -
   * including its id, which is `divider:1` on a rail that has used no seq.
   */
  readonly addRailDivider: () => void;
  /**
   * Terminals joined to Browsers the way the inspector's row action does it -
   * the panel BELOW as the source, so the join moves nothing (L-170) - through
   * the product's own writer and inside a recorded gesture, so the driver can
   * assert the capsule the rail draws for a pair and the one history step the
   * join costs (L-166, L-168).
   */
  readonly stackTerminalsWithBrowsers: () => void;
  readonly clearSelection: () => void;
  readonly snapshot: () => LayoutSnapshot;
  readonly historyDepth: () => number;
  /** The stored theme mode; persisted, so a check that sets it restores `"system"` for the next document. */
  readonly setTheme: (theme: ThemeMode) => void;
  /**
   * Makes one seeded epic tab the active item, as the strip's own activation
   * leaves the tabs store once the route bridge has followed the navigation.
   * The fixture's router has no epic routes and no route bridge, so a click's
   * navigation lands nowhere; what the rail check measures is the paint of an
   * ACTIVE tinted tile, not the activation path.
   */
  readonly activateEpicTab: (epicId: string) => void;
  /**
   * What the host answered for `host.notifications.indicatorState`, per epic
   * and per agent: the rail badges and the waiting pulse read the epics, the
   * Activity list's waiting chips read the agents.
   */
  readonly setIndicators: (
    epics: HostNotificationsIndicatorStateResponse["epics"],
    chats: HostNotificationsIndicatorStateResponse["chats"],
  ) => void;
  /** The activity plane's working and turn agents per epic: the meters read it. */
  readonly setActivity: (byEpic: AgentActivityByEpic) => void;
  readonly setCollapsed: (collapsed: boolean) => void;
  readonly setStripView: (view: SideStripView) => void;
}

declare global {
  interface Window {
    __layoutCanvasProbe?: LayoutCanvasProbe;
  }
}

/**
 * Between Artifacts and Terminals, which is where the rail plans aim.
 *
 * Index 3 rather than 2 since L-166: the shipped rail carries a stack LINK
 * between Agents and Artifacts, so the entries are `railAgents`,
 * `stack:railAgents+railArtifacts`, `railArtifacts`, `railTerminals`, and a
 * divider at 2
 * would land inside the stack rather than after it (where `normalizeRail`
 * would then drop the join).
 */
const RAIL_DIVIDER_INDEX = 3;

function readVariant(): CanvasVariant {
  const params = new URLSearchParams(window.location.search);
  const tabs = params.get("tabs");
  const wco = params.get("wco");
  const dock = params.get("dock");
  return {
    tabs: tabs === "left" || tabs === "right" ? tabs : "top",
    collapsed: params.get("collapsed") === "1",
    wco:
      wco === "mac" || wco === "win" || wco === "mac-fullscreen" ? wco : "none",
    dock: dock === "left" || dock === "float" ? dock : "right",
    surface: params.get("surface") === "epic" ? "epic" : "sample",
    sidebar: params.get("sidebar") === "right" ? "right" : "left",
    view: params.get("view") === "activity" ? "activity" : "layered",
    account: params.get("account") === "1",
  };
}

const VARIANT = readVariant();

/** The shipped defaults with the variant's stored placement, which `reset` returns to. */
const VARIANT_SNAPSHOT: LayoutSnapshot = {
  ...DEFAULT_LAYOUT_SNAPSHOT,
  arrangement: {
    ...DEFAULT_LAYOUT_SNAPSHOT.arrangement,
    tabStripPlacement: VARIANT.tabs,
    sidebarSide: VARIANT.sidebar,
    sideStripView: VARIANT.view,
  },
};

/**
 * Back to the variant's layout. Beside a side strip Home is shown, so the
 * strip's top block carries every control it can; the shipped default hides
 * it, and at the top the fixture's header specimen has no Home to show.
 */
function resetLayout(): void {
  useLayoutStore.getState().replaceAll(VARIANT_SNAPSHOT);
  if (VARIANT.tabs !== "top") {
    useLayoutStore.getState().setRegionValues("homeTab", { shown: "shown" });
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});

const runnerHost = new MockRunnerHost({
  signInUrl: "http://127.0.0.1:9/sign-in",
  authnBaseUrl: "http://127.0.0.1:9",
  localHost: null,
  hosts: [],
  workspaceFolderPickerPaths: undefined,
  hasLocalHost: undefined,
  traycerCli: undefined,
});

let requestCounter = 0;

/**
 * A messenger that answers the three calls the runtime makes on startup and
 * nothing else.
 *
 * The sample scene addresses `sample-workspace-host`, which is in no
 * directory, so every panel inside it resolves a null client and asks nothing.
 * What this is here for is the app-wide runtime the dock's real panels are
 * written against: without a `HostRuntimeProvider` their hooks throw at import
 * of the first render, which is the boundary the jsdom suite fakes away.
 */
const messengerFactory: MessengerFactory<HostRpcRegistry> = ({ registry }) =>
  new MockHostMessenger<HostRpcRegistry>({
    registry,
    requestId: () => `layout-canvas-${String(++requestCounter)}`,
    handlers: {
      "host.status": () => ({
        ready: true,
        hostVersion: "1.2.3",
        protocolVersion: { major: 1, minor: 2 },
        busy: false,
        busySessionCount: 0,
        updateProgress: null,
        busyBreakdown: null,
        updateOperation: null,
        updateTransaction: null,
        storeFormats: null,
        install: null,
      }),
      "host.notifications.indicatorState": () => ({ epics: {}, chats: {} }),
      "epic.getTaskContexts": () => ({ tasks: {} }),
    },
  });

function regionNames(): Readonly<Record<string, string>> {
  const names: Record<string, string> = {};
  for (const regionId of LAYOUT_REGION_IDS)
    names[regionId] = regionFacts(regionId).name;
  return names;
}

function buildProbe(): LayoutCanvasProbe {
  return {
    ready: true,
    variant: VARIANT,
    regionIds: LAYOUT_REGION_IDS,
    noCanvasNode: NO_CANVAS_NODE,
    names: regionNames(),
    reset: () => {
      resetLayout();
    },
    beginSession: () => {
      useLayoutEditorStore
        .getState()
        .beginSession({ entry: "pointer", source: "direct_ui", startedAt: 0 });
    },
    endSession: () => {
      useLayoutEditorStore.getState().endSession();
    },
    setDockMode: (mode) => {
      useLayoutEditorStore.getState().setDockMode(mode);
    },
    foldDockPills: () => {
      useLayoutStore.getState().setRegionValues("changedFiles", {
        shown: "shown",
        size: "chip",
      });
      useLayoutStore.getState().setRegionValues("runningAgents", {
        shown: "shown",
        size: "chip",
      });
    },
    unfoldDockPills: () => {
      useLayoutStore
        .getState()
        .setRegionValues("changedFiles", { shown: "shown", size: "full" });
      useLayoutStore
        .getState()
        .setRegionValues("runningAgents", { shown: "shown", size: "full" });
    },
    setMicShown: (shown) => {
      useLayoutStore
        .getState()
        .setRegionValues("mic", { shown: shown ? "shown" : "hidden" });
    },
    hideChangedFilesAsChip: () => {
      useLayoutStore
        .getState()
        .setRegionValues("changedFiles", { shown: "hidden", size: "chip" });
    },
    addRailDivider: () => {
      const { arrangement } = useLayoutStore.getState();
      useLayoutStore
        .getState()
        .setArrangement(insertRailDivider(arrangement, RAIL_DIVIDER_INDEX));
    },
    // Through `recordGesture`, unlike `addRailDivider`: this one IS the
    // gesture under test, so its history step is the thing being counted.
    stackTerminalsWithBrowsers: () => {
      useLayoutEditorStore.getState().recordGesture(() => {
        const { arrangement } = useLayoutStore.getState();
        useLayoutStore
          .getState()
          .setArrangement(
            stackRailPanels(arrangement, "browsers", "terminals"),
          );
      });
    },
    clearSelection: () => {
      useLayoutEditorStore.getState().select(null);
    },
    snapshot: () => getLayoutSnapshot(),
    historyDepth: () => useLayoutEditorStore.getState().history.past.length,
    setTheme: (theme) => {
      useSettingsStore.getState().setTheme(theme);
    },
    activateEpicTab: (epicId) => {
      useTabsStore.setState({
        activeItemId: tabItemId({ kind: "epic", id: epicId }),
      });
    },
    // The fixture has no usable host, so the indicator query never runs; its
    // cache entry is answered in its place, which is what a reply would write.
    setIndicators: (epics, chats) => {
      for (const query of queryClient.getQueryCache().findAll()) {
        if (query.queryKey[1] !== "host.notifications.indicatorState") continue;
        queryClient.setQueryData(query.queryKey, { epics, chats });
      }
    },
    setActivity: (byEpic) => {
      __setAgentActivityStateForTests(byEpic, "local", null);
    },
    setCollapsed: (collapsed) => {
      useSideTabStripStore.getState().setCollapsed(collapsed);
    },
    setStripView: (view) => {
      const { arrangement } = useLayoutStore.getState();
      useLayoutStore
        .getState()
        .setArrangement({ ...arrangement, sideStripView: view });
    },
  };
}

/**
 * The fixture's header for the `top` placement: the paint-order condition
 * LV2-04 measured, reproduced. An opaque positioned strip on its own stacking
 * layer, flush with the column's top edge and both of its sides; an `outline`
 * on the column is painted underneath this, the shipped `::after` frame is not.
 */
function FixtureHeader(): ReactNode {
  return (
    <header
      data-fixture-header
      className="relative z-20 flex h-10 shrink-0 items-end gap-3 border-b bg-canvas px-3 text-ui-sm"
    >
      <span className="self-center">Sample window</span>
      <SessionTabSpecimen />
    </header>
  );
}

/**
 * The sample workspace as the app mounts it: a route surface, which is one
 * sheet. `TopLevelSurfaceMount` puts the marker and the clip on the mount; the
 * fixture has no tab host, so it puts them on the same box around the body
 * (the host's absolute placement aside, which a single surface fills anyway).
 */
function SampleRouteSheet(): ReactNode {
  return (
    <div
      data-shell-sheet="route"
      className="relative flex h-full min-h-0 w-full min-w-0 flex-col overflow-clip"
    >
      {/* The canvas's own caption, from `sample-workspace-surface.tsx`:
          passive rather than a region, and the one band of the column's
          side edges that nothing opaque paints over. */}
      <p
        data-layout-passive
        className="shrink-0 border-b px-4 py-2 text-ui-sm text-muted-foreground"
      >
        Sample content. Changes apply to your layout.
      </p>
      <SampleWorkspaceBody />
    </div>
  );
}

/** The active task in the `surface=epic` windows: Epsilon, which the seed makes active. */
const EPIC_SURFACE_ID = "fixture-epsilon";

/** Epsilon's agents, for the Activity view: two turns (one nested), one background. */
const EPIC_SURFACE_AGENTS: ReadonlyArray<TreeNode> = [
  chatNode("fixture-agent-plan", null, "Plan the migration"),
  chatNode("fixture-agent-tests", "fixture-agent-plan", "Write the tests"),
  chatNode("fixture-agent-index", null, "Rebuild the index"),
];

function chatNode(
  id: string,
  parentId: string | null,
  title: string,
): TreeNode {
  return {
    id,
    parentId,
    title,
    type: "chat",
    status: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

const noopStreamClientFactory: EpicStreamClientFactory = () => ({
  applyUpdate: () => undefined,
  awareness: () => undefined,
  applyArtifactRoomUpdate: () => undefined,
  artifactRoomAwareness: () => undefined,
  retryMigration: () => undefined,
  close: () => undefined,
});

/**
 * Epsilon's session: a real open-epic store with its agents in the tree, so
 * the REAL `StripLiveAgentsPortal` reads a session exactly as the epic surface
 * hands it one. Built only for the `surface=epic` windows.
 */
function openEpicSurfaceSession() {
  const handle = openStoreForTest({
    epicId: EPIC_SURFACE_ID,
    userId: null,
    factories: {
      streamClientFactory: noopStreamClientFactory,
      laneSelection: null,
    },
    writeCommand: null,
  });
  const nodeById: Record<string, TreeNode> = {};
  const childrenByParent: Record<string, string[]> = {};
  const rootIds: string[] = [];
  for (const node of EPIC_SURFACE_AGENTS) {
    nodeById[node.id] = node;
    if (node.parentId === null) rootIds.push(node.id);
    else (childrenByParent[node.parentId] ??= []).push(node.id);
  }
  handle.store.setState({ tree: { rootIds, childrenByParent, nodeById } });
  return handle;
}

const EPIC_SURFACE_SESSION =
  VARIANT.surface === "epic" ? openEpicSurfaceSession() : null;

/**
 * A task's surface as `EpicSurface` lays it out: the panel sheet on the stored
 * sidebar side, the REAL width handle in the gap, and the content sheet beside
 * it. What the panel holds below its REAL task header, and the whole content
 * sheet, are stand-ins (the real panel and canvas need a live host), with the
 * real sheet markers and classes, so the sheet CSS, the joined tab, the handle
 * and the ground between them are what ships. The live agents list is the
 * real portal, owned here as the epic surface owns it (D9).
 */
function EpicSurfaceStandIn(): ReactNode {
  const sidebarSide = useArrangementValue("sidebarSide");
  const sidebarWidthPx = useSidebarWidthPx();
  const handle = <SidebarWidthResizeHandle side={sidebarSide} hidden={false} />;
  const panel = (
    <div
      data-shell-sheet="panel"
      data-epic-sidebar-panel
      data-fixture-panel
      className="flex h-full min-h-0 max-w-[50vw] shrink-0 flex-col overflow-hidden bg-background"
      style={{ width: sidebarWidthPx }}
    >
      <PanelTaskHeader epicId={EPIC_SURFACE_ID} tabId={EPIC_SURFACE_ID} />
    </div>
  );
  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-row md:gap-(--shell-gap)"
      data-epic-surface={EPIC_SURFACE_ID}
    >
      {EPIC_SURFACE_SESSION === null ? null : (
        <EpicSessionContext value={EPIC_SURFACE_SESSION}>
          <StripLiveAgentsPortal
            epicId={EPIC_SURFACE_ID}
            tabId={EPIC_SURFACE_ID}
          />
        </EpicSessionContext>
      )}
      {/* Fragment order as `EpicSidebarColumn` renders it: the handle finds
          the panel as its sibling on the sidebar's side. */}
      {sidebarSide === "right" ? null : panel}
      {sidebarSide === "right" ? null : handle}
      <div
        data-shell-sheet="content"
        data-fixture-content
        className="relative flex min-h-0 min-w-0 flex-1 flex-col md:overflow-clip md:bg-canvas"
      />
      {sidebarSide === "right" ? handle : null}
      {sidebarSide === "right" ? panel : null}
    </div>
  );
}

/**
 * The app column and the editor beside it, exactly as `app-shell.tsx` arranges
 * them: a flex ROW whose first child is the column and whose second is the
 * inspector, so a side dock reflows the app rather than covering it, and the
 * column is never an ancestor of the inspector (C-06). The column is the
 * shell's own `AppColumnFrame`, fed the placement and band kind the way the
 * shell computes them.
 */
export function CanvasFixture(): ReactNode {
  const [column, setColumn] = useState<HTMLDivElement | null>(null);
  const chromeInput = useAppColumnChromeInput();
  const chrome = appColumnChrome(chromeInput);
  const stripEdge = sideTabStripEdge(chromeInput.placement);

  useEffect(() => {
    window.__layoutCanvasProbe = buildProbe();
    return () => {
      window.__layoutCanvasProbe = undefined;
    };
  }, []);

  return (
    <div className="flex min-h-safe-dvh bg-canvas text-canvas-foreground">
      <RootDndProvider>
        <AppColumnFrame
          columnRef={setColumn}
          {...chrome}
          header={<FixtureHeader />}
          strip={
            stripEdge === null ? null : (
              <SideTabStrip
                edge={stripEdge}
                ownsTitleBar={sideStripOwnsTitleBar(chromeInput)}
              />
            )
          }
          banners={null}
          surface={
            VARIANT.surface === "epic" ? (
              <EpicSurfaceStandIn />
            ) : (
              <SampleRouteSheet />
            )
          }
          mainTail={null}
          tail={null}
        />
      </RootDndProvider>
      <LayoutEditor column={column} />
    </div>
  );
}

export function Providers(props: { readonly children: ReactNode }): ReactNode {
  return (
    <QueryClientProvider client={queryClient}>
      <RunnerHostProvider runnerHost={runnerHost}>
        <HostRuntimeProvider
          registry={hostRpcRegistry}
          messengerFactory={messengerFactory}
          invalidator={null}
          requestId={null}
          remoteFetcher={() => Promise.resolve({ kind: "hosts", entries: [] })}
          fallback={<div data-fixture-runtime-fallback />}
        >
          <LazyMotion features={domAnimation}>
            <TooltipProvider>
              <SampleSceneProvider>{props.children}</SampleSceneProvider>
            </TooltipProvider>
          </LazyMotion>
        </HostRuntimeProvider>
      </RunnerHostProvider>
    </QueryClientProvider>
  );
}

const fixtureErrors: string[] = [];
window.addEventListener("error", (event) => {
  fixtureErrors.push(
    event.error instanceof Error
      ? (event.error.stack ?? event.message)
      : event.message,
  );
});
window.addEventListener("unhandledrejection", (event) => {
  fixtureErrors.push(
    event.reason instanceof Error
      ? (event.reason.stack ?? event.reason.message)
      : String(event.reason),
  );
});
Reflect.set(window, "__layoutCanvasErrors", fixtureErrors);

/**
 * The variant, applied before the first render so the first frame is already
 * the window under test: the desktop stand-in, the stored placement, the
 * strip's width and collapse, the inspector dock, and the seeded tabs.
 */
function applyVariant(variant: CanvasVariant): void {
  if (variant.wco !== "none") {
    Reflect.set(runnerHost, "menu", {
      platform: variant.wco === "win" ? "win32" : "darwin",
    });
    Reflect.set(window, "runnerHost", runnerHost);
  }
  if (variant.wco === "mac" || variant.wco === "win") {
    document.documentElement.classList.add("wco");
  }
  if (variant.account) {
    useAuthStore.getState().setSignedIn(
      {
        userId: "fixture-user",
        userName: "Ada Lovelace",
        email: "ada@example.com",
        avatarUrl: null,
      },
      { userId: "fixture-user", username: "ada" },
      [],
    );
  }
  resetLayout();
  const strip = useSideTabStripStore.getState();
  strip.resetWidth();
  strip.setCollapsed(variant.collapsed);
  useLayoutEditorStore.getState().setDockMode(variant.dock);
  // A task window has no layout session, so no Customizing tab: Epsilon is
  // the active tab, which is what the join and the Activity view are about.
  seedSideStripTabs(variant.surface === "sample");
}

applyVariant(VARIANT);

function buildRouter() {
  const rootRoute = createRootRoute({
    component: () => (
      <Providers>
        <CanvasFixture />
      </Providers>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  // The desktop's own history where the fixture stands in for a desktop
  // (`router.tsx` gives an Electron renderer a persistent memory history,
  // session-scoped here), which is what the strip's back and forward arrows
  // self-gate on; the browser shell's plain history otherwise.
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history:
      VARIANT.wco === "none"
        ? createMemoryHistory({ initialEntries: ["/"] })
        : createPersistentMemoryHistory("/", null),
  });
}

const container = document.getElementById("root");
if (container !== null)
  createRoot(container).render(<RouterProvider router={buildRouter()} />);
