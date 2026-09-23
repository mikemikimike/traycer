/**
 * `SideStripNeedsYou` (D10, D13): the Activity view's Needs you block, pinned
 * under the nav rows. Mounted through the real `SideTabStrip` so the real
 * host-notifications pipeline, `useNeedsYouItems` and the arrangement/strip
 * stores are exactly what production reads. `NeedsYouItem` itself and
 * `useNeedsYouItems`'s selection logic are covered in their own suites
 * (`needs-you-item.test.tsx`, `needs-you-items.test.ts`); this suite is the
 * block's own visibility rule and its wiring to the shared item component.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import type { ReactNode } from "react";
import type { NotificationActivationInput } from "@/hooks/notifications/use-notification-activation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { MockHostMessenger } from "@traycer-clients/shared/host-client/mock/mock-host-messenger";
import { MockRunnerHost } from "@traycer-clients/shared/host-client/mock/mock-runner-host";
import type { IHostMessenger } from "@traycer-clients/shared/host-transport/host-messenger";
import type { HostNotificationEntryV22 } from "@traycer/protocol/host/notifications/contracts";
import { SideTabStrip } from "@/components/layout/tabs/side-strip/side-tab-strip";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  hostRpcRegistry,
  HostRuntimeProvider,
  type HostRpcRegistry,
} from "@/lib/host";
import { DEFAULT_ARRANGEMENT } from "@/lib/layout/layout-arrangement";
import { __resetTabNavigationControllerForTesting } from "@/lib/tab-navigation";
import { installTabSyncCoordinator } from "@/lib/tab-sync/tab-sync-coordinator";
import { RunnerHostProvider } from "@/providers/runner-host-provider";
import { WindowsBridgeContext } from "@/providers/windows-bridge-context";
import { useAuthStore } from "@/stores/auth/auth-store";
import { useEpicCanvasStore } from "@/stores/epics/canvas/store";
import { useLandingDraftStore } from "@/stores/home/landing-draft-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useSideTabStripStore } from "@/stores/layout/side-tab-strip-store";
import { useTitleBarDragStore } from "@/stores/layout/title-bar-drag-store";
import { __resetAppLocalNotificationsStoreForTests } from "@/stores/notifications/app-local-notifications-store";
import {
  __resetHostNotificationsStoreForTests,
  useHostNotificationsStore,
} from "@/stores/notifications/host-notifications-store";
import { __resetNotificationsStoreForTests } from "@/stores/notifications/notifications-store";
import { useNotificationsPopoverStore } from "@/stores/notifications/notifications-popover-store";
import { useKeybindingStore } from "@/stores/settings/keybinding-store";

installTabSyncCoordinator({ readyPromise: Promise.resolve() });

// The activation pipeline itself (routing, markAsRead, the origin-host guard)
// is `useNotificationActivation`'s own suite
// (`use-notification-activation.test.tsx`); this file owns only whether
// `SideStripNeedsYou` wires a click to it for the right row, with the strip
// surface.
const activateSpy = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/notifications/use-notification-activation", () => ({
  useNotificationActivation: () => ({ activate: activateSpy }),
}));

function createRunnerHost(): MockRunnerHost {
  return new MockRunnerHost({
    signInUrl: "https://example.com",
    authnBaseUrl: "https://auth.example.com",
    localHost: null,
    hosts: [],
    workspaceFolderPickerPaths: undefined,
    hasLocalHost: undefined,
    traycerCli: undefined,
  });
}

function makeMessengerFactory(): (args: {
  registry: HostRpcRegistry;
}) => IHostMessenger<HostRpcRegistry> {
  return (args) =>
    new MockHostMessenger<HostRpcRegistry>({
      registry: args.registry,
      requestId: () => "req-1",
      handlers: {
        "host.status": () =>
          Promise.resolve({
            ready: true,
            hostVersion: "1.2.3",
            protocolVersion: { major: 1, minor: 0 },
            busy: false,
            busySessionCount: 0,
            updateProgress: null,
            busyBreakdown: null,
            updateOperation: null,
            updateTransaction: null,
            storeFormats: null,
            install: null,
          }),
      },
    });
}

function renderHarness(tree: ReactNode): void {
  const runnerHost = createRunnerHost();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const rootRoute = createRootRoute({
    component: () => (
      <QueryClientProvider client={queryClient}>
        <RunnerHostProvider runnerHost={runnerHost}>
          <HostRuntimeProvider
            registry={hostRpcRegistry}
            messengerFactory={makeMessengerFactory()}
            invalidator={null}
            requestId={null}
            remoteFetcher={() =>
              Promise.resolve({ kind: "hosts", entries: [] })
            }
            fallback={<div data-testid="runtime-fallback">…</div>}
          >
            <TooltipProvider>{tree}</TooltipProvider>
          </HostRuntimeProvider>
        </RunnerHostProvider>
      </QueryClientProvider>
    ),
  });
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: () => null,
  });
  const epicRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "epics/$epicId/$tabId",
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute, epicRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

function resetSharedState(): void {
  __resetTabNavigationControllerForTesting();
  useEpicCanvasStore.setState(useEpicCanvasStore.getInitialState(), true);
  useLandingDraftStore.setState({ drafts: [], activeDraftId: null });
  useSideTabStripStore.setState({ collapsed: false });
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
  useLayoutStore.getState().setRegionValues("homeTab", { shown: "hidden" });
  useTitleBarDragStore.setState({ suppressors: new Set() });
  useNotificationsPopoverStore.getState().setOpen(false);
  __resetNotificationsStoreForTests();
  __resetHostNotificationsStoreForTests();
  __resetAppLocalNotificationsStoreForTests();
  useKeybindingStore.getState().resetAll();
  window.localStorage.clear();
}

function signIn(): void {
  useAuthStore.getState().setSignedIn(
    {
      userId: "test-user",
      userName: "Ada Lovelace",
      email: "ada@example.com",
    },
    { userId: "test-user", username: "Ada Lovelace" },
    [],
  );
}

function approvalEntry(
  id: string,
  updatedAt: number,
): HostNotificationEntryV22 {
  return {
    id,
    updatedAt,
    readAt: null,
    kind: "approval.requested",
    sourceRef: id,
    severity: "needs_action",
    outcome: null,
    resolvedAt: null,
    epicId: "epic-1",
    chatId: "chat-1",
    payload: {
      kind: "approval",
      epicId: "epic-1",
      chatId: "chat-1",
      chatTitle: "Deploy checkout fix",
      taskTitle: "Deploy checkout fix",
      approvalId: id,
    },
  };
}

function seedApprovals(count: number): void {
  const entries = Array.from({ length: count }, (_unused, index) =>
    approvalEntry(`approval-${index}`, 10 + index),
  );
  act(() => {
    useHostNotificationsStore.getState().applySnapshot({
      attention: { entries, nextCursor: null },
      recent: { entries, nextCursor: null },
      summary: { unreadCount: count, attentionCount: count },
    });
  });
}

/** Vertical, expanded, Activity: the one arrangement `useLiveAgentsInStrip` admits. */
function activateActivityView(): void {
  act(() => {
    useLayoutStore.setState({
      arrangement: {
        ...DEFAULT_ARRANGEMENT,
        tabStripPlacement: "left",
        sideStripView: "activity",
      },
    });
  });
}

function renderStrip(): void {
  renderHarness(
    <WindowsBridgeContext.Provider value={{ bridge: null, hasHydrated: true }}>
      <SideTabStrip edge="left" ownsTitleBar={false} />
    </WindowsBridgeContext.Provider>,
  );
}

describe("SideStripNeedsYou", () => {
  beforeEach(() => {
    resetSharedState();
    signIn();
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().setSignedOut();
    resetSharedState();
  });

  it("stays hidden in the Layered view even with prompts waiting", async () => {
    seedApprovals(1);
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.queryByTestId("side-strip-needs-you")).toBeNull();
  });

  it("stays hidden with nothing waiting, even in the Activity view", async () => {
    activateActivityView();
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.queryByTestId("side-strip-needs-you")).toBeNull();
  });

  it("stays hidden while the strip is collapsed", async () => {
    activateActivityView();
    seedApprovals(1);
    useSideTabStripStore.setState({ collapsed: true });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.queryByTestId("side-strip-needs-you")).toBeNull();
  });

  it("shows the waiting prompts, with a heading count matching the items", async () => {
    activateActivityView();
    seedApprovals(2);
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    const block = await screen.findByTestId("side-strip-needs-you");
    expect(block.textContent).toContain("Needs you");
    expect(block.textContent).toContain("2");
    expect(screen.getAllByTestId("needs-you-item")).toHaveLength(2);
  });

  it("appears live as the strip flips into the Activity view, and leaves it again", async () => {
    seedApprovals(1);
    renderStrip();
    await screen.findByTestId("side-tab-strip");
    expect(screen.queryByTestId("side-strip-needs-you")).toBeNull();

    activateActivityView();
    expect(await screen.findByTestId("side-strip-needs-you")).toBeTruthy();

    act(() => {
      useLayoutStore.setState((state) => ({
        arrangement: { ...state.arrangement, sideStripView: "layered" },
      }));
    });
    expect(screen.queryByTestId("side-strip-needs-you")).toBeNull();
  });

  it("wires a click to the shared activation path for that row, on the strip surface (D13)", async () => {
    activateActivityView();
    seedApprovals(1);
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    const item = await screen.findByTestId("needs-you-item");
    expect(item.dataset.notificationId).toBe("host:approval-0");
    expect(activateSpy).not.toHaveBeenCalled();

    fireEvent.click(item);

    expect(activateSpy).toHaveBeenCalledTimes(1);
    const input = activateSpy.mock.calls[0][0] as NotificationActivationInput;
    expect(input.feedId).toBe("host:approval-0");
    expect(input.payload).toMatchObject({
      kind: "approval",
      epicId: "epic-1",
      chatId: "chat-1",
    });
    expect(typeof input.onResult).toBe("function");
  });
});
