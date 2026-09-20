import { act, cleanup, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatLowerDock,
  type DockRowHotspot,
} from "@/components/chat/chat-lower-dock";
import type { ChatDockSection } from "@/components/chat/chat-dock-compact-strip";
import type { ChatRestoreContextValue } from "@/components/chat/chat-restore-context-core";
import type { AccumulatedChangeRow } from "@/lib/chat/accumulated-change-rows";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import { TabHostProvider } from "@/components/epic-canvas/tab-host-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChatSessionState } from "@/stores/chats/chat-session-store";
import { useLayoutEditorStore } from "@/stores/layout/layout-editor-store";
import {
  DEFAULT_LAYOUT_SNAPSHOT,
  useLayoutStore,
} from "@/stores/layout/layout-store";

/**
 * Sample fill (L-16) and materialised hidden rows (L-14), through the real
 * dock: the region refs are the real `useLayoutRegion` ones, so what the
 * assertions read is the node the editor would actually decorate.
 */

const DOCK_ORDER: ReadonlyArray<ChatDockSection> = [
  "filesChanged",
  "activeAgents",
  "background",
];

function Dock(props: {
  readonly changesPresent: boolean;
  readonly shown: boolean;
}): ReactElement {
  const files = useLayoutRegion({
    regionId: "changedFiles",
    instanceId: "tile-a",
  });
  const agents = useLayoutRegion({
    regionId: "runningAgents",
    instanceId: "tile-a",
  });
  const background = useLayoutRegion({
    regionId: "background",
    instanceId: "tile-a",
  });
  const hotspot = (
    region: typeof files,
    hasContent: boolean,
  ): DockRowHotspot => ({
    hotspotRef: region.ref,
    shown: props.shown,
    hasContent,
    ghost: region.ghost,
    editing: region.editing,
  });
  return (
    <TabHostProvider hostId="host-1">
      <TooltipProvider delayDuration={0}>
        <ChatLowerDock
          snapshotLoaded
          epicId="epic-1"
          chatId="chat-1"
          viewTabId="tab-1"
          selfAgent={null}
          activeAgents={[]}
          todo={null}
          restore={restore(props.changesPresent)}
          queue={EMPTY_QUEUE}
          folded={new Set()}
          dockOrder={DOCK_ORDER}
          hotspots={{
            filesChanged: hotspot(files, props.changesPresent),
            activeAgents: hotspot(agents, false),
            background: hotspot(background, false),
          }}
          queueResumeRequested={false}
          queueKeepPausedRequested={false}
          backgroundItems={undefined}
          runningManagedCommandCount={0}
          heldManagedCommandCount={0}
          backgroundStopPendingTaskIds={new Set()}
          backgroundStopAllPending={false}
          backgroundSessionStopPending={false}
          activeTurnStatus={null}
          canAct
          readOnly={false}
          editingQueueItemId={null}
          topSpacing="normal"
          scrollRegionMaxHeightClass="max-h-96"
          onQueuePause={() => null}
          onQueueResume={() => null}
          onQueueEdit={vi.fn()}
          onQueueCancel={vi.fn()}
          onQueueAbortSteer={vi.fn()}
          onQueueReorder={vi.fn()}
          onQueueSteerNow={vi.fn()}
          onBackgroundItemClick={vi.fn()}
          onBackgroundItemStop={() => null}
          onBackgroundItemsStopAll={() => null}
          onBackgroundSessionStop={() => null}
        />
      </TooltipProvider>
    </TabHostProvider>
  );
}

const EMPTY_QUEUE: ChatSessionState["queue"] = { status: "idle", items: [] };

const REAL_FILE_CHANGE: AccumulatedChangeRow = {
  filePath: "/repo/src/real-file.ts",
  operation: "edit",
  diffSource: "snapshot",
  reason: "snapshot",
  undoable: true,
  artifact: null,
  counts: { additions: 4, deletions: 1 },
  hasContents: true,
  digest: null,
  liveDiff: null,
};

function restore(changesPresent: boolean): ChatRestoreContextValue {
  return {
    accessRole: "owner",
    currentUserId: "owner-1",
    activeHostId: "host-1",
    activeTurnStatus: null,
    localSnapshotsClearedAt: null,
    restore: null,
    restoreActionPending: false,
    restoreCheckpoint: vi.fn().mockReturnValue(null),
    accumulatedFileChanges: changesPresent ? [REAL_FILE_CHANGE] : [],
    undeliveredChangeCount: 0,
    accumulatedSetComplete: true,
    revertFileChanges: vi.fn().mockReturnValue(null),
  };
}

function openSession(): void {
  act(() => {
    useLayoutEditorStore.getState().beginSession({
      scene: "in-place",
      preferredInstanceId: "tile-a",
      startedAt: 0,
    });
  });
}

function sampleRows(): ReadonlyArray<HTMLElement> {
  return screen.queryAllByTestId("chat-dock-sample-row");
}

beforeEach(() => {
  useLayoutEditorStore.getState().endSession();
  useLayoutEditorStore.setState({ instances: new Map() });
  useLayoutStore.getState().replaceAll(DEFAULT_LAYOUT_SNAPSHOT);
});

afterEach(() => {
  cleanup();
  useLayoutEditorStore.getState().endSession();
  useLayoutStore.getState().replaceAll(DEFAULT_LAYOUT_SNAPSHOT);
});

describe("sample fill (L-16)", () => {
  it("draws nothing for an empty row until a session opens", () => {
    render(<Dock changesPresent={false} shown />);

    expect(sampleRows()).toHaveLength(0);
    expect(screen.queryByTestId("chat-lower-dock")).toBeNull();

    openSession();

    expect(sampleRows()).toHaveLength(DOCK_ORDER.length);
  });

  it("gives the sample row the region's own node, so it is hoverable", () => {
    openSession();
    render(<Dock changesPresent={false} shown />);

    const row = sampleRows()[0];
    expect(row.getAttribute("data-layout-region")).toBe("changedFiles");
    expect(row.getAttribute("data-layout-instance")).toBe("tile-a");
    expect(row.hasAttribute("data-sample")).toBe(true);
    // The real drawing leaf, fed from the sample scene.
    expect(row.textContent).toContain("task-list.tsx");
  });

  it("never draws over live content", () => {
    openSession();
    render(<Dock changesPresent shown />);

    const rows = sampleRows();
    expect(rows.map((row) => row.getAttribute("data-layout-region"))).toEqual([
      "runningAgents",
      "background",
    ]);
    expect(
      screen.getByTestId("accumulated-changes-panel").textContent,
    ).toContain("1 file changed");
    expect(screen.queryByText("src/task-list.tsx")).toBeNull();
  });
});

describe("materialised hidden rows (L-14)", () => {
  it("has no ghost at rest and one while the index row is hovered", () => {
    act(() => {
      useLayoutStore.getState().setRegionValues("changedFiles", {
        shown: "hidden",
      });
    });
    openSession();
    render(<Dock changesPresent={false} shown={false} />);

    expect(sampleRows()).toHaveLength(0);

    act(() => {
      useLayoutEditorStore.getState().setHovered("changedFiles");
    });

    const rows = sampleRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-layout-region")).toBe("changedFiles");
    expect(rows[0].getAttribute("data-ghost")).toBe("1");

    act(() => {
      useLayoutEditorStore.getState().setHovered(null);
    });

    expect(sampleRows()).toHaveLength(0);
  });

  it("materialises a hidden row the index row selects, and no other", () => {
    act(() => {
      useLayoutStore.getState().setRegionValues("background", {
        shown: "hidden",
      });
    });
    openSession();
    render(<Dock changesPresent={false} shown={false} />);

    act(() => {
      useLayoutEditorStore.getState().select("background");
    });

    const rows = sampleRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute("data-layout-region")).toBe("background");
  });
});
