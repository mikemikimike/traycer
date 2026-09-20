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
import { useLeftPanelStore } from "@/stores/epics/left-panel-store";
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
  useLeftPanelStore.getState().clearPanelVisibilityOverrides();
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

  it("renders the three populated dock rows, the composer, and the sample context chip", () => {
    renderBody();

    expect(screen.getByText(/Sample agent/)).not.toBeNull();
    expect(screen.getByText(/Sample shell/)).not.toBeNull();
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
    expect(screen.getByText(/Sample agent/).closest("[inert]")).not.toBeNull();
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

describe("SampleWorkspaceBody - sample labelling", () => {
  afterEach(() => {
    useLayoutEditorStore.getState().endSession();
  });

  it("SampleSceneProvider reads 'sample' only while a sample-scene session is live", () => {
    renderBody();
    expect(screen.getByTestId("sample-probe").textContent).toBe("real");

    act(() => {
      useLayoutEditorStore.getState().beginSession({
        scene: "sample",
        preferredInstanceId: null,
        startedAt: 0,
      });
    });
    expect(screen.getByTestId("sample-probe").textContent).toBe("sample");

    act(() => {
      useLayoutEditorStore.getState().beginSession({
        scene: "in-place",
        preferredInstanceId: null,
        startedAt: 0,
      });
    });
    expect(screen.getByTestId("sample-probe").textContent).toBe("real");

    act(() => {
      useLayoutEditorStore.getState().endSession();
    });
    expect(screen.getByTestId("sample-probe").textContent).toBe("real");
  });
});
