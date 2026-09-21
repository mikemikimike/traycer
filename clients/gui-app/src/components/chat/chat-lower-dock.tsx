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
import type { ChatSessionState } from "@/stores/chats/chat-session-store";

import { ChatDockCompactStrip } from "@/components/chat/chat-dock-compact-strip";
import { useChatDockCompactStrip } from "@/components/chat/chat-dock-compact-context";
import { LAYOUT_CLUSTER_ATTRIBUTE } from "@/components/layout-editor/canvas/region-drag";
import { dockMemberMaterialised } from "@/components/chat/chat-dock-fold";
import { cn } from "@/lib/utils";
import type { ChatPinnedStackTopSpacing } from "@/components/chat/chat-pinned-stack";

/** One dock row's hotspot, registered by the tile regardless of which of the
 *  two anchors (the full row in the frame below, or the compact chip in the
 *  pill row above it) currently carries it. */
export interface DockRowHotspot {
  readonly hotspotRef: (node: HTMLElement | null) => void;
  /** The region's own Shown value - a hidden row draws neither row nor chip. */
  readonly shown: boolean;
  /** Whether this chat has live content for the row right now. */
  readonly hasContent: boolean;
  /** A hidden row materialising because the editor is pointing at it (L-14). */
  readonly ghost: boolean;
  /**
   * A layout session is live, so this row's own node has to BE a box.
   *
   * At rest the row wrapper is `display: contents` and the panel below it owns
   * the geometry; a `contents` box has no rect, so the hover outline and the
   * travelling ring would measure `0,0,0,0` (the same trap `drag-engine.ts`
   * refuses a `contents` clamp for, and C-06). This is more load-bearing under
   * L-87, not less: the sample workspace mounts these very rows, so the canvas
   * the editor opens is made of them.
   */
  readonly editing: boolean;
}

/**
 * The joined frame the full-size rows share (L-97).
 *
 * One frame tucked under the composer, not a stack of cards: `-mb-px` plus
 * `border-b-0` is what makes the dock and the input read as one surface, and
 * the panels inside it draw their own `border-t` separators.
 *
 * The fill is `bg-foreground/3`, not the `bg-muted/30` this frame used to
 * carry. gui-app's AGENTS.md bans a muted fill on a RAISED surface: every
 * preset's dark variant defines `--muted` identical to `--card`, so a bordered
 * box over `bg-canvas` painted with it is invisible in most of the eighteen
 * presets and only looks right in the default pair. An alpha of the foreground
 * is surface-independent by construction, and `/3` is the same tint
 * `composer-shell.tsx` paints the composer with - which is the whole point
 * here, since the frame's bottom edge IS the composer's top edge.
 *
 * `empty:hidden` because a chips-only chat keeps the dock alive (A.4.4) and a
 * bordered box with nothing in it is not a frame, it is a bug.
 */
const DOCK_FRAME_CLASS =
  "@container mx-3 -mb-px overflow-hidden rounded-t-lg border border-b-0 border-border bg-foreground/3 empty:hidden";

export interface ChatLowerDockProps {
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
   * Sections currently standing as a chip above the frame instead of as a row
   * inside it. Decided by the caller, which needs the same answer to size
   * everything below the dock.
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
  readonly showRow: boolean;
}

/**
 * Whether a row draws.
 *
 * Sample fill inside a real chat is gone with the in-place scene (L-87): the
 * sample workspace mounts these same panels against sample data (L-98), so
 * there is one code path and no stand-in leaves.
 */
function planDockRow(
  section: ChatDockSection,
  hotspot: DockRowHotspot,
  folded: ReadonlySet<ChatDockSection>,
): DockRowPlan {
  const unfolded =
    dockMemberMaterialised(hotspot.shown, hotspot.ghost) &&
    !folded.has(section);
  return { section, hotspot, showRow: unfolded && hotspot.hasContent };
}

export function ChatLowerDock(props: ChatLowerDockProps) {
  // The chips are dock members too, now that they stand above the composer
  // rather than inside its workspace row: a fully compact chat has no row at
  // all and must still draw them (A.4.4).
  const strip = useChatDockCompactStrip();
  const todoVisible = props.snapshotLoaded && props.todo !== null;
  const queueVisible = props.queue.items.length > 0;
  const rows = props.dockOrder.map((section) =>
    planDockRow(section, props.hotspots[section], props.folded),
  );
  const anyRowVisible = rows.some((row) => row.showRow);
  const anyChipVisible = strip !== null && strip.chips.length > 0;

  if (!todoVisible && !queueVisible && !anyRowVisible && !anyChipVisible) {
    return null;
  }

  const topPadding = props.topSpacing === "compact" ? "pt-2" : "pt-4";

  return (
    <div className="pointer-events-none px-4" data-testid="chat-lower-dock">
      <div
        className={cn(
          "pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-1.5 bg-canvas",
          topPadding,
        )}
      >
        {/* One stack, two clusters (A.5, L-97): the pill row loose at the
            composer's left edge, then the joined frame tucked under the input.
            The chips sit ABOVE the frame rather than between it and the
            composer, because anything between the two would have to break the
            `-mb-px` tuck that makes dock and composer one surface.

            They stay separate `data-layout-cluster` containers because a drag
            between them would have to change the member's Size as a side
            effect of a move, which is not what L-68..L-71 describe - so
            `normalizeArrangement`'s cross-cluster refusal keeps meaning what it
            says. */}
        <ChatDockCompactStrip />
        {/* The box the dock's rows are laid out in, which is what a canvas
            drag reorders inside (G3-01). */}
        <div
          {...{ [LAYOUT_CLUSTER_ATTRIBUTE]: "" }}
          className={DOCK_FRAME_CLASS}
        >
          <QueueSection visible={queueVisible} dock={props} />
          {todoVisible ? (
            <PinnedTodoPanel
              todo={props.todo}
              scrollRegionMaxHeightClass={props.scrollRegionMaxHeightClass}
              separated={queueVisible}
            />
          ) : null}
          {dockRows({
            rows,
            separatedBefore: queueVisible || todoVisible,
            dock: props,
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
  readonly dock: ChatLowerDockProps;
}): ReactNode {
  let separated = props.separatedBefore;
  const nodes: ReactNode[] = [];
  for (const row of props.rows) {
    if (!row.showRow) continue;
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

function dockRow(props: {
  readonly key: string;
  readonly section: ChatDockSection;
  readonly editing: boolean;
  readonly hotspotRef: (node: HTMLElement | null) => void;
  readonly separated: boolean;
  readonly dock: ChatLowerDockProps;
}): ReactNode {
  const { dock } = props;
  const wrapperClass = props.editing ? "block min-w-0" : "contents";
  if (props.section === "filesChanged") {
    return (
      <span key={props.key} className={wrapperClass} ref={props.hotspotRef}>
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
      <span key={props.key} className={wrapperClass} ref={props.hotspotRef}>
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
    <span key={props.key} className={wrapperClass} ref={props.hotspotRef}>
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
  readonly dock: ChatLowerDockProps;
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
