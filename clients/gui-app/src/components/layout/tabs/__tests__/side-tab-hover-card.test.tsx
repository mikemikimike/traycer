/**
 * `SideTabHoverCardBody` reads live agent names through the REAL open-epic
 * registry (`useRegisteredEpicLiveAgents` / `useRegisteredEpicLiveAgentIds`,
 * the shape `use-mounted-epic-projection.test.tsx` already exercises this
 * way), and live counts through the real `agent-activity-store`. A cold epic
 * (no registry session) must show counts only, never invented names.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import type {
  ChatProjection,
  TuiAgentProjection,
} from "@/stores/epics/open-epic/types";
import type { EpicStreamClientFactory } from "@/stores/epics/open-epic/store";
import {
  openStoreForTest,
  type OpenedStoreForTest,
} from "@/stores/epics/open-epic/test-support/open-store-for-test";
import { __getOpenEpicRegistryForTests } from "@/lib/registries/epic-session-registry";
import {
  PARTIAL_ACTIVITY_NOTICE,
  UNKNOWN_ACTIVITY_TITLE,
} from "@/components/notifications/notification-indicator-icon";
import type { AgentActivityCoverage } from "@/lib/agent-activity";
import {
  __resetAgentActivityStoreForTests,
  __setAgentActivityStateForTests,
  __setHostAgentActivityHealthForTests,
} from "@/stores/agent-activity-store";
import { SideTabHoverCardBody } from "../side-strip/side-tab-hover-card";
import type { SideTabLiveAgents } from "../side-strip/agent-meter";
import {
  NO_LIVE_AGENTS,
  sideTabAgentCounts,
  useSideTabLiveAgents,
} from "../side-strip/side-tab-live-agents";

// `useSideTabLiveAgents` (used by the single "end to end" case below) reads
// `useAccountActivityCoverage`, which asks the host directory through
// `useHostBinding()`. This suite has no `HostRuntimeProvider`, so the real
// hook already reads `null` - unsettled - everywhere except that one case,
// which opts into a known-hosts list through this ref.
const knownHostIdsRef = vi.hoisted((): { value: readonly string[] | null } => ({
  value: null,
}));

vi.mock("@/lib/host", () => ({
  useHostBinding: () =>
    knownHostIdsRef.value === null
      ? null
      : {
          directory: {
            knownHostIds: () => knownHostIdsRef.value,
            onChange: () => ({ dispose: () => undefined }),
          },
        },
}));

const fakeStreamClientFactory: EpicStreamClientFactory = () => ({
  applyUpdate: () => undefined,
  awareness: () => undefined,
  applyArtifactRoomUpdate: () => undefined,
  artifactRoomAwareness: () => undefined,
  retryMigration: () => undefined,
  close: () => undefined,
});

function chatProjection(
  id: string,
  overrides: Partial<ChatProjection>,
): ChatProjection {
  return {
    id,
    title: "Chat",
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    userId: null,
    hostId: "host-a",
    isTitleEditedByUser: false,
    docResident: false,
    archivedAt: null,
    settings: null,
    ...overrides,
  };
}

function tuiAgentProjection(
  id: string,
  overrides: Partial<TuiAgentProjection>,
): TuiAgentProjection {
  return {
    id,
    docResident: false,
    origin: "registry",
    harnessId: "codex",
    title: "Codex",
    parentId: null,
    createdAt: 0,
    updatedAt: 0,
    userId: null,
    hostId: "host-a",
    workspaceFolders: [],
    workspaceMode: undefined,
    model: null,
    reasoningEffort: null,
    agentMode: "regular",
    profileId: null,
    archivedAt: null,
    harnessSessionId: null,
    terminalAgentArgs: null,
    terminalShellCommand: null,
    terminalShellArgs: null,
    sessionState: null,
    lastExit: null,
    ...overrides,
  };
}

const handles: OpenedStoreForTest[] = [];

function openEpic(epicId: string): OpenedStoreForTest {
  const handle = openStoreForTest({
    epicId,
    userId: null,
    factories: {
      streamClientFactory: fakeStreamClientFactory,
      laneSelection: null,
    },
    writeCommand: null,
  });
  handles.push(handle);
  return handle;
}

function agents(
  turn: number,
  background: number,
  coverage: AgentActivityCoverage,
): SideTabLiveAgents {
  return { turn, background, coverage };
}

afterEach(() => {
  cleanup();
  __getOpenEpicRegistryForTests().disposeAll();
  for (const handle of handles) handle.dispose();
  handles.length = 0;
  __resetAgentActivityStoreForTests();
  knownHostIdsRef.value = null;
});

describe("SideTabHoverCardBody", () => {
  it("shows only counts for a cold epic, no invented agent list", () => {
    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId="epic-cold"
        badge={null}
        agents={agents(2, 1, "covered")}
      />,
    );
    expect(screen.getByText("Fix login")).not.toBeNull();
    expect(screen.getByTestId("side-tab-hover-card-counts").textContent).toBe(
      "2 running · 1 background",
    );
    expect(screen.queryByTestId("side-tab-hover-card-agents")).toBeNull();
  });

  it("lists working agents by name for a warm epic", () => {
    const registry = __getOpenEpicRegistryForTests();
    const handle = openEpic("epic-warm");
    handle.store.setState({
      chats: {
        allIds: ["agent-1"],
        byId: { "agent-1": chatProjection("agent-1", { title: "Agent One" }) },
      },
      tuiAgents: {
        allIds: ["agent-2"],
        byId: {
          "agent-2": tuiAgentProjection("agent-2", { title: "Agent Two" }),
        },
      },
    });
    act(() => {
      registry.acquire("epic-warm", () => handle);
    });
    __setAgentActivityStateForTests(
      { "epic-warm": { working: ["agent-1", "agent-2"], turn: ["agent-1"] } },
      "local",
      "connected",
    );

    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId="epic-warm"
        badge={null}
        agents={agents(1, 1, "covered")}
      />,
    );

    const list = screen.getByTestId("side-tab-hover-card-agents");
    const items = Array.from(list.querySelectorAll("li[data-tier]"));
    // The name is the li's second direct child, after the tier glyph - read
    // that element specifically so this does not depend on whatever fallback
    // text the (possibly nested) running spinner paints.
    expect(items.map((item) => item.children[1]?.textContent)).toEqual([
      "Agent One",
      "Agent Two",
    ]);
    expect(items.map((item) => (item as HTMLElement).dataset.tier)).toEqual([
      "turn",
      "background",
    ]);
  });

  it("names an untitled warm agent rather than leaving it blank", () => {
    const registry = __getOpenEpicRegistryForTests();
    const handle = openEpic("epic-warm-untitled");
    handle.store.setState({
      // An untitled chat's projection carries "" (`ChatProjection.title` is
      // `string`, never `null`) - not the sentinel `WarmAgentList` itself
      // shows a fallback for.
      chats: {
        allIds: ["agent-1"],
        byId: { "agent-1": chatProjection("agent-1", { title: "" }) },
      },
    });
    act(() => {
      registry.acquire("epic-warm-untitled", () => handle);
    });
    __setAgentActivityStateForTests(
      { "epic-warm-untitled": { working: ["agent-1"], turn: ["agent-1"] } },
      "local",
      "connected",
    );

    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId="epic-warm-untitled"
        badge={null}
        agents={agents(1, 0, "covered")}
      />,
    );

    expect(
      screen.getByTestId("side-tab-hover-card-agents").textContent,
    ).toContain("Untitled agent");
  });

  it("shows no agent list, warm or cold, when there is nothing live", () => {
    const registry = __getOpenEpicRegistryForTests();
    const handle = openEpic("epic-warm-idle");
    handle.store.setState({ chats: { allIds: [], byId: {} } });
    act(() => {
      registry.acquire("epic-warm-idle", () => handle);
    });

    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId="epic-warm-idle"
        badge={null}
        agents={{ ...NO_LIVE_AGENTS, coverage: "covered" }}
      />,
    );
    expect(screen.queryByTestId("side-tab-hover-card-counts")).toBeNull();
    expect(screen.queryByTestId("side-tab-hover-card-agents")).toBeNull();
    expect(screen.getByTestId("side-tab-hover-card-state").textContent).toBe(
      "Idle",
    );
  });

  it.each([
    ["approval", "Needs approval"],
    ["reply", "Needs a reply"],
    ["failed", "Failed"],
    ["unread", "Done, unread"],
  ] as const)(
    "states the %s badge ahead of running or background work",
    (badge, label) => {
      render(
        <SideTabHoverCardBody
          title="Fix login"
          epicId={null}
          badge={badge}
          agents={agents(2, 0, "covered")}
        />,
      );
      expect(
        screen.getByTestId("side-tab-hover-card-state").textContent,
      ).toContain(label);
    },
  );

  it("falls back to Running or Background work with no badge", () => {
    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId={null}
        badge={null}
        agents={agents(1, 0, "covered")}
      />,
    );
    expect(
      screen.getByTestId("side-tab-hover-card-state").textContent,
    ).toContain("Running");
    cleanup();

    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId={null}
        badge={null}
        agents={agents(0, 1, "covered")}
      />,
    );
    expect(
      screen.getByTestId("side-tab-hover-card-state").textContent,
    ).toContain("Background work");
  });
});

describe("SideTabHoverCardBody under unserved/indeterminate coverage (F8 round 2)", () => {
  it("shows the unknown glyph and title, never Idle, under unserved coverage with no badge and no agents", () => {
    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId={null}
        badge={null}
        agents={agents(0, 0, "unserved")}
      />,
    );
    const state = screen.getByTestId("side-tab-hover-card-state");
    expect(state.textContent).toContain(UNKNOWN_ACTIVITY_TITLE);
    expect(state.textContent).not.toContain("Idle");
    expect(screen.getByTestId("side-tab-hover-card-unknown")).toBeTruthy();
    expect(screen.queryByTestId("side-tab-hover-card-partial")).toBeNull();
  });

  it("keeps the running state and adds the partial notice when unserved coverage still has agents", () => {
    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId={null}
        badge={null}
        agents={agents(1, 0, "unserved")}
      />,
    );
    const state = screen.getByTestId("side-tab-hover-card-state");
    expect(state.textContent).toContain("Running");
    expect(screen.queryByTestId("side-tab-hover-card-unknown")).toBeNull();
    expect(screen.getByTestId("side-tab-hover-card-partial").textContent).toBe(
      PARTIAL_ACTIVITY_NOTICE,
    );
  });

  it("keeps the badge state and adds the partial notice when unserved coverage has a badge but no agents", () => {
    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId={null}
        badge="approval"
        agents={agents(0, 0, "unserved")}
      />,
    );
    const state = screen.getByTestId("side-tab-hover-card-state");
    expect(state.textContent).toContain("Needs approval");
    expect(screen.queryByTestId("side-tab-hover-card-unknown")).toBeNull();
    expect(screen.getByTestId("side-tab-hover-card-partial").textContent).toBe(
      PARTIAL_ACTIVITY_NOTICE,
    );
  });

  it("reads plain Idle with no partial line under indeterminate coverage - nothing answering is the pill's story, not a per-row one", () => {
    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId={null}
        badge={null}
        agents={agents(0, 0, "indeterminate")}
      />,
    );
    const state = screen.getByTestId("side-tab-hover-card-state");
    expect(state.textContent).toBe("Idle");
    expect(screen.queryByTestId("side-tab-hover-card-unknown")).toBeNull();
    expect(screen.queryByTestId("side-tab-hover-card-partial")).toBeNull();
  });

  it("reads plain Idle with no unknown glyph or partial notice end to end, when a single narrow-plane host is the account's only known host", () => {
    const HOST_A = "host-a";
    // Narrow (non-fleet-spanning) but covers itself, and is the account's
    // sole known host - `selectKnownHostsActivityCoverage` reads this as
    // `covered`, not `unserved`: the whole reason the account-wide selector
    // exists rather than reusing the per-host one directly.
    __setHostAgentActivityHealthForTests(HOST_A, {
      connectionStatus: "open",
      servedBy: "local",
      cloudSyncStatus: null,
      stateFrameSeenThisEpoch: true,
    });
    knownHostIdsRef.value = [HOST_A];

    const { result } = renderHook(() => useSideTabLiveAgents("epic-unknown"));
    expect(result.current.coverage).toBe("covered");

    render(
      <SideTabHoverCardBody
        title="Fix login"
        epicId={null}
        badge={null}
        agents={result.current}
      />,
    );
    const state = screen.getByTestId("side-tab-hover-card-state");
    expect(state.textContent).toBe("Idle");
    expect(screen.queryByTestId("side-tab-hover-card-unknown")).toBeNull();
    expect(screen.queryByTestId("side-tab-hover-card-partial")).toBeNull();
  });
});

describe("sideTabAgentCounts", () => {
  it("joins running and background counts with a middle dot", () => {
    expect(sideTabAgentCounts(agents(3, 1, "covered"))).toBe(
      "3 running · 1 background",
    );
  });

  it("is null with no live agent", () => {
    expect(sideTabAgentCounts(NO_LIVE_AGENTS)).toBeNull();
  });
});
