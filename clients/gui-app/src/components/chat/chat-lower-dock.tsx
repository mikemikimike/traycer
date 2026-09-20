import type { ReactNode } from "react";
import type {
  BackgroundItem,
  ChatActiveTurn,
  ChatQueuedItem,
  ChatQueuedPromptItem,
} from "@traycer/protocol/host/agent/gui/subscribe";
import { PinnedTodoPanel } from "@/components/chat/chat-pinned-stack";
import { ChatAccumulatedChangesPanel } from "@/components/chat/chat-accumulated-changes-panel";
import { ActiveAgentsPanel } from "@/components/chat/chat-active-agents-panel";
import { BackgroundItemsPanel } from "@/components/chat/chat-background-items-panel";
import type { ChatRestoreContextValue } from "@/components/chat/chat-restore-context-core";
import type { PinnedTodoSnapshot } from "@/components/chat/chat-pinned-todos";
import type { ChatDockSection } from "@/components/chat/chat-dock-compact-context";
import type { AgentRow } from "@/hooks/agent/use-agent-stop-controls";
import { QueuedMessagePanel } from "@/components/chat/queued-message-surface";
import {
  SampleChip,
  SampleDockRow,
} from "@/components/sample-workspace/sample-dock-rows";
import type { ChatSessionState } from "@/stores/chats/chat-session-store";

import { cn } from "@/lib/utils";
import type { ChatPinnedStackTopSpacing } from "@/components/chat/chat-pinned-stack";

/** One dock row's hotspot, registered by the tile regardless of which of the
 *  three anchors (sample row here, real row here, or the compact chip in the
 *  composer strip) currently carries it. */
export interface DockRowHotspot {
  readonly hotspotRef: (node: HTMLElement | null) => void;
  /** The region's own Shown value - a hidden row draws neither row nor chip. */
  readonly shown: boolean;
  /** Whether this chat has live content for the row right now. With none, an
   *  editor session draws the sample leaf in its place instead (L-16). */
  readonly hasContent: boolean;
  /** A hidden row materialising because the editor is pointing at it (L-14). */
  readonly ghost: boolean;
  readonly editing: boolean;
}

interface LiveChatLowerDockProps {
  readonly snapshotLoaded: boolean;
  readonly epicId: string;
  /** The chat this dock belongs to - the strip's managed-command join key. */
  readonly chatId: string;
  readonly viewTabId: string;
  readonly selfAgent: AgentRow | null;
  readonly activeAgents: ReadonlyArray<AgentRow>;
  readonly todo: PinnedTodoSnapshot | null;
  readonly restore: ChatRestoreContextValue;
  /**
   * The queue as this dock should render it. The caller may have removed the
   * received-A2A rows from it - see `folded` - so this is not always the
   * session's whole queue.
   */
  readonly queue: ChatSessionState["queue"];
  /**
   * Sections currently standing as a chip in the composer's bottom strip
   * instead of as a row here. Decided by the caller, which needs the same
   * answer to size everything below the dock.
   */
  readonly folded: ReadonlySet<ChatDockSection>;
  /** The vertical order of the three reorderable rows below Todo. */
  readonly dockOrder: ReadonlyArray<ChatDockSection>;
  /** This tile's Customize hotspot for each of the three reorderable rows. */
  readonly hotspots: Readonly<Record<ChatDockSection, DockRowHotspot>>;
  readonly backgroundItems: ReadonlyArray<BackgroundItem> | undefined;
  /**
   * This chat's running managed commands, counted by the parent because the
   * surfaces around the dock size themselves from the same number - see
   * `chatBackgroundSectionVisible`.
   */
  readonly runningManagedCommandCount: number;
  /**
   * This chat's held shells, counted by the parent for the same reason - and
   * counted separately because the hold a human has to clear sits on a shell
   * that has FINISHED, which the running count above will never see. A chat
   * whose only background state is a hold opens the section on this alone.
   */
  readonly heldManagedCommandCount: number;
  readonly backgroundStopPendingTaskIds: ReadonlySet<string>;
  readonly backgroundStopAllPending: boolean;
  readonly backgroundSessionStopPending: boolean;
  readonly activeTurnStatus: ChatActiveTurn["status"] | null;
  readonly canAct: boolean;
  readonly queueResumeRequested: boolean;
  readonly queueKeepPausedRequested: boolean;
  readonly readOnly: boolean;
  readonly editingQueueItemId: string | null;
  readonly topSpacing: ChatPinnedStackTopSpacing;
  readonly scrollRegionMaxHeightClass: string;
  readonly onQueuePause: () => string | null;
  readonly onQueueResume: () => string | null;
  readonly onQueueEdit: (item: ChatQueuedPromptItem) => void;
  readonly onQueueCancel: (item: ChatQueuedItem) => void;
  readonly onQueueAbortSteer: (item: ChatQueuedPromptItem) => void;
  readonly onQueueReorder: (
    item: ChatQueuedItem,
    beforeQueueItemId: string | null,
  ) => void;
  readonly onQueueSteerNow: (item: ChatQueuedPromptItem) => void;
  readonly onBackgroundItemClick: (item: BackgroundItem) => void;
  readonly onBackgroundItemStop: (taskId: string) => string | null;
  readonly onBackgroundItemsStopAll: () => string | null;
  readonly onBackgroundSessionStop: () => string | null;
}

interface DockRowPlan {
  readonly section: ChatDockSection;
  readonly hotspot: DockRowHotspot;
  readonly showSample: boolean;
  readonly showRow: boolean;
}

/**
 * The sample workspace's dock: every row is a sample leaf, because the scene
 * has no chat behind it at all.
 */
interface PresentationChatLowerDockProps {
  readonly presentation: true;
  readonly folded: ReadonlySet<ChatDockSection>;
  readonly dockOrder: ReadonlyArray<ChatDockSection>;
  readonly hotspots: Readonly<Record<ChatDockSection, DockRowHotspot>>;
  readonly topSpacing: ChatPinnedStackTopSpacing;
}
export type ChatLowerDockProps =
  | LiveChatLowerDockProps
  | PresentationChatLowerDockProps;

/**
 * Whether a row draws, and as what.
 *
 * A hidden row draws nothing at rest and materialises while the editor points
 * at it (L-14). A drawn row with no live content draws the sample leaf while a
 * session is live, so a `sampleFilled` region always has a node to hover, name
 * and drag (L-16, 4.9) - and never over real content, which wins outright.
 */
function planDockRow(
  section: ChatDockSection,
  hotspot: DockRowHotspot,
  folded: ReadonlySet<ChatDockSection>,
  presentation: boolean,
): DockRowPlan {
  const unfolded = (hotspot.shown || hotspot.ghost) && !folded.has(section);
  // The sample scene has no chat behind it, so it never has live content.
  const hasContent = !presentation && hotspot.hasContent;
  return {
    section,
    hotspot,
    showSample: unfolded && !hasContent && (presentation || hotspot.editing),
    showRow: unfolded && hasContent,
  };
}

export function ChatLowerDock(props: ChatLowerDockProps) {
  const live = "presentation" in props ? null : props;
  const todoVisible =
    live !== null && live.snapshotLoaded && live.todo !== null;
  const queueVisible = live !== null && live.queue.items.length > 0;
  const rows = props.dockOrder.map((section) =>
    planDockRow(section, props.hotspots[section], props.folded, live === null),
  );
  const anyRowVisible = rows.some((row) => row.showSample || row.showRow);

  if (!todoVisible && !queueVisible && !anyRowVisible) {
    return null;
  }

  const topPadding = props.topSpacing === "compact" ? "pt-2" : "pt-4";

  return (
    <div className="pointer-events-none px-4" data-testid="chat-lower-dock">
      <div
        className={cn(
          "pointer-events-auto mx-auto w-full max-w-3xl bg-canvas",
          topPadding,
        )}
      >
        <div className="@container mx-3 -mb-px overflow-hidden rounded-t-lg border border-b-0 border-border bg-muted/30">
          {live ? <QueueSection visible={queueVisible} dock={live} /> : null}
          {todoVisible ? (
            <PinnedTodoPanel
              todo={live.todo}
              scrollRegionMaxHeightClass={live.scrollRegionMaxHeightClass}
              separated={queueVisible}
            />
          ) : null}
          {dockRows({
            rows,
            separatedBefore: queueVisible || todoVisible,
            dock: live,
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Plain functions, never JSX components (never invoked as `<X .../>`): each
 * dock row's hotspot ref is a plain callback threaded through here as data,
 * and the react-compiler's ref-safety check treats a same-named prop crossing
 * an actual COMPONENT boundary as a suspect ref access even though this one
 * is not - see the identical `dockHotspot`/`hotspotRef` shape that passes
 * clean one function up, inlined into `ChatLowerDock`'s own render instead of
 * split into child components. Calling these as ordinary functions (not JSX)
 * keeps everything in the one component the compiler already trusts.
 */
function dockRows(props: {
  readonly rows: ReadonlyArray<DockRowPlan>;
  readonly separatedBefore: boolean;
  /** `null` in the sample scene, where every row is a sample leaf. */
  readonly dock: LiveChatLowerDockProps | null;
}): ReactNode {
  let separated = props.separatedBefore;
  const nodes: ReactNode[] = [];
  for (const row of props.rows) {
    if (row.showSample) {
      nodes.push(
        dockSampleRow({
          key: row.section,
          section: row.section,
          hotspotRef: row.hotspot.hotspotRef,
          separated,
        }),
      );
      separated = true;
      continue;
    }
    if (!row.showRow || props.dock === null) continue;
    nodes.push(
      dockRow({
        key: row.section,
        section: row.section,
        editing: row.hotspot.editing,
        hotspotRef: row.hotspot.hotspotRef,
        separated,
        dock: props.dock,
      }),
    );
    separated = true;
  }
  return nodes;
}

/**
 * The region's real leaf, drawn from sample data because this chat has none
 * (L-16). `data-sample` is what the decoration CSS keys the "Sample" mark off,
 * and the node is the region's own, so it hovers, names and drags exactly as a
 * row with live content in it does.
 */
function dockSampleRow(props: {
  readonly key: string;
  readonly section: ChatDockSection;
  readonly hotspotRef: (node: HTMLElement | null) => void;
  readonly separated: boolean;
}): ReactNode {
  return (
    <div
      key={props.key}
      ref={props.hotspotRef}
      data-sample=""
      data-testid="chat-dock-sample-row"
      className={cn(
        "relative min-w-0",
        props.separated && "border-t border-border/50",
      )}
    >
      <SampleChip />
      <SampleDockRow section={props.section} />
    </div>
  );
}

function dockRow(props: {
  readonly key: string;
  readonly section: ChatDockSection;
  readonly editing: boolean;
  readonly hotspotRef: (node: HTMLElement | null) => void;
  readonly separated: boolean;
  readonly dock: LiveChatLowerDockProps;
}): ReactNode {
  const { dock } = props;
  if (props.section === "filesChanged") {
    return (
      <span
        key={props.key}
        className={cn(props.editing ? "block min-w-0" : "contents")}
        ref={props.hotspotRef}
      >
        <ChatAccumulatedChangesPanel
          restore={dock.restore}
          separated={props.separated}
          scrollRegionMaxHeightClass={dock.scrollRegionMaxHeightClass}
        />
      </span>
    );
  }
  if (props.section === "activeAgents") {
    if (dock.selfAgent === null) return null;
    return (
      <span
        key={props.key}
        className={cn(props.editing ? "block min-w-0" : "contents")}
        ref={props.hotspotRef}
      >
        <ActiveAgentsPanel
          epicId={dock.epicId}
          viewTabId={dock.viewTabId}
          self={dock.selfAgent}
          descendants={dock.activeAgents}
          scrollRegionMaxHeightClass={dock.scrollRegionMaxHeightClass}
          separated={props.separated}
        />
      </span>
    );
  }
  // An undefined `backgroundItems` is "the host has not said yet"; the
  // managed-command rows come from a different stream and need not wait on it.
  const items = dock.backgroundItems ?? [];
  return (
    <span
      key={props.key}
      className={cn(props.editing ? "block min-w-0" : "contents")}
      ref={props.hotspotRef}
    >
      <BackgroundItemsPanel
        items={items}
        epicId={dock.epicId}
        chatId={dock.chatId}
        viewTabId={dock.viewTabId}
        canAct={dock.canAct}
        readOnly={dock.readOnly}
        pendingStopTaskIds={dock.backgroundStopPendingTaskIds}
        stopAllPending={dock.backgroundStopAllPending}
        sessionStopPending={dock.backgroundSessionStopPending}
        turnActive={dock.activeTurnStatus !== null}
        scrollRegionMaxHeightClass={dock.scrollRegionMaxHeightClass}
        separated={props.separated}
        onItemClick={dock.onBackgroundItemClick}
        onStopItem={dock.onBackgroundItemStop}
        onStopAll={dock.onBackgroundItemsStopAll}
        onStopSession={dock.onBackgroundSessionStop}
      />
    </span>
  );
}

function QueueSection(props: {
  readonly visible: boolean;
  readonly dock: LiveChatLowerDockProps;
}) {
  if (!props.visible) return null;
  const { dock } = props;
  return (
    <QueuedMessagePanel
      queue={dock.queue}
      activeTurnStatus={dock.activeTurnStatus}
      canAct={dock.canAct}
      resumeRequested={dock.queueResumeRequested}
      keepPausedRequested={dock.queueKeepPausedRequested}
      readOnly={dock.readOnly}
      editingQueueItemId={dock.editingQueueItemId}
      scrollRegionMaxHeightClass={dock.scrollRegionMaxHeightClass}
      separated={false}
      onPause={dock.onQueuePause}
      onResume={dock.onQueueResume}
      onEdit={dock.onQueueEdit}
      onCancel={dock.onQueueCancel}
      onAbortSteer={dock.onQueueAbortSteer}
      onReorder={dock.onQueueReorder}
      onSteerNow={dock.onQueueSteerNow}
    />
  );
}
