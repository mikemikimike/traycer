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
import { LayoutEditor } from "@/components/layout-editor/layout-editor";
import {
  LAYOUT_REGION_IDS,
  regionFacts,
} from "@/components/layout-editor/regions/region-facts";
import { TabChrome } from "@/components/layout/tabs/header-tab-visual";
import { SampleSceneProvider } from "@/components/sample-workspace/sample-scene-provider";
import { SampleWorkspaceBody } from "@/components/sample-workspace/sample-workspace-body";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  HostRuntimeProvider,
  hostRpcRegistry,
  type HostRpcRegistry,
  type MessengerFactory,
} from "@/lib/host";
import {
  insertRailDivider,
  stackRailPanels,
} from "@/lib/layout/layout-arrangement";
import type { LayoutSnapshot } from "@/lib/layout/layout-snapshot";
import type { RegionId } from "@/lib/layout/region-id";
import { RunnerHostProvider } from "@/providers/runner-host-provider";
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
import { tabAppearance } from "@/stores/tabs/types";
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
 * - `[data-layout-column]` with `app-shell.tsx`'s own classes, holding an
 *   opaque `relative z-20` header strip. That header is not decoration: it is
 *   the element that painted over the editing outline when the outline was the
 *   column's own `outline` (LV2-04), so the frame's pixels are measured under
 *   the same condition that broke it. It also carries the editor's own TAB, in
 *   the real `TabChrome`, bottom-aligned exactly as the strip aligns it.
 * - `SampleWorkspaceBody`, which is the sample rail, the sample transcript and
 *   minimap, the REAL chat lower dock with its real panels, and the REAL
 *   composer toolbar fed the scene's sample dictation control (L-98, L-116).
 * - `<LayoutEditor column={...} />` verbatim, so `useLayoutCanvas`,
 *   `installEditFirewall`, the selection ring, the hover chip and the
 *   inspector are the shipped wiring rather than a re-statement of it.
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
    "the real Home item is drawn by the tab strip, which reads the tabs store and the router; this fixture mounts no tab strip",
  usageLimits:
    "the status bar's usage cluster resolves the watched host's rate-limit subscription, which needs a live host",
  resourceMonitor:
    "StatusBarResourceSegment resolves its readings through the desktop sampler and the resource registry, neither of which exists off Electron",
};

interface LayoutCanvasProbe {
  readonly ready: boolean;
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
    regionIds: LAYOUT_REGION_IDS,
    noCanvasNode: NO_CANVAS_NODE,
    names: regionNames(),
    reset: () => {
      useLayoutStore.getState().replaceAll(DEFAULT_LAYOUT_SNAPSHOT);
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
  };
}

/**
 * The app column and the editor beside it, exactly as `app-shell.tsx` arranges
 * them: a flex ROW whose first child is the column and whose second is the
 * inspector, so a side dock reflows the app rather than covering it, and the
 * column is never an ancestor of the inspector (C-06).
 */
export function CanvasFixture(): ReactNode {
  const [column, setColumn] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    window.__layoutCanvasProbe = buildProbe();
    return () => {
      window.__layoutCanvasProbe = undefined;
    };
  }, []);

  return (
    <div className="flex min-h-safe-dvh bg-canvas text-canvas-foreground">
      <div
        ref={setColumn}
        data-layout-column
        className="relative flex h-safe-dvh min-w-0 flex-1 flex-col"
      >
        {/* The paint-order condition LV2-04 measured, reproduced: an opaque
            positioned strip on its own stacking layer, flush with the column's
            top edge and both of its sides. An `outline` on the column is
            painted underneath this; the shipped `::after` frame is not. */}
        <header
          data-fixture-header
          className="relative z-20 flex h-10 shrink-0 items-end gap-3 border-b bg-canvas px-3 text-ui-sm"
        >
          <span className="self-center">Sample window</span>
          <SessionTabSpecimen />
        </header>
        <main className="relative flex min-h-0 flex-1 flex-col">
          <div className="relative flex min-h-0 flex-1 overflow-clip">
            <div className="flex h-full min-h-0 w-full flex-col">
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
          </div>
        </main>
      </div>
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
  return createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
}

const container = document.getElementById("root");
if (container !== null)
  createRoot(container).render(<RouterProvider router={buildRouter()} />);
