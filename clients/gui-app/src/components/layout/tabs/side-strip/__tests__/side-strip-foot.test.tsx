/**
 * `SideStripFoot` (D6): the account row's name, host line (host label plus
 * "N running"), health dot, collapsed avatar-only state, and the signed-out
 * fallback. Mounted through the real `SideTabStrip` so `ColumnEdgeContext`
 * and the real auth/agent-activity/selection-authority stores are exactly
 * what production reads.
 *
 * The visible `side-strip-host-line` is `aria-hidden` and carries the SHORT
 * form ("Ada's Mac · 3 running") so the count fits the strip; the full form
 * ("Ada's Mac · 3 agents running") lives in an sr-only span beside it and
 * therefore in the row button's accessible name. Every case with a running
 * count asserts both.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
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
import {
  mockLocalHostEntry,
  mockRemoteHostEntry,
} from "@traycer-clients/shared/host-client/mock/mock-host-directory";
import type { IHostMessenger } from "@traycer-clients/shared/host-transport/host-messenger";
import { SideTabStrip } from "@/components/layout/tabs/side-strip/side-tab-strip";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  hostRpcRegistry,
  HostRuntimeProvider,
  type HostRpcRegistry,
} from "@/lib/host";
import { __resetTabNavigationControllerForTesting } from "@/lib/tab-navigation";
import { installTabSyncCoordinator } from "@/lib/tab-sync/tab-sync-coordinator";
import { RunnerHostProvider } from "@/providers/runner-host-provider";
import { WindowsBridgeContext } from "@/providers/windows-bridge-context";
import type { HostLeaseSnapshot } from "@traycer-clients/shared/host-selection/selection-authority-contract";
import {
  __resetAgentActivityStoreForTests,
  __setHostAgentActivityHealthForTests,
  __setHostAgentActivityStateForTests,
} from "@/stores/agent-activity-store";
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
import { __resetHostNotificationsStoreForTests } from "@/stores/notifications/host-notifications-store";
import { __resetNotificationsStoreForTests } from "@/stores/notifications/notifications-store";
import { useNotificationsPopoverStore } from "@/stores/notifications/notifications-popover-store";
import { useTabsStore } from "@/stores/tabs/store";

type HostDirectoryLookup = {
  readonly findById: (hostId: string) => typeof mockLocalHostEntry | null;
};

const directoryRef = vi.hoisted((): { value: HostDirectoryLookup | null } => ({
  value: null,
}));

vi.mock("@/hooks/host/use-host-directory-entry", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/hooks/host/use-host-directory-entry")
    >();
  return {
    ...actual,
    useHostDirectoryEntry: (hostId: string | null) => {
      if (
        hostId === null ||
        hostId.length === 0 ||
        directoryRef.value === null
      ) {
        return null;
      }
      return directoryRef.value.findById(hostId);
    },
  };
});

// `useEffectiveHostId` / `useHostLease` read the selection-authority store,
// which `HostRuntimeProvider`'s real bridge also writes to (it publishes its
// own, empty kernel snapshot for this suite's host-less `MockRunnerHost` -
// clobbering a value seeded straight into the store). Mocking the two read
// hooks instead keeps the seed stable regardless of the bridge's own writes.
const effectiveHostRef = vi.hoisted((): { value: string | null } => ({
  value: null,
}));
const leaseRef = vi.hoisted((): { value: HostLeaseSnapshot | null } => ({
  value: null,
}));

vi.mock("@/hooks/host/use-effective-host-id", () => ({
  useEffectiveHostId: () => effectiveHostRef.value,
}));
vi.mock("@/hooks/host/use-host-lease", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/hooks/host/use-host-lease")>();
  return {
    ...actual,
    useHostLease: () => leaseRef.value,
  };
});

vi.mock("@/components/layout/header/app-update-button", () => ({
  AppUpdateHeaderButton: () => null,
}));

installTabSyncCoordinator({ readyPromise: Promise.resolve() });

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

function renderStrip(): void {
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
            <TooltipProvider>
              <WindowsBridgeContext.Provider
                value={{ bridge: null, hasHydrated: true }}
              >
                <SideTabStrip edge="left" ownsTitleBar={false} />
              </WindowsBridgeContext.Provider>
            </TooltipProvider>
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
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

/**
 * Like {@link renderStrip}, but the real `HostDirectoryService` settles with
 * exactly `hostIds` as its known hosts - `useAccountActivityCoverage` reads
 * this directory, not the `seedHost` double `useHostDirectoryEntry` is mocked
 * onto, so a case that needs the directory to have OPINIONS about which hosts
 * exist (as opposed to `renderStrip`'s empty, merely-settled listing) goes
 * through here instead.
 */
function renderStripWithKnownHosts(hostIds: readonly string[]): void {
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
              Promise.resolve({
                kind: "hosts",
                entries: hostIds.map((hostId) => ({
                  ...mockRemoteHostEntry,
                  hostId,
                })),
              })
            }
            fallback={<div data-testid="runtime-fallback">…</div>}
          >
            <TooltipProvider>
              <WindowsBridgeContext.Provider
                value={{ bridge: null, hasHydrated: true }}
              >
                <SideTabStrip edge="left" ownsTitleBar={false} />
              </WindowsBridgeContext.Provider>
            </TooltipProvider>
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
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  render(<RouterProvider router={router} />);
}

function resetSharedState(): void {
  __resetTabNavigationControllerForTesting();
  useEpicCanvasStore.setState(useEpicCanvasStore.getInitialState(), true);
  useLandingDraftStore.setState({ drafts: [], activeDraftId: null });
  useTabsStore.setState(useTabsStore.getInitialState(), true);
  useSideTabStripStore.setState({ widthPx: 240, collapsed: false });
  useLayoutStore.setState({ ...DEFAULT_LAYOUT_SNAPSHOT });
  useLayoutStore.getState().setRegionValues("homeTab", { shown: "hidden" });
  useTitleBarDragStore.setState({ suppressors: new Set() });
  useNotificationsPopoverStore.getState().setOpen(false);
  __resetNotificationsStoreForTests();
  __resetHostNotificationsStoreForTests();
  __resetAppLocalNotificationsStoreForTests();
  __resetAgentActivityStoreForTests();
  effectiveHostRef.value = null;
  leaseRef.value = null;
  directoryRef.value = null;
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

/** Registers `hostId` as findable with `label`, and makes it the effective
 * host with the given lease status. */
function seedHost(
  hostId: string,
  label: string,
  status: "ready" | "connecting" | "degraded" | "restarting-expected" | "dead",
): void {
  directoryRef.value = {
    findById: (id) =>
      id === hostId ? { ...mockLocalHostEntry, hostId, label } : null,
  };
  effectiveHostRef.value = hostId;
  leaseRef.value =
    status === "dead"
      ? { hostId, status: "dead", dead: { reason: "offline" } }
      : { hostId, status, dead: null };
}

describe("SideStripFoot", () => {
  beforeEach(() => {
    resetSharedState();
    signIn();
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().setSignedOut();
    resetSharedState();
  });

  it("shows the signed-in name and, with 0 agents running, only the host label", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    const trigger = screen.getByTestId("user-menu-trigger");
    expect(trigger.textContent).toContain("Ada Lovelace");
    expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
      "Ada's Mac",
    );
    expect(
      screen.getByTestId("side-strip-host-health").getAttribute("data-health"),
    ).toBe("ready");
  });

  it("shows the singular '1 agent running'", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      { "epic-1": { working: ["agent-1"], turn: [] } },
      "cloud",
      "connected",
    );
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "open",
    });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
      "Ada's Mac · 1 running",
    );
    expect(
      screen.getByRole("button", { name: /Ada's Mac · 1 agent running/ }),
    ).toBeTruthy();
  });

  it("shows the plural 'N agents running'", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      {
        "epic-1": { working: ["agent-1"], turn: [] },
        "epic-2": { working: ["agent-2"], turn: [] },
      },
      "cloud",
      "connected",
    );
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "open",
    });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
      "Ada's Mac · 2 running",
    );
    expect(
      screen.getByRole("button", { name: /Ada's Mac · 2 agents running/ }),
    ).toBeTruthy();
  });

  it("never truncates the running count - the host name gives way first", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      { "epic-1": { working: ["agent-1"], turn: [] } },
      "cloud",
      "connected",
    );
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "open",
    });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    const line = screen.getByTestId("side-strip-host-line");
    const spans = line.querySelectorAll("span");
    expect(spans).toHaveLength(2);
    const [hostNameSpan, countSpan] = spans;
    expect(hostNameSpan.className).toContain("truncate");
    expect(countSpan.className).toContain("shrink-0");
    expect(countSpan.className).not.toContain("truncate");
  });

  it.each([
    ["ready", "ready"],
    ["connecting", "pending"],
    ["degraded", "pending"],
    ["restarting-expected", "pending"],
    ["dead", "down"],
  ] as const)(
    "reads the %s lease as the %s health dot",
    async (status, health) => {
      seedHost("host-a", "Ada's Mac", status);
      renderStrip();
      await screen.findByTestId("side-tab-strip");

      expect(
        screen
          .getByTestId("side-strip-host-health")
          .getAttribute("data-health"),
      ).toBe(health);
    },
  );

  it("reads 'unknown' health with no lease at all", async () => {
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(
      screen.getByTestId("side-strip-host-health").getAttribute("data-health"),
    ).toBe("unknown");
    expect(screen.queryByTestId("side-strip-host-line")).toBeNull();
  });

  it("collapsed: shows the avatar tile alone, keeping the health dot", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    useSideTabStripStore.setState({ collapsed: true });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    const trigger = screen.getByTestId("user-menu-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("Open user menu");
    // Only the avatar fallback's initials remain - no name, no host line.
    expect(trigger.textContent).toBe("AL");
    expect(
      screen.getByTestId("side-strip-host-health").getAttribute("data-health"),
    ).toBe("ready");
  });

  it("signed out: shows the sign-in affordance instead of the account row", async () => {
    useAuthStore.getState().setSignedOut();
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.queryByTestId("user-menu-trigger")).toBeNull();
    expect(screen.getByTestId("signin-controls")).toBeTruthy();
  });

  it("opens the real user menu from the account row's custom trigger", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    const trigger = screen.getByTestId("user-menu-trigger");
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    const identity = await screen.findByTestId("user-menu-identity");
    expect(identity.textContent).toContain("Ada Lovelace");
  });
});

/**
 * The host line's running count under `ActivityFleetCoverage` (F8): a union
 * that does not reach every host is a lower bound, so the line marks it with
 * a trailing "+" and always says "agents" (plural) rather than claiming an
 * exact, possibly understated, total.
 */
describe("SideStripFoot host line under account activity coverage (F8)", () => {
  beforeEach(() => {
    resetSharedState();
    signIn();
  });

  afterEach(() => {
    cleanup();
    useAuthStore.getState().setSignedOut();
    resetSharedState();
  });

  it("does not count a reconnecting host's retained agent", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      { "epic-1": { working: ["agent-1"], turn: [] } },
      "cloud",
      "connected",
    );
    // Deliberately not attested `open` this epoch - a reconnect keeps the
    // working set on record but must not be read as a live count.
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "reconnecting",
    });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
      "Ada's Mac",
    );
  });

  it("reads an exact 'N agents running' under a fleet-spanning union - the shortcut needs no directory", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      {
        "epic-1": { working: ["agent-1"], turn: [] },
        "epic-2": { working: ["agent-2"], turn: [] },
        "epic-3": { working: ["agent-3"], turn: [] },
      },
      "cloud",
      "connected",
    );
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "open",
      servedBy: "cloud",
      cloudSyncStatus: "connected",
      stateFrameSeenThisEpoch: true,
    });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
      "Ada's Mac · 3 running",
    );
    expect(
      screen.getByRole("button", { name: /Ada's Mac · 3 agents running/ }),
    ).toBeTruthy();
  });

  it("reads a lower-bound 'N+ agents running' when the account has no known hosts (indeterminate coverage)", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      {
        "epic-1": { working: ["agent-1"], turn: [] },
        "epic-2": { working: ["agent-2"], turn: [] },
        "epic-3": { working: ["agent-3"], turn: [] },
      },
      "local",
      null,
    );
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "open",
      servedBy: "local",
      cloudSyncStatus: null,
      stateFrameSeenThisEpoch: true,
    });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
      "Ada's Mac · 3+ running",
    );
    expect(
      screen.getByRole("button", { name: /Ada's Mac · 3\+ agents running/ }),
    ).toBeTruthy();
  });

  it("keeps 'agents' plural for a single agent when the account has no known hosts - '1+ agents running'", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      { "epic-1": { working: ["agent-1"], turn: [] } },
      "local",
      null,
    );
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "open",
      servedBy: "local",
      cloudSyncStatus: null,
      stateFrameSeenThisEpoch: true,
    });
    renderStrip();
    await screen.findByTestId("side-tab-strip");

    expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
      "Ada's Mac · 1+ running",
    );
    expect(
      screen.getByRole("button", { name: /Ada's Mac · 1\+ agents running/ }),
    ).toBeTruthy();
  });

  it("reads an exact 'N agents running' with no '+' when the single known host's own narrow plane covers it", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      {
        "epic-1": { working: ["agent-1"], turn: [] },
        "epic-2": { working: ["agent-2"], turn: [] },
        "epic-3": { working: ["agent-3"], turn: [] },
      },
      "local",
      null,
    );
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "open",
      servedBy: "local",
      cloudSyncStatus: null,
      stateFrameSeenThisEpoch: true,
    });
    renderStripWithKnownHosts(["host-a"]);

    await waitFor(() => {
      expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
        "Ada's Mac · 3 running",
      );
    });
    expect(
      screen.getByRole("button", { name: /Ada's Mac · 3 agents running/ }),
    ).toBeTruthy();
  });

  it("reads 'N+ agents running' when one of two known hosts is unserved", async () => {
    seedHost("host-a", "Ada's Mac", "ready");
    __setHostAgentActivityStateForTests(
      "host-a",
      {
        "epic-1": { working: ["agent-1"], turn: [] },
        "epic-2": { working: ["agent-2"], turn: [] },
        "epic-3": { working: ["agent-3"], turn: [] },
      },
      "local",
      null,
    );
    __setHostAgentActivityHealthForTests("host-a", {
      connectionStatus: "open",
      servedBy: "local",
      cloudSyncStatus: null,
      stateFrameSeenThisEpoch: true,
    });
    // "host-b" is known to the directory but never gets a slice of its own.
    renderStripWithKnownHosts(["host-a", "host-b"]);

    await waitFor(() => {
      expect(screen.getByTestId("side-strip-host-line").textContent).toBe(
        "Ada's Mac · 3+ running",
      );
    });
    expect(
      screen.getByRole("button", { name: /Ada's Mac · 3\+ agents running/ }),
    ).toBeTruthy();
  });
});
