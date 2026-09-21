import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BackgroundItem } from "@traycer/protocol/host/agent/gui/subscribe";
import {
  ChatLowerDock,
  type DockRowHotspot,
} from "@/components/chat/chat-lower-dock";
import {
  ChatDockCompactStripProvider,
  type ChatDockCompactChipModel,
  type ChatDockSection,
} from "@/components/chat/chat-dock-compact-strip";
import {
  useChatDockOpenSection,
  useChatDockOpenStore,
} from "@/stores/chats/chat-dock-open-store";
import { useSettingsStore } from "@/stores/settings/settings-store";
import type { AccumulatedChangeRow } from "@/lib/chat/accumulated-change-rows";
import type { ChatRestoreContextValue } from "@/components/chat/chat-restore-context-core";
import type { ChatSessionState } from "@/stores/chats/chat-session-store";
import { TabHostProvider } from "@/components/epic-canvas/tab-host-provider";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * L-142: the compact pills are a ONE-AT-A-TIME switcher.
 *
 * Everything here is driven through the real wiring rather than a prop: the
 * open section comes from `chat-dock-open-store` (which is where the tile
 * reads it) and the click goes through the same `toggleSection` the strip
 * calls, so "clicking replaces" is observed as the dock's DOM rather than as a
 * callback argument.
 */

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

const CHAT_ID = "chat-1";
const OTHER_CHAT_ID = "chat-2";

/** Files changed and Background are pills; Active agents stays a full row. */
const PILL_SECTIONS: ReadonlyArray<ChatDockSection> = [
  "filesChanged",
  "background",
];

const DOCK_ORDER: ReadonlyArray<ChatDockSection> = [
  "filesChanged",
  "activeAgents",
  "background",
  "queue",
  "todo",
];

const BACKGROUND_ITEMS: ReadonlyArray<BackgroundItem> = [
  {
    taskId: "task-1",
    kind: "command",
    title: "bun test",
    blockId: "task-1-block",
    parentTaskId: null,
    scheduledFor: null,
    individualStopUnavailable: null,
  },
];

const FILE_CHANGE: AccumulatedChangeRow = {
  filePath: "/repo/src/app.ts",
  operation: "edit",
  diffSource: "snapshot",
  reason: "snapshot",
  undoable: true,
  artifact: null,
  counts: { additions: 3, deletions: 1 },
  hasContents: true,
  digest: null,
  liveDiff: null,
};

const RESTORE: ChatRestoreContextValue = {
  accessRole: "owner",
  currentUserId: "owner-1",
  activeHostId: "host-1",
  activeTurnStatus: null,
  localSnapshotsClearedAt: null,
  restore: null,
  restoreActionPending: false,
  restoreCheckpoint: () => null,
  accumulatedFileChanges: [FILE_CHANGE],
  undeliveredChangeCount: 0,
  accumulatedSetComplete: true,
  revertFileChanges: () => null,
};

const EMPTY_QUEUE: ChatSessionState["queue"] = { status: "idle", items: [] };

function hotspot(hasContent: boolean): DockRowHotspot {
  return {
    hotspotRef: () => undefined,
    shown: true,
    hasContent,
    ghost: false,
    editing: false,
  };
}

function chip(section: ChatDockSection): ChatDockCompactChipModel {
  return {
    section,
    glyph: section,
    hotspotRef: null,
    working: false,
    text: "1",
    lineDeltas: null,
    label: `${section} pill`,
    pulseToken: null,
  };
}

/** The tile's own wiring in miniature: store in, `toggleSection` out. */
function DockHarness(props: { readonly chatId: string }) {
  const openSection = useChatDockOpenSection(props.chatId);
  const toggleSection = useChatDockOpenStore((state) => state.toggleSection);
  return (
    <TabHostProvider hostId="host-1">
      <TooltipProvider delayDuration={0}>
        <ChatDockCompactStripProvider
          value={{
            chips: PILL_SECTIONS.map(chip),
            openSection,
            panelId: "dock-panel-1",
            onToggle: (section) => {
              toggleSection(props.chatId, section);
            },
          }}
        >
          <ChatLowerDock
            snapshotLoaded
            epicId="epic-1"
            chatId={props.chatId}
            viewTabId="tab-1"
            selfAgent={{
              id: "chat-1",
              title: "This chat",
              surface: "gui",
              activity: "turn",
              hostId: "host-1",
            }}
            activeAgents={[
              {
                id: "child-1",
                title: "Child one",
                surface: "gui",
                activity: "turn",
                hostId: "host-1",
              },
            ]}
            todo={null}
            restore={RESTORE}
            queue={EMPTY_QUEUE}
            folded={new Set(PILL_SECTIONS)}
            dockOrder={DOCK_ORDER}
            hotspots={{
              filesChanged: hotspot(true),
              activeAgents: hotspot(true),
              background: hotspot(true),
              queue: hotspot(false),
              todo: hotspot(false),
            }}
            backgroundItems={BACKGROUND_ITEMS}
            runningManagedCommandCount={0}
            heldManagedCommandCount={0}
            backgroundStopPendingTaskIds={new Set()}
            backgroundStopAllPending={false}
            backgroundSessionStopPending={false}
            activeTurnStatus="running"
            canAct
            queueResumeRequested={false}
            queueKeepPausedRequested={false}
            readOnly={false}
            editingQueueItemId={null}
            topSpacing="normal"
            scrollRegionMaxHeightClass="max-h-96"
            onQueuePause={() => null}
            onQueueResume={() => null}
            onQueueEdit={() => undefined}
            onQueueCancel={() => undefined}
            onQueueAbortSteer={() => undefined}
            onQueueReorder={() => undefined}
            onQueueSteerNow={() => undefined}
            onBackgroundItemClick={() => undefined}
            onBackgroundItemStop={() => null}
            onBackgroundItemsStopAll={() => null}
            onBackgroundSessionStop={() => null}
          />
        </ChatDockCompactStripProvider>
      </TooltipProvider>
    </TabHostProvider>
  );
}

function attachedSections(): ReadonlyArray<string | null> {
  return [
    ...document.querySelectorAll("[data-testid='chat-dock-attached-panel']"),
  ].map((node) => node.getAttribute("data-dock-section"));
}

function clickPill(section: ChatDockSection): void {
  fireEvent.click(screen.getByTestId(`chat-dock-chip-${section}`));
}

afterEach(() => {
  cleanup();
  useChatDockOpenStore.setState({ openByChatId: new Map() });
  useSettingsStore.setState({ chatDockPanelHeight: 0.33 });
});

describe("compact pills are a one-at-a-time switcher", () => {
  it("opens nothing until a pill is clicked", () => {
    render(<DockHarness chatId={CHAT_ID} />);

    expect(attachedSections()).toEqual([]);
    expect(
      screen
        .getByTestId("chat-dock-chip-filesChanged")
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("attaches exactly one panel, and a second pill REPLACES it", () => {
    render(<DockHarness chatId={CHAT_ID} />);

    clickPill("filesChanged");
    expect(attachedSections()).toEqual(["filesChanged"]);

    clickPill("background");
    // One panel, and it is the other section's - a switch, never a stack.
    expect(attachedSections()).toEqual(["background"]);
    expect(
      screen.queryByRole("button", {
        name: "Undo changes to /repo/src/app.ts",
      }),
    ).toBeNull();
  });

  it("closes when the open pill is clicked again", () => {
    render(<DockHarness chatId={CHAT_ID} />);

    clickPill("filesChanged");
    clickPill("filesChanged");

    expect(attachedSections()).toEqual([]);
  });

  it("keeps focus on the pill across a swap", () => {
    render(<DockHarness chatId={CHAT_ID} />);

    const background = screen.getByTestId("chat-dock-chip-background");
    clickPill("filesChanged");
    background.focus();
    clickPill("background");

    expect(document.activeElement).toBe(background);
  });

  it("marks the open pill pressed and points it at the panel it controls", () => {
    render(<DockHarness chatId={CHAT_ID} />);

    clickPill("filesChanged");

    const pill = screen.getByTestId("chat-dock-chip-filesChanged");
    expect(pill.getAttribute("aria-pressed")).toBe("true");
    expect(pill.getAttribute("aria-controls")).toBe("dock-panel-1");
    expect(
      screen.getByTestId("chat-dock-attached-panel").getAttribute("id"),
    ).toBe("dock-panel-1");
    // The pill that is NOT open points at nothing.
    expect(
      screen
        .getByTestId("chat-dock-chip-background")
        .getAttribute("aria-controls"),
    ).toBeNull();
  });

  it("draws the attached panel with no collapsible header of its own", () => {
    render(<DockHarness chatId={CHAT_ID} />);

    clickPill("filesChanged");

    // The pill IS the header: the collapsible root the full row draws is gone,
    // and the rows are on screen without a second click.
    expect(screen.queryByTestId("accumulated-changes-panel")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Undo changes to /repo/src/app.ts" }),
    ).not.toBeNull();
  });

  it("puts the attached panel above the fixed full rows", () => {
    render(<DockHarness chatId={CHAT_ID} />);

    clickPill("background");

    const attached = screen.getByTestId("chat-dock-attached-panel");
    const fixedRow = screen.getByTestId("active-agents-panel");
    expect(attached.compareDocumentPosition(fixedRow)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("keeps the open panel's actions in the pill row, not in the panel", () => {
    render(<DockHarness chatId={CHAT_ID} />);

    clickPill("filesChanged");

    const actionsHost = screen.getByTestId("chat-dock-pill-actions");
    const undoAll = screen.getByTestId("accumulated-undo-all");
    expect(actionsHost.contains(undoAll)).toBe(true);
    expect(
      screen.getByTestId("chat-dock-attached-panel").contains(undoAll),
    ).toBe(false);
    // And the strip they live in is still the first cluster in the stack, so
    // the pills have not moved to make room for them.
    expect(
      screen
        .getByTestId("chat-dock-compact-strip")
        .contains(screen.getByTestId("chat-dock-chip-filesChanged")),
    ).toBe(true);
  });

  it("remembers the open pill per chat", () => {
    const view = render(<DockHarness chatId={CHAT_ID} />);
    clickPill("filesChanged");
    view.unmount();

    // A same-pane chat switch is a full remount; the panel comes back.
    render(<DockHarness chatId={CHAT_ID} />);
    expect(attachedSections()).toEqual(["filesChanged"]);

    cleanup();
    // Another conversation is another answer - and nothing auto-opens there.
    render(<DockHarness chatId={OTHER_CHAT_ID} />);
    expect(attachedSections()).toEqual([]);
  });
});

describe("the attached panel's height", () => {
  it("resizes from the handle and remembers the choice", () => {
    render(<DockHarness chatId={CHAT_ID} />);
    clickPill("filesChanged");

    const handle = screen.getByTestId("chat-dock-attached-panel-resize");
    expect(handle.getAttribute("aria-valuenow")).toBe("33");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle.getAttribute("aria-valuenow")).toBe("35");
    expect(useSettingsStore.getState().chatDockPanelHeight).toBeCloseTo(0.35);

    // Double-click is the way back to the default.
    fireEvent.doubleClick(handle);
    expect(handle.getAttribute("aria-valuenow")).toBe("33");
  });

  it("refuses a height that would bury the transcript", () => {
    render(<DockHarness chatId={CHAT_ID} />);
    clickPill("filesChanged");

    const handle = screen.getByTestId("chat-dock-attached-panel-resize");
    fireEvent.keyDown(handle, { key: "Home" });
    expect(handle.getAttribute("aria-valuenow")).toBe("50");

    fireEvent.keyDown(handle, { key: "ArrowUp" });
    expect(handle.getAttribute("aria-valuenow")).toBe("50");
  });
});
