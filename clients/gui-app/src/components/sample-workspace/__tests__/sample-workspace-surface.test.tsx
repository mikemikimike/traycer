import { MockRunnerHost } from "@traycer-clients/shared/host-client/mock/mock-runner-host";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LazyMotion, domAnimation } from "motion/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SampleSceneProvider } from "@/components/sample-workspace/sample-scene-provider";
import { useSampleScene } from "@/components/sample-workspace/sample-scene-context";
import { SampleWorkspaceBody } from "@/components/sample-workspace/sample-workspace-body";
import { SAMPLE_TURNS } from "@/components/sample-workspace/sample-workspace-scene";
import { TooltipProvider } from "@/components/ui/tooltip";
import { RunnerHostProvider } from "@/providers/runner-host-provider";
import { clearRailVisibilityOverrides } from "@/lib/layout/rail-view";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import { useThemeLibraryStore } from "@/stores/settings/theme-library-store";

// Every accessor a piece could reach a host through resolves to a client that
// never settles: the body must never depend on a real answer to render.
const recordingClient = vi.hoisted(
  () =>
    new Proxy(
      {},
      {
        get: (_target, prop) =>
          typeof prop === "string" && prop !== "then"
            ? (..._args: unknown[]) => new Promise(() => undefined)
            : undefined,
      },
    ),
);
vi.mock("@/hooks/host/use-host-client-for-host-id", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/hooks/host/use-host-client-for-host-id")
  >()),
  useHostClientForHostId: () => recordingClient,
}));
vi.mock("@/lib/host/runtime", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/host/runtime")>()),
  useHostClient: () => recordingClient,
  useOptionalHostClient: () => recordingClient,
}));
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => vi.fn(),
}));
// The dock's own panels are the REAL ones now (L-98), so this render reaches
// the same host boundary every other dock suite fakes away: the agent stop
// button's `HostRuntimeProvider` hooks and the managed half's RPCs. The app
// mounts both app-wide (`traycer-app.tsx`), so the fake is about this
// standalone render, not about what the sample workspace needs to exist.
vi.mock("@/components/chat/agent-stop-button", () => ({
  AgentStopButton: (props: { readonly label: string }) => (
    <button type="button">{props.label}</button>
  ),
}));
vi.mock(
  "@/hooks/managed-command/use-managed-command-lifecycle-mutations",
  () => ({
    useManagedCommandStart: () => ({ mutate: vi.fn(), isPending: false }),
    useManagedCommandStop: () => ({ mutate: vi.fn(), isPending: false }),
    useManagedCommandStopAll: () => ({ mutate: vi.fn(), isPending: false }),
    useManagedCommandDelete: () => ({ mutate: vi.fn(), isPending: false }),
    useManagedCommandConfigureIsPending: () => false,
    useManagedCommandRelaunchOnHostRestart: (
      _target: unknown,
      streamed: { relaunchOnHostRestart: boolean },
    ) => streamed.relaunchOnHostRestart,
    useManagedCommandConfigure: () => ({ mutate: vi.fn(), isPending: false }),
    useManagedCommandStopAllIsPending: () => false,
    useManagedCommandDeliverHeld: () => ({ mutate: vi.fn(), isPending: false }),
    useManagedCommandDeliverHeldIsPending: () => false,
  }),
);

function Probe(): ReactNode {
  return (
    <span data-testid="sample-probe">
      {useSampleScene() ? "sample" : "real"}
    </span>
  );
}

function renderBody() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const runnerHost = new MockRunnerHost({
    signInUrl: "https://auth.traycer.invalid/sign-in",
    authnBaseUrl: "https://authn.traycer.invalid",
    localHost: null,
    hosts: [],
    workspaceFolderPickerPaths: undefined,
    hasLocalHost: undefined,
    traycerCli: undefined,
  });
  return render(
    <RunnerHostProvider runnerHost={runnerHost}>
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={domAnimation}>
          <TooltipProvider>
            <SampleSceneProvider>
              <Probe />
              <SampleWorkspaceBody />
            </SampleSceneProvider>
          </TooltipProvider>
        </LazyMotion>
      </QueryClientProvider>
    </RunnerHostProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // jsdom does no layout: every element measures as the same reachable box.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    () => new DOMRect(20, 20, 40, 24),
  );
  vi.spyOn(Element.prototype, "getClientRects").mockImplementation(() => {
    const measured = new DOMRect(20, 20, 40, 24);
    return Object.assign([measured], {
      item: (index: number) => (index === 0 ? measured : null),
    });
  });
  useThemeLibraryStore.setState({ panelAnimations: false });
  useLayoutStore.setState({
    ...DEFAULT_LAYOUT_SNAPSHOT,
    layoutCarryDone: true,
  });
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({
    instances: new Map(),
    dockMode: "right",
    lockedBy: "none",
  });
  clearRailVisibilityOverrides();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("SampleWorkspaceBody - content", () => {
  it("renders a scrollable transcript of every sample turn, with one tool block", () => {
    renderBody();

    expect(screen.getByLabelText("Sample conversation")).not.toBeNull();
    expect(document.querySelectorAll("[data-sample-turn]")).toHaveLength(
      SAMPLE_TURNS.length,
    );
    expect(screen.getAllByText(/Sample tool/)).toHaveLength(1);
  });

  // L-98: the dock rows are the REAL panels fed sample data, not look-alike
  // headers. Each assertion below is something only the real panel draws -
  // the changed-files COUNT with its header actions, the collapsible agents
  // and background panels, the pinned todo and the queued message - so a
  // return to hand-drawn headers fails every one of them.
  it("mounts the real dock panels with sample data, the composer, and the sample context chip", () => {
    renderBody();

    const changes = screen.getByTestId("accumulated-changes-panel");
    expect(changes.textContent).toContain("3 files changed");
    expect(screen.getByTestId("accumulated-review-all")).not.toBeNull();
    expect(screen.getByTestId("accumulated-undo-all")).not.toBeNull();
    // Collapsible, which the old `FileChangeHeader` stand-in never was.
    expect(changes.getAttribute("data-state")).toBe("closed");

    const agents = screen.getByTestId("active-agents-panel");
    expect(agents.textContent).toContain("2 running");
    const background = screen.getByTestId("background-items-panel");
    expect(background.textContent).toContain("running");
    expect(screen.getByTestId("pinned-todo-panel")).not.toBeNull();
    expect(screen.getByTestId("queued-message-rows")).not.toBeNull();

    expect(screen.getByText("Describe the next change…")).not.toBeNull();
    expect(screen.getByText("Sample workspace")).not.toBeNull();
    expect(screen.getByTestId("context-usage-meter")).not.toBeNull();
  });

  it("draws a minimap from the sample turns", () => {
    renderBody();

    expect(screen.getByTestId("chat-turn-minimap")).not.toBeNull();
    expect(
      screen.getAllByTestId("chat-turn-minimap-tick").length,
    ).toBeGreaterThan(0);
  });

  it("is passive: dock, composer and transcript text are inert, the scroller is not", () => {
    renderBody();

    // Native scrolling must keep working, so the scroller itself is NOT inert...
    expect(
      screen.getByLabelText("Sample conversation").hasAttribute("inert"),
    ).toBe(false);
    // ...but the text inside it is, and so is everything from the dock down.
    const turn = document.querySelector("[data-sample-turn]");
    expect(turn?.closest("[inert]")).not.toBeNull();
    expect(
      screen.getByTestId("active-agents-panel").closest("[inert]"),
    ).not.toBeNull();
    expect(
      screen.getByText("Describe the next change…").closest("[inert]"),
    ).not.toBeNull();
    // The inert minimap stays measurable; the editor reaches it through the
    // region registration `useLayoutRegion` stamps on its node.
    expect(
      screen.getByTestId("chat-turn-minimap").closest("[inert]"),
    ).not.toBeNull();
  });
});

describe("SampleWorkspaceBody - a hidden dock member's ghost", () => {
  afterEach(() => {
    useLayoutEditorStore.getState().endSession();
  });

  // A member that is Hidden AND Chip draws nothing at rest and materialises
  // while the editor points at it (L-14). The shape it materialises IN is the
  // one it would take if it were shown, which for a Chip-sized member is the
  // pill - so the picture the user judges their own setting by is the setting.
  //
  // It drew a full ROW instead: `folded` was derived from the stored `shown`
  // alone while `planDockRow` asked `shown || ghost`, so the ghost slipped
  // past the fold and landed in the joined frame. One derivation now
  // (`dockMemberFolded`), read by this host and by the real tile.
  it("materialises a Hidden + Chip member as its chip, not as a full row", () => {
    useLayoutStore.setState({
      ...DEFAULT_LAYOUT_SNAPSHOT,
      overrides: { changedFiles: { shown: "hidden", size: "chip" } },
      layoutCarryDone: true,
    });
    renderBody();

    // Hidden and unpointed-at: neither shape is on screen.
    expect(screen.queryByTestId("chat-dock-chip-filesChanged")).toBeNull();
    expect(screen.queryByTestId("accumulated-changes-panel")).toBeNull();

    act(() => {
      useLayoutEditorStore.getState().beginSession({
        entry: "pointer",
        source: "direct_ui",
        startedAt: 0,
      });
      useLayoutEditorStore.getState().select("changedFiles");
    });

    expect(screen.getByTestId("chat-dock-chip-filesChanged")).not.toBeNull();
    expect(screen.queryByTestId("accumulated-changes-panel")).toBeNull();
  });
});

describe("SampleWorkspaceBody - sample labelling", () => {
  afterEach(() => {
    useLayoutEditorStore.getState().endSession();
  });

  it("SampleSceneProvider reads 'sample' exactly while a session is live", () => {
    renderBody();
    expect(screen.getByTestId("sample-probe").textContent).toBe("real");

    act(() => {
      useLayoutEditorStore.getState().beginSession({
        entry: "pointer",
        source: "direct_ui",
        startedAt: 0,
      });
    });
    expect(screen.getByTestId("sample-probe").textContent).toBe("sample");

    act(() => {
      useLayoutEditorStore.getState().endSession();
    });
    expect(screen.getByTestId("sample-probe").textContent).toBe("real");
  });
});
