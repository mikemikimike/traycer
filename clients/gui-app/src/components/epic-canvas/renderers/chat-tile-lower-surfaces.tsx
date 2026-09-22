import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Lock } from "lucide-react";
import type {
  BackgroundItem,
  ChatActiveTurn,
  ChatApprovalState,
  ChatFileEditApprovalState,
  ChatQueuedItem,
  ChatQueuedPromptItem,
  ChatRunSettings,
} from "@traycer/protocol/host/agent/gui/subscribe";
import type {
  HeldManagedCommandUpdate,
  ManagedCommand,
  ManagedCommandStatus,
} from "@traycer/protocol/host/managed-command/unary-schemas";
import type { InterviewAnswer } from "@traycer/protocol/persistence/epic/schemas";
import type { ChatForkMode } from "@/components/chat/chat-message";
import {
  ChatComposer,
  type ChatComposerSideChatInput,
  type ChatComposerSubmitInput,
} from "@/components/chat/composer/chat-composer";
import { ChatComposerBannerPortalProvider } from "@/components/chat/composer/chat-composer-banner-portal";
import type { ChatProviderFallbackState } from "@/components/chat/fallback/fallback-state";
import {
  ChatLowerDock,
  type DockRowHotspot,
} from "@/components/chat/chat-lower-dock";
import { dockMemberFolded } from "@/components/chat/chat-dock-fold";
import {
  ChatDockCompactStripProvider,
  type ChatDockCompactChipModel,
  type ChatDockCompactStripValue,
} from "@/components/chat/chat-dock-compact-strip";
import {
  chatDockSection,
  type ChatDockSection,
} from "@/lib/chat/chat-dock-sections";
import { CHAT_DOCK_FAILURE_PULSE_PREFIX } from "@/components/chat/chat-dock-compact-chip";
import {
  useChatDockOpenSection,
  useChatDockOpenStore,
} from "@/stores/chats/chat-dock-open-store";
import {
  isReceivedAgentResponse,
  queueArrivalPulseToken,
} from "@/components/chat/chat-queue-utils";
import {
  type ChatLowerSurfaceTopSpacing,
  type ChatPinnedStackTopSpacing,
} from "@/components/chat/chat-pinned-stack";
import { chatChangesPanelHasContent } from "@/components/chat/chat-pinned-stack-utils";
import type { PinnedTodoSnapshot } from "@/components/chat/chat-pinned-todos";
import {
  useAgentStopControls,
  type AgentRow,
} from "@/hooks/agent/use-agent-stop-controls";
import { useAgentStop } from "@/hooks/agent/use-stop-agent-mutation";
import { useTabHostClient } from "@/hooks/host/use-tab-host-client";
import { StopChildrenDialog } from "@/components/chat/chat-stop-children-dialog";
import { ConfirmDestructiveDialog } from "@/components/ui/confirm-destructive-dialog";
import { useIsMobileViewport } from "@/hooks/ui/use-mobile-viewport";
import type { ChatStopConfirmationTarget } from "@/stores/chats/chat-turn-lifecycle";
import type { ChatRestoreContextValue } from "@/components/chat/chat-restore-context-core";
import { PendingInterviewCard } from "@/components/chat/segments/pending-interview/pending-interview-card";
import { useTabHostId } from "@/components/epic-canvas/hooks/use-tab-host-id";
import { UnanswerableInterviewNotice } from "@/components/chat/segments/pending-interview/unanswerable-interview-notice";
import { ComposerSlotApprovalQueue } from "@/components/chat/segments/composer-slot-approval-queue";
import { ComposerSlotFileEditApprovalQueue } from "@/components/chat/segments/composer-slot-file-edit-approval-queue";
import { ComposerReadonlyWorkspaceModeRow } from "@/components/home/composer/composer-workspace-mode-row";
import {
  chatBackgroundSectionVisible,
  lowerScrollRegionMaxHeightClass,
} from "@/lib/chat/chat-lower-scroll-budget";
import { accumulatedDiffTotals } from "@/lib/chat/accumulated-change-rows";
import type { DiffLineCounts } from "@/lib/file-change-diff-hunks";
import {
  backgroundHeaderSummary,
  backgroundRunningRowCount,
  dedupeByTaskId,
} from "@/lib/chat/background-item-tree";
import type { WorkspaceComposerAvailability } from "@/lib/composer/workspace-composer-availability";
import type { ChatSessionState } from "@/stores/chats/chat-session-store";
import { usePortForwardsForChat } from "@/stores/port-forwards/port-forwards-for-chat";
import {
  useHeldManagedCommandsForChat,
  useManagedCommandsForChat,
  useRunningManagedCommandsForChat,
} from "@/stores/managed-commands/managed-commands-for-chat";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import { useArrangementValue, useRegionValues } from "@/lib/layout-overrides";
import { cn } from "@/lib/utils";
import type {
  PendingInterviewView,
  UnanswerableInterviewView,
} from "./chat-tile-types";
import {
  composerHasBlockingApprovals,
  visibleComposerApprovals,
} from "./chat-approval-visibility";

type ComposerSlotBottomSpacing = "normal" | "none";

export interface ChatLowerInteractionSurfacesProps {
  readonly epicId: string;
  readonly viewTabId: string;
  readonly chatId: string;
  /**
   * The tile's bound host, made explicit for chat-session state lookups.
   * Must match the surrounding TabHostProvider used for stop requests.
   */
  readonly hostId: string;
  readonly runtime: ChatLowerRuntimeState;
  readonly access: ChatLowerAccessState;
  readonly turn: ChatLowerTurnState;
  readonly interview: ChatLowerInterviewState;
  readonly approvals: ChatLowerApprovalsState;
  readonly queue: ChatLowerQueueState;
  readonly composer: ChatLowerComposerState;
  readonly todo: PinnedTodoSnapshot | null;
  readonly restoreContext: ChatRestoreContextValue;
  /**
   * The chat's provider-fallback state, straight off the frame.
   *
   * It reaches two places from here and only two: the retry row that sits above
   * the dock, and the composer's banner slot (the grace card and the
   * switch-back offer). Threaded as one group rather than two props because
   * both fields travel the same hops and appear and vanish together.
   */
  readonly providerFallback: ChatProviderFallbackState;
  readonly backgroundItems: ReadonlyArray<BackgroundItem> | undefined;
  readonly backgroundStopPendingTaskIds: ReadonlySet<string>;
  readonly backgroundStopAllPending: boolean;
  readonly backgroundSessionStopPending: boolean;
  readonly onBackgroundItemClick: (item: BackgroundItem) => void;
}

export interface ChatLowerRuntimeState {
  readonly snapshotLoaded: boolean;
}

export interface ChatLowerAccessState {
  readonly isViewer: boolean;
  readonly canAct: boolean;
  /**
   * Why this surface cannot be typed into, when the reason is not the ordinary
   * one. Null means the ordinary one - a viewer's permission - and the notice
   * says so itself.
   *
   * A reason rather than a second boolean because the states are not
   * alternatives to each other: "you may only watch this chat" and "this chat
   * lives on a machine that is asleep, and you are reading its last backup"
   * are both read-only, and telling a user the first when the second is true
   * sends them looking for a permission to ask for.
   */
  readonly readOnlyNotice: string | null;
}

/**
 * Why the composer's send is blocked, for the send button's tooltip. `canAct`
 * folds role and connection: a viewer can never act; a non-viewer with
 * `canAct === false` means the chat stream is not open (host reconnecting
 * after a drop / renderer resume).
 */
function chatSendDisabledHint(access: ChatLowerAccessState): string | null {
  if (access.canAct) return null;
  if (access.readOnlyNotice !== null) return access.readOnlyNotice;
  if (access.isViewer) return "You have view-only access to this chat";
  return "Reconnecting to the host — sending is paused";
}

export interface ChatLowerTurnState {
  readonly activeTurnStatus: ChatActiveTurn["status"] | null;
  /** Host-projected same-turn steering capability of the running turn's harness. */
  readonly steerCapable: boolean;
  /**
   * Whether the tab's negotiated `chat.subscribe` version understands
   * `after_safe_point` (host handshake minor >= 5). Gates whether `Mod-Enter`
   * can steer at all, keeping a new renderer from steering a <=1.4 host.
   */
  readonly steerProtocolSupported: boolean;
  /**
   * Whether that same negotiated line can carry `permissionMode: "auto"`
   * (`@1.12`), or `null` while the session cannot say. A sibling of
   * `steerProtocolSupported` in every respect - same line, same per-session
   * scope - and it gates whether the toolbar may OFFER Auto at all.
   */
  readonly autoPermissionModeProtocolSupported: boolean | null;
  /** Own live stream's draft-blob bridge capability. */
  readonly getDraftBlobBridgeSupported: () => boolean;
  /** Reads the live active turn at submit time for the Cmd+Enter drift check. */
  readonly getActiveTurnForSteer: () => ChatActiveTurn | null;
  /** Reads the live turn lifecycle, including ID-less activation boundaries. */
  readonly getStopConfirmationTarget: () => ChatStopConfirmationTarget;
  readonly stopDisabled: boolean;
  readonly onStopTurn: () => string | null;
}

export interface ChatLowerInterviewState {
  readonly pending: PendingInterviewView | null;
  // True while an answer/skip for the pending block is in flight or accepted
  // but unresolved (derived from the chat session's pending/accepted actions).
  // Gates the card so the same action cannot be double-sent.
  readonly isBusy: boolean;
  // Host-pending interviews with no answerable card in this transcript. Non-
  // empty means the chat is send-locked with nothing to answer, so the escape-
  // hatch notice renders above whatever else occupies the composer slot.
  readonly unanswerable: ReadonlyArray<UnanswerableInterviewView>;
  // True while a dismissal for any `unanswerable` block is in flight.
  readonly unanswerableBusy: boolean;
  readonly onAnswer: (
    blockId: string,
    answers: ReadonlyArray<InterviewAnswer>,
  ) => string | null;
  readonly onSkip: (
    blockId: string,
    reason: string,
    draftAnswers: ReadonlyArray<InterviewAnswer> | undefined,
  ) => string | null;
  // Branch the chat at the pending question (see ChatForkMode). null when the
  // pending interview has no stable fork boundary.
  readonly onFork: ((mode: ChatForkMode) => void) | null;
  /** External jump targeting the pending composer card, or null when none. */
  readonly highlightedBlockId: string | null;
  /** Advances on each jump so a repeat to the same card restarts the pulse. */
  readonly highlightedGeneration?: number;
}

export interface ChatLowerApprovalsState {
  readonly pendingFileEditApprovals: ReadonlyArray<ChatFileEditApprovalState>;
  readonly pendingApprovals: ReadonlyArray<ChatApprovalState>;
  readonly onFileEditDecision: (approvalId: string, approved: boolean) => void;
  readonly onApprovalDecision: (approvalId: string, approved: boolean) => void;
  /** External jump targeting a pending composer approval row, or null. */
  readonly highlightedApprovalId: string | null;
  /** Advances on each jump so a repeat to the same row restarts the pulse. */
  readonly highlightedGeneration?: number;
}

export interface ChatLowerQueueState {
  readonly editingItem: ChatQueuedPromptItem | null;
  readonly editingItemId: string | null;
  readonly value: ChatSessionState["queue"];
  readonly resumeRequested: boolean;
  readonly keepPausedRequested: boolean;
  readonly onPause: () => string | null;
  readonly onResume: () => string | null;
  readonly onEdit: (item: ChatQueuedPromptItem) => void;
  readonly onCancel: (item: ChatQueuedItem) => void;
  readonly onAbortSteer: (item: ChatQueuedPromptItem) => void;
  readonly onCancelEdit: () => void;
  readonly onStopBackgroundItem: (taskId: string) => string | null;
  readonly onStopAllBackgroundItems: () => string | null;
  readonly onStopBackgroundSession: () => string | null;
  readonly onReorder: (
    item: ChatQueuedItem,
    beforeQueueItemId: string | null,
  ) => void;
  readonly onSteerNow: (item: ChatQueuedPromptItem) => void;
}

export interface ChatLowerComposerState {
  readonly sessionSettingsSeed: ChatRunSettings | null;
  readonly fallbackSettingsSeed: ChatRunSettings | null;
  readonly nodeId: string;
  readonly isActive: boolean;
  readonly mentionRoots: ReadonlyArray<string>;
  readonly fallbackToGlobalMentionRoots: boolean;
  readonly currentEpicId: string;
  readonly onSubmitMessage: (input: ChatComposerSubmitInput) => boolean;
  /** `/btw` / `/side`: fork this chat and ask there (`startSideChat`). */
  readonly onSideChat: (input: ChatComposerSideChatInput) => boolean;
  readonly onSettingsChange: ((settings: ChatRunSettings) => void) | null;
  /** The Location / Mode+branch / Environment chip cluster (+ context usage). */
  readonly workspaceControls: ReactNode;
  readonly workspaceAvailability: WorkspaceComposerAvailability;
}

interface ComposerSurfaceModel {
  /**
   * The view tab this composer is rendered in. Reaches the composer only for
   * the provider re-auth banner's terminal sign-in: the host creates the PTY
   * and the banner has to open THAT session as a tile in ITS OWN view. In a
   * split view each pane renders its own banner, so a banner that used the
   * app-wide active view would open the terminal in the other pane.
   */
  readonly viewTabId: string;
  readonly runtime: ChatLowerRuntimeState;
  readonly access: ChatLowerAccessState;
  readonly turn: ChatLowerTurnState;
  readonly interview: ChatLowerInterviewState;
  readonly approvals: ChatLowerApprovalsState;
  readonly queue: ChatLowerQueueState;
  readonly composer: ChatLowerComposerState;
  readonly providerFallback: ChatProviderFallbackState;
  readonly pendingApprovalCount: number;
  readonly hasPendingApprovals: boolean;
}

interface ComposerSurfaceLayout {
  readonly topSpacing: ChatLowerSurfaceTopSpacing;
  readonly slotBottomSpacing: ComposerSlotBottomSpacing;
}

/**
 * The chat composer's bottom strip: where this chat runs, then how much
 * context is left.
 *
 * The compact chips used to close the left cell, hard against the
 * context-usage cluster. They live above the composer now (A12, L-97), which
 * is where the artifact draws them and where they are adjacent to the rows
 * they open - so this row is back to the two leaves it names.
 */
export function ChatDockWorkspaceControls(props: {
  /** The host + workspace picker cluster, first and left-aligned. */
  readonly hostWorkspaceSelector: ReactNode;
  /** The context-usage leaf, which owns the row's trailing cell. */
  readonly usageChip: ReactNode;
}): ReactNode {
  return (
    <>
      {/* No passive marker on this cell: the host / workspace label marks its
          own root instead - see `host-workspace-selector.tsx`. */}
      <div className="flex min-w-0 items-center gap-2 overflow-hidden">
        {props.hostWorkspaceSelector}
      </div>
      {props.usageChip}
    </>
  );
}

export function ChatLowerInteractionSurfaces(
  props: ChatLowerInteractionSurfacesProps,
) {
  const stopControls = useAgentStopControls({
    epicId: props.epicId,
    rootAgentId: props.chatId,
  });
  const activeAgents = stopControls.descendants;
  const tabHostClient = useTabHostClient();
  const agentStop = useAgentStop(tabHostClient);
  const [stopConfirmation, setStopConfirmation] = useState<{
    readonly kind: "turn" | "children";
    readonly target: ChatStopConfirmationTarget;
    readonly readTarget: () => ChatStopConfirmationTarget;
  } | null>(null);
  // The SAME signal that puts Stop beside Send (`composer-send-button`), so
  // the confirmation exists exactly where the mis-tap does and desktop is
  // untouched by construction rather than by a second rule agreeing with the
  // first.
  const phoneLayout = useIsMobileViewport();

  // Destructure the turn prop for stable use in callbacks
  const turnOnStopTurn = props.turn.onStopTurn;
  const turnActiveTurnStatus = props.turn.activeTurnStatus;
  const turnStopDisabled = props.turn.stopDisabled;
  const turnSteerCapable = props.turn.steerCapable;
  const turnSteerProtocolSupported = props.turn.steerProtocolSupported;
  const turnAutoPermissionModeProtocolSupported =
    props.turn.autoPermissionModeProtocolSupported;
  const turnGetDraftBlobBridgeSupported =
    props.turn.getDraftBlobBridgeSupported;
  const turnGetActiveTurnForSteer = props.turn.getActiveTurnForSteer;
  const turnGetStopConfirmationTarget = props.turn.getStopConfirmationTarget;

  // Read the store at confirmation time: a queued turn can start before React
  // renders again. Neither dialog may redirect the original Stop to that turn.
  const isConfirmedTurnCurrent = (): boolean => {
    if (
      stopConfirmation === null ||
      stopConfirmation.readTarget !== turnGetStopConfirmationTarget
    ) {
      return false;
    }
    const current = turnGetStopConfirmationTarget();
    return (
      current.turnId === stopConfirmation.target.turnId &&
      current.revision === stopConfirmation.target.revision &&
      current.connectionEpoch === stopConfirmation.target.connectionEpoch
    );
  };

  // Intercept the composer Stop button: when this chat has active
  // sub-agents, raise the cascade prompt instead of stopping only its turn.
  // The button ignores the return value, so `null` here is just "handled".
  const requestStopTurn = useCallback((): string | null => {
    if (activeAgents.length > 0 || phoneLayout) {
      // The lifecycle revision distinguishes separate activations even when
      // both have a null turn ID. Keep it through the child-agent handoff too.
      setStopConfirmation({
        kind: activeAgents.length > 0 ? "children" : "turn",
        target: turnGetStopConfirmationTarget(),
        readTarget: turnGetStopConfirmationTarget,
      });
      return null;
    }
    return turnOnStopTurn();
  }, [
    activeAgents.length,
    phoneLayout,
    turnGetStopConfirmationTarget,
    turnOnStopTurn,
  ]);

  const turnWithCascade = useMemo(
    () => ({
      activeTurnStatus: turnActiveTurnStatus,
      steerCapable: turnSteerCapable,
      steerProtocolSupported: turnSteerProtocolSupported,
      autoPermissionModeProtocolSupported:
        turnAutoPermissionModeProtocolSupported,
      getDraftBlobBridgeSupported: turnGetDraftBlobBridgeSupported,
      getActiveTurnForSteer: turnGetActiveTurnForSteer,
      getStopConfirmationTarget: turnGetStopConfirmationTarget,
      stopDisabled: turnStopDisabled,
      onStopTurn: requestStopTurn,
    }),
    [
      turnActiveTurnStatus,
      turnSteerCapable,
      turnSteerProtocolSupported,
      turnAutoPermissionModeProtocolSupported,
      turnGetDraftBlobBridgeSupported,
      turnGetActiveTurnForSteer,
      turnGetStopConfirmationTarget,
      turnStopDisabled,
      requestStopTurn,
    ],
  );

  // Memoize on the underlying approvals array: `visibleComposerApprovals`
  // returns a fresh array every call (`.filter`), so without this the derived
  // `composerModel` memo would get a new dependency identity each render and
  // re-render the composer on every streaming token. Render-count proof:
  // chat-tile-composer-rerender.test.tsx.
  const visiblePendingApprovals = useMemo(
    () => visibleComposerApprovals(props.approvals.pendingApprovals),
    [props.approvals.pendingApprovals],
  );
  const pendingApprovalCount =
    props.approvals.pendingFileEditApprovals.length +
    visiblePendingApprovals.length;
  const hasPendingApprovals = composerHasBlockingApprovals(
    props.approvals.pendingApprovals,
    props.approvals.pendingFileEditApprovals.length,
  );
  // Read here rather than inside the dock: the same counts decide the dock's
  // Background section and the spacing of everything below it. Scoped to the
  // tile's bound host - that is the host the tile opened the session under,
  // and a same-id chat on another machine is a different agent.
  const runningManagedCommands = useRunningManagedCommandsForChat({
    epicId: props.epicId,
    chatId: props.chatId,
    hostId: props.hostId,
  });
  const runningManagedCommandCount = runningManagedCommands.length;
  // A second read rather than a bigger first one: the sets overlap, so this is
  // not a partition, and only the union decides whether the section exists. A
  // hold that only a human can clear belongs to a shell that has FINISHED, so a
  // chat holding output while running nothing - the case Deliver exists for -
  // has a running count of zero and must open the section on this alone.
  const heldManagedCommands = useHeldManagedCommandsForChat({
    epicId: props.epicId,
    chatId: props.chatId,
    hostId: props.hostId,
  });
  const heldManagedCommandCount = heldManagedCommands.length;
  // A third read of the same slice, for the one thing the running list cannot
  // say: a shell that is no longer running because it FAILED. The Background
  // pill's ring is the section's only channel while its row is folded away,
  // and a failure is the one arrival on that strip that is not simply news, so
  // it radiates the destructive tone instead of the primary one.
  const managedCommands = useManagedCommandsForChat(
    props.epicId,
    props.chatId,
    props.hostId,
  );
  const backgroundFailureToken = useMemo(
    () => failedManagedCommandPulseToken(managedCommands),
    [managedCommands],
  );
  // A forward outlives the turn that made it, so an otherwise idle chat can
  // still hold one; it opens the section on its own, like a hold does.
  const portForwards = usePortForwardsForChat({
    epicId: props.epicId,
    chatId: props.chatId,
    hostId: props.hostId,
  });
  const portForwardCount = portForwards.length;
  const backgroundVisible = chatBackgroundSectionVisible({
    backgroundItemCount: props.backgroundItems?.length ?? 0,
    runningManagedCommandCount,
    heldManagedCommandCount,
    portForwardCount,
  });
  const activeAgentsVisible =
    stopControls.self !== null && activeAgents.length > 0;
  const chrome = useChatDockChrome({
    snapshotLoaded: props.runtime.snapshotLoaded,
    chatId: props.chatId,
    restore: props.restoreContext,
    selfAgent: stopControls.self,
    activeAgents,
    activeAgentsVisible,
    backgroundVisible,
    backgroundItems: props.backgroundItems,
    runningManagedCommands,
    heldManagedCommands,
    backgroundFailureToken,
    portForwardCount,
    queue: props.queue.value,
    todo: props.todo,
  });
  // What each dock member DRAWS below the transcript: its full row inside the
  // frame, or the one attached panel its open pill put there (L-142). The
  // scroll budget and the composer's top spacing both ask this, and a pill
  // panel is a scroll region exactly as a row is.
  const drawsInDock = (
    section: ChatDockSection,
    hasContent: boolean,
  ): boolean =>
    (hasContent && !chrome.folded.has(section)) ||
    chrome.openSection === section;
  const todoVisible = props.runtime.snapshotLoaded && props.todo !== null;
  const dockTodoVisible = drawsInDock("todo", todoVisible);
  const dockFilesChangedVisible = drawsInDock(
    "filesChanged",
    chrome.hotspots.filesChanged.hasContent,
  );
  // Kept as one boolean (rather than two) for the scroll-budget calc below,
  // which has always treated Todo and Files changed as a single pressure
  // unit - unchanged now that Files changed can render apart from Todo.
  const pinnedStackVisible = dockTodoVisible || dockFilesChangedVisible;
  // Show the queue surface whenever it holds anything - user-typed sends and
  // received A2A responses alike (the latter render read-only). Received rows
  // follow the Active agents mode, so a folded pill takes them with it and this
  // reads the queue the dock will actually be handed.
  const queueVisible = drawsInDock("queue", chrome.dockQueue.items.length > 0);
  const dockAgentsVisible = drawsInDock("activeAgents", activeAgentsVisible);
  const dockBackgroundVisible = drawsInDock("background", backgroundVisible);
  const approvalVisible = approvalSurfaceVisible(
    props.runtime.snapshotLoaded,
    props.access.isViewer,
    pendingApprovalCount,
  );
  const scrollRegionMaxHeightClass = lowerScrollRegionMaxHeightClass({
    pinnedStackVisible,
    queueVisible,
    backgroundVisible: dockBackgroundVisible,
    activeAgentsVisible: dockAgentsVisible,
    approvalVisible,
  });
  const lowerSurfaceTopSpacing: ChatLowerSurfaceTopSpacing =
    pinnedStackVisible ||
    queueVisible ||
    dockAgentsVisible ||
    dockBackgroundVisible
      ? "connected"
      : "normal";
  const pinnedStackTopSpacing: ChatPinnedStackTopSpacing = approvalVisible
    ? "compact"
    : "normal";

  // Memoize layout props since they depend on visibility flags that only change
  // when content appears/disappears, not per token
  const approvalLayout = useMemo(
    () => ({
      topSpacing: "normal" as const,
      slotBottomSpacing:
        pinnedStackVisible || queueVisible
          ? ("none" as const)
          : ("normal" as const),
    }),
    [pinnedStackVisible, queueVisible],
  );

  const composerLayout = useMemo(
    () => ({
      topSpacing: lowerSurfaceTopSpacing,
      slotBottomSpacing: "normal" as const,
    }),
    [lowerSurfaceTopSpacing],
  );

  const composerModel = useMemo(
    () => ({
      viewTabId: props.viewTabId,
      runtime: props.runtime,
      access: props.access,
      turn: turnWithCascade,
      interview: props.interview,
      approvals: {
        ...props.approvals,
        pendingApprovals: visiblePendingApprovals,
      },
      queue: props.queue,
      composer: props.composer,
      providerFallback: props.providerFallback,
      pendingApprovalCount,
      hasPendingApprovals,
    }),
    [
      props.viewTabId,
      props.runtime,
      props.access,
      turnWithCascade,
      props.interview,
      props.approvals,
      visiblePendingApprovals,
      props.queue,
      props.composer,
      props.providerFallback,
      pendingApprovalCount,
      hasPendingApprovals,
    ],
  );

  return (
    <ChatComposerBannerPortalProvider>
      <ChatDockCompactStripProvider value={chrome.strip}>
        <RuntimeGatedApprovalSurface
          model={composerModel}
          layout={approvalLayout}
        />
        <ChatLowerDock
          snapshotLoaded={props.runtime.snapshotLoaded}
          epicId={props.epicId}
          chatId={props.chatId}
          viewTabId={props.viewTabId}
          selfAgent={stopControls.self}
          activeAgents={activeAgents}
          todo={props.todo}
          restore={props.restoreContext}
          queue={chrome.dockQueue}
          folded={chrome.folded}
          dockOrder={chrome.dockOrder}
          hotspots={chrome.hotspots}
          backgroundItems={props.backgroundItems}
          runningManagedCommandCount={runningManagedCommandCount}
          heldManagedCommandCount={heldManagedCommandCount}
          portForwardCount={portForwardCount}
          backgroundStopPendingTaskIds={props.backgroundStopPendingTaskIds}
          backgroundStopAllPending={props.backgroundStopAllPending}
          backgroundSessionStopPending={props.backgroundSessionStopPending}
          activeTurnStatus={props.turn.activeTurnStatus}
          canAct={props.access.canAct}
          queueResumeRequested={props.queue.resumeRequested}
          queueKeepPausedRequested={props.queue.keepPausedRequested}
          readOnly={props.access.isViewer}
          editingQueueItemId={props.queue.editingItemId}
          topSpacing={pinnedStackTopSpacing}
          scrollRegionMaxHeightClass={scrollRegionMaxHeightClass}
          onQueuePause={props.queue.onPause}
          onQueueResume={props.queue.onResume}
          onQueueEdit={props.queue.onEdit}
          onQueueCancel={props.queue.onCancel}
          onQueueAbortSteer={props.queue.onAbortSteer}
          onQueueReorder={props.queue.onReorder}
          onQueueSteerNow={props.queue.onSteerNow}
          onBackgroundItemClick={props.onBackgroundItemClick}
          onBackgroundItemStop={props.queue.onStopBackgroundItem}
          onBackgroundItemsStopAll={props.queue.onStopAllBackgroundItems}
          onBackgroundSessionStop={props.queue.onStopBackgroundSession}
        />
        <ChatComposerRegion model={composerModel} layout={composerLayout} />
        <StopChildrenDialog
          open={stopConfirmation?.kind === "children"}
          onOpenChange={(open) => {
            if (!open) setStopConfirmation(null);
          }}
          agents={activeAgents}
          onStopAll={() => {
            setStopConfirmation(null);
            if (!isConfirmedTurnCurrent()) return;
            agentStop.mutate({
              epicId: props.epicId,
              agentId: props.chatId,
              cascade: true,
            });
          }}
          onStopOnlyThis={() => {
            setStopConfirmation(null);
            if (!isConfirmedTurnCurrent()) return;
            turnOnStopTurn();
          }}
        />
        <ConfirmDestructiveDialog
          open={stopConfirmation?.kind === "turn"}
          onOpenChange={(open) => {
            if (!open) setStopConfirmation(null);
          }}
          title="Stop this turn?"
          description="The agent will stop working on its current response."
          cascadeSummary={null}
          actionLabel="Stop"
          blockedReason={null}
          isPending={false}
          onConfirm={() => {
            setStopConfirmation(null);
            if (stopConfirmation === null || !isConfirmedTurnCurrent()) return;
            // A sub-agent can start while this dialog is open. Go back through
            // the same gate, retaining the turn this confirmation belongs to.
            if (activeAgents.length > 0) {
              setStopConfirmation({ ...stopConfirmation, kind: "children" });
              return;
            }
            turnOnStopTurn();
          }}
        />
      </ChatDockCompactStripProvider>
    </ChatComposerBannerPortalProvider>
  );
}

interface ChatDockChrome {
  /** Sections standing as a pill right now, for the dock and for the spacing. */
  readonly folded: ReadonlySet<ChatDockSection>;
  /** The one pill whose panel is attached above the composer, or `null`. */
  readonly openSection: ChatDockSection | null;
  /** The queue as the dock should render it - see `foldedQueue`. */
  readonly dockQueue: ChatSessionState["queue"];
  readonly strip: ChatDockCompactStripValue;
  /** The vertical order of the three reorderable dock rows. */
  readonly dockOrder: ReadonlyArray<ChatDockSection>;
  /** This tile's layout region for each of the three reorderable rows. */
  readonly hotspots: Readonly<Record<ChatDockSection, DockRowHotspot>>;
}

interface ChatDockChromeInput {
  readonly snapshotLoaded: boolean;
  readonly chatId: string;
  readonly restore: ChatRestoreContextValue;
  readonly selfAgent: AgentRow | null;
  readonly activeAgents: ReadonlyArray<AgentRow>;
  readonly activeAgentsVisible: boolean;
  readonly backgroundVisible: boolean;
  readonly backgroundItems: ReadonlyArray<BackgroundItem> | undefined;
  readonly runningManagedCommands: ReadonlyArray<ManagedCommand>;
  readonly heldManagedCommands: ReadonlyArray<HeldManagedCommandUpdate>;
  /**
   * The Background pill's failure-flavoured pulse token, or `null` when the
   * section's most recent news is not a failure.
   */
  readonly backgroundFailureToken: string | null;
  readonly portForwardCount: number;
  readonly queue: ChatSessionState["queue"];
  readonly todo: PinnedTodoSnapshot | null;
}

const NO_BACKGROUND_ITEMS: ReadonlyArray<BackgroundItem> = [];

/**
 * The Background pill's pulse token while the last thing to have happened in
 * the section is a shell that FAILED, else `null`.
 *
 * "Last thing to have happened" rather than "anything ever failed", because
 * the token is what the pill is standing in for RIGHT NOW: a live shell
 * outranks any finished one, and a failure the user has already seen must not
 * hold the ring red over work that started since. Keyed on the failed
 * command's id so a second failure is a second token and rings again, and a
 * re-render of the same one does not.
 */
function failedManagedCommandPulseToken(
  commands: ReadonlyArray<ManagedCommand>,
): string | null {
  let latest: ManagedCommand | null = null;
  for (const command of commands) {
    if (command.status.state === "running") return null;
    if (latest === null || command.updatedAtMs > latest.updatedAtMs) {
      latest = command;
    }
  }
  if (latest === null || !managedCommandFailed(latest.status)) return null;
  return `${CHAT_DOCK_FAILURE_PULSE_PREFIX}${latest.id}`;
}

/**
 * A shell that ended badly. `stopped` is the user's own doing and never one;
 * `interrupted` is the host dying under a running command; an exit is a
 * failure unless it is a clean zero, which covers the killed-by-signal case
 * and the lost-process case (`exitCode` and `signal` both null) together.
 */
function managedCommandFailed(status: ManagedCommandStatus): boolean {
  switch (status.state) {
    case "running":
    case "stopped":
      return false;
    case "interrupted":
      return true;
    case "exited":
      return status.exitCode !== 0 || status.signal !== null;
  }
}

/**
 * Which dock rows are folded into a chip, what those chips say, and how the
 * user gets a row back.
 *
 * Expansion is component state, so it dies with the tile and is never written
 * to the setting: `compact` is a statement about how a chat OPENS, and having
 * one glance at a row silently redefine that for every chat is the failure a
 * per-tile reveal exists to avoid.
 */
function useChatDockChrome(input: ChatDockChromeInput): ChatDockChrome {
  const dockRegionOrder = useArrangementValue("dock");
  const changedFilesValues = useRegionValues("changedFiles");
  const runningAgentsValues = useRegionValues("runningAgents");
  const backgroundValues = useRegionValues("background");
  const queueValues = useRegionValues("queue");
  const todoValues = useRegionValues("todo");
  const dockOrder = useMemo(
    () => dockRegionOrder.map(chatDockSection),
    [dockRegionOrder],
  );
  // Which pill this CHAT has open, remembered outside the React tree: a
  // same-pane chat switch is a full remount, and losing the open panel to one
  // is not what "I opened Files changed in this conversation" means. Nothing
  // ever opens on its own - a chat with no entry has no panel attached.
  const storedOpenSection = useChatDockOpenSection(input.chatId);
  const toggleOpenSection = useChatDockOpenStore(
    (state) => state.toggleSection,
  );
  const closeOpenSection = useChatDockOpenStore((state) => state.closeSection);
  const chatId = input.chatId;
  const onToggle = useCallback(
    (section: ChatDockSection) => {
      toggleOpenSection(chatId, section);
    },
    [toggleOpenSection, chatId],
  );
  // One id per dock, for the open pill's `aria-controls` and the panel it
  // names. `useId` because two chat tiles can be on screen at once.
  const panelId = useId();

  const changesPresent =
    input.snapshotLoaded && chatChangesPanelHasContent(input.restore);
  const receivedAgentCount = input.queue.items.filter(
    isReceivedAgentResponse,
  ).length;
  // The row's own content gate (self + descendants), not the chip's broader
  // one: a received-only queue item with no descendants keeps the chip alive
  // (see `agentsChip` below) but the panel this hotspot anchors has nothing of
  // its own to draw.
  const activeAgentsHasContent = input.activeAgentsVisible;
  // This tile's three dock regions, registered here because this is the
  // component that DRAWS them. There is exactly one gate deciding whether a
  // mounted component's region reaches the editor, and it is inside
  // `useLayoutRegion`: it registers nothing from a surface whose
  // `PaneVisibilityContext` is false. Every epic surface publishes that from
  // its own top-level visibility (`epic-surface.tsx`,
  // `hosted-chat-surface-context-bridge.tsx`), and the sample workspace is a
  // plain top-level tab that is `splitEligibility: "ineligible"`, so while a
  // session is live the sample tab is the only visible surface and a real tile
  // registers nothing. That is the gate's job, not this file's: a per-site
  // opt-out here would be a second answer to the same question, and the six
  // other composer regions on this very tile (`mic`, `agent`, `access`,
  // `model`, `attachImage`, `contextUsage`) have never had one.
  const filesChangedHotspot = useLayoutRegion({
    regionId: "changedFiles",
    instanceId: input.chatId,
  });
  const activeAgentsHotspot = useLayoutRegion({
    regionId: "runningAgents",
    instanceId: input.chatId,
  });
  const backgroundHotspot = useLayoutRegion({
    regionId: "background",
    instanceId: input.chatId,
  });
  const queueHotspot = useLayoutRegion({
    regionId: "queue",
    instanceId: input.chatId,
  });
  const todoHotspot = useLayoutRegion({
    regionId: "todo",
    instanceId: input.chatId,
  });
  // The root agent counts as running too when it is itself active, exactly as
  // `ActiveAgentsPanel`'s own header counts it.
  const agentsRunningCount =
    input.selfAgent === null
      ? 0
      : input.activeAgents.length +
        (input.selfAgent.activity === false ? 0 : 1);
  // Gated on `selfAgent` exactly as the count is, so the three never disagree:
  // with no self record the count is 0, the panel declines to render at all,
  // and a chip surviving on received A2A rows alone must not spin or name
  // agents over that zero.
  //
  // Mid-turn is the only tier that lights the chip. An agent kept alive by
  // background work alone is counted, but nothing is being written on its
  // behalf right now, and the sidebar's own row draws that tier at rest too.
  const agentsWorking =
    input.selfAgent !== null &&
    (input.selfAgent.activity === "turn" ||
      input.activeAgents.some((agent) => agent.activity === "turn"));
  const selfAgent = input.selfAgent;
  const agentsRoster = useMemo(
    () =>
      selfAgent === null
        ? null
        : agentRoster([selfAgent, ...input.activeAgents]),
    [selfAgent, input.activeAgents],
  );
  const backgroundItems = input.backgroundItems ?? NO_BACKGROUND_ITEMS;
  // Counted on the deduped list, exactly as `BackgroundItemsPanel` counts its
  // own header: a transient duplicate `taskId` renders one row there, so
  // counting the raw list here would make the chip say "2 waiting" against the
  // panel's "1 waiting".
  const dedupedBackgroundItems = useMemo(
    () => dedupeByTaskId(backgroundItems),
    [backgroundItems],
  );
  const backgroundRunning = useMemo(
    () =>
      backgroundRunningRowCount({
        items: dedupedBackgroundItems,
        runningManagedCommandIds: input.runningManagedCommands.map(
          (command) => command.id,
        ),
        heldManagedCommandIds: input.heldManagedCommands.map(
          (held) => held.commandId,
        ),
      }),
    [
      dedupedBackgroundItems,
      input.runningManagedCommands,
      input.heldManagedCommands,
    ],
  );
  const backgroundSummary = useMemo(
    () =>
      backgroundHeaderSummary({
        runningCount: backgroundRunning,
        heldCount: input.heldManagedCommands.length,
        waitingWakeCount: dedupedBackgroundItems.filter(
          (item) => item.kind === "wakeup",
        ).length,
        portForwardCount: input.portForwardCount,
      }),
    [
      backgroundRunning,
      input.heldManagedCommands,
      dedupedBackgroundItems,
      input.portForwardCount,
    ],
  );
  const changeTotals = useMemo(
    () => accumulatedDiffTotals(input.restore.accumulatedFileChanges),
    [input.restore.accumulatedFileChanges],
  );
  const changedFileCount =
    input.restore.accumulatedFileChanges.length +
    input.restore.undeliveredChangeCount;

  // A pill exists for every compact section that HAS something to show,
  // whether or not its panel is open - the pill is the way back, so it cannot
  // be the thing that disappears when the panel appears.
  const filesChip = dockMemberFolded({
    values: changedFilesValues,
    ghost: filesChangedHotspot.ghost,
    hasContent: changesPresent,
  });
  // Received A2A rows follow this mode, so the chip is also owed when they are
  // the only thing folded: without it, folding would make them unreachable.
  const agentsHasContent = input.activeAgentsVisible || receivedAgentCount > 0;
  const agentsChip = dockMemberFolded({
    values: runningAgentsValues,
    ghost: activeAgentsHotspot.ghost,
    hasContent: agentsHasContent,
  });
  const backgroundChip = dockMemberFolded({
    values: backgroundValues,
    ghost: backgroundHotspot.ghost,
    hasContent: input.backgroundVisible,
  });

  // The queue minus its received-A2A rows while the Active agents pill stands
  // for them, and the identical object otherwise - the dock's queue section
  // and the surrounding spacing both key off this array's length, so handing
  // back a fresh copy of an unchanged queue would churn both. An OPEN agents
  // pill puts them back: that panel lists the agents, never the responses they
  // queued, so nothing else would show them.
  // The RAW stored section, where every other consumer reads the derived
  // `openSection`. The two are equal here and the `&&` is why: `openSection`
  // is `storedOpenSection` filtered by `chipPresent`, and `chipPresent`'s
  // entry for this member IS `agentsChip`, which this expression already
  // requires. The raw value is read because the derivation order forces it -
  // `queueChip` needs `dockQueue`, `dockQueue` needs this, and `openSection`
  // needs `queueChip` - so hoisting `openSection` above this line would make a
  // real cycle rather than tidying a second source of truth.
  const agentsRowsFolded = agentsChip && storedOpenSection !== "activeAgents";
  const dockQueue = useMemo(
    () => foldedQueue(input.queue, agentsRowsFolded),
    [input.queue, agentsRowsFolded],
  );
  const queuedCount = dockQueue.items.length;
  const queueArrivalToken = queueArrivalPulseToken(dockQueue.items);
  const queueHasContent = queuedCount > 0;
  const queueChip = dockMemberFolded({
    values: queueValues,
    ghost: queueHotspot.ghost,
    hasContent: queueHasContent,
  });

  // Todo and the Message queue are dock members too (L-139): same Full row /
  // Chip / Hidden semantics, same reordering, same pill treatment.
  const todo = input.todo;
  const todoCounts = useMemo(() => {
    if (todo === null) return null;
    return {
      done: todo.items.filter((item) => item.status === "completed").length,
      total: todo.items.length,
    };
  }, [todo]);
  const todoHasContent = input.snapshotLoaded && todo !== null;
  const todoChip = dockMemberFolded({
    values: todoValues,
    ghost: todoHotspot.ghost,
    hasContent: todoHasContent,
  });

  const chipPresent: Readonly<Record<ChatDockSection, boolean>> = {
    filesChanged: filesChip,
    activeAgents: agentsChip,
    background: backgroundChip,
    queue: queueChip,
    todo: todoChip,
  };
  // The remembered pill only counts while its pill is actually there. Derived
  // rather than written, so a chat whose snapshot has not landed yet keeps
  // what it had open instead of having it erased by a loading frame.
  const openSectionPillPresent =
    storedOpenSection !== null && chipPresent[storedOpenSection];
  const openSection = openSectionPillPresent ? storedOpenSection : null;
  // A section that EMPTIES while the chat is loaded is a real close, and the
  // memory goes with it: the user reverts every change, the pill goes away,
  // and the next turn's changes must not re-open a panel nobody asked for.
  useEffect(() => {
    if (storedOpenSection === null) return;
    if (!input.snapshotLoaded) return;
    if (openSectionPillPresent) return;
    closeOpenSection(chatId);
  }, [
    storedOpenSection,
    input.snapshotLoaded,
    openSectionPillPresent,
    closeOpenSection,
    chatId,
  ]);

  // Every pill-sized member is folded, open or not: an open pill's panel is
  // the frame's topmost attached one, never a row in dock order (L-142).
  const folded = useMemo(() => {
    const sections = new Set<ChatDockSection>();
    if (filesChip) sections.add("filesChanged");
    if (agentsChip) sections.add("activeAgents");
    if (backgroundChip) sections.add("background");
    if (queueChip) sections.add("queue");
    if (todoChip) sections.add("todo");
    return sections;
  }, [filesChip, agentsChip, backgroundChip, queueChip, todoChip]);

  const chips = useMemo<ReadonlyArray<ChatDockCompactChipModel>>(() => {
    const models: ChatDockCompactChipModel[] = [];
    if (filesChip) {
      models.push({
        section: "filesChanged",
        glyph: "filesChanged",
        // The pill is the member's ONE anchor, open or closed (L-142). It is
        // drawn whenever the member is pill-sized, and the panel it opens is
        // content rather than a second registration - two elements registering
        // the same region and instance share one key, so the later would
        // silently displace the earlier (`ghost-region.tsx`).
        hotspotRef: filesChangedHotspot.ref,
        working: false,
        // The file count leads and the line counts follow, the same order and
        // the same tones the panel's own header uses - the chip stands in for
        // that header, so reading one after the other should feel like reading
        // the same row twice, not like two different measurements.
        text: `${changedFileCount}`,
        lineDeltas: changeTotals,
        label: filesChangedLabel(changedFileCount, changeTotals),
        // Constant, so this fires on the chip's arrival and never again -
        // which is the first change of the chat, since the chip exists only
        // once there is one. Keying it on the line counts instead reads well
        // in the abstract and is unbearable in practice: they are summed per
        // edit while a turn is still writing, so a turn touching twelve files
        // rang the chip beside the input twelve times.
        pulseToken: "changed",
      });
    }
    if (agentsChip) {
      models.push({
        section: "activeAgents",
        glyph: "activeAgents",
        hotspotRef: activeAgentsHotspot.ref,
        // Mid-turn is the live state here, exactly as the roster in `label`
        // words it - the chip draws it, the sentence says it.
        working: agentsWorking,
        lineDeltas: null,
        text:
          receivedAgentCount > 0
            ? `${agentsRunningCount} · ${receivedAgentCount}`
            : `${agentsRunningCount}`,
        // The roster is the panel's row list folded into the sentence: the
        // chip is the only door to that list while the row is away, so its
        // tooltip has to say WHO is running, not just how many.
        label: `Active agents. ${agentsRunningCount} running${receivedAgentCount > 0 ? `, ${receivedAgentCount} received from other agents and queued` : ""}.${agentsRoster === null ? "" : ` ${agentsRoster}.`}`,
        // Only the first agent starting is worth an eye-flick - which is the
        // moment this chip appears; a count moving between two non-zero values
        // is the same fact, updated.
        pulseToken: agentsRunningCount > 0 ? "running" : null,
      });
    }
    if (backgroundChip) {
      models.push({
        section: "background",
        // The section's own mark whatever the rows are - activity lights it
        // rather than replacing it, and the kinds are the panel's to draw.
        glyph: "background",
        hotspotRef: backgroundHotspot.ref,
        // The count IS the running count, so anything in it lights the chip -
        // and a shell whose process is alive is in that count whether or not it
        // is monitoring, since the host reports it as `running` either way
        // (`managedCommandStatusSchema`).
        working: backgroundRunning > 0,
        lineDeltas: null,
        text: `${backgroundRunning}`,
        // The number on the chip is the running count, but the section can be
        // on screen for a held shell or a pending wake with nothing running at
        // all - so the sentence is the header's own summary, which names every
        // part rather than letting a bare `0` stand for "nothing here".
        label: `Background. ${backgroundSummary}.`,
        // A failure outranks the plain arrival: it is the one thing this
        // section can report that is not simply news, and the ring is the
        // only channel it has while the row is folded into a pill.
        pulseToken:
          input.backgroundFailureToken ??
          (backgroundRunning > 0 ? "running" : null),
      });
    }
    if (queueChip) {
      models.push({
        section: "queue",
        glyph: "queue",
        hotspotRef: queueHotspot.ref,
        // Never lit: a queued message is WAITING, not running, and a pill that
        // shimmered for one would say the opposite of what the queue means.
        // The count carries it - it takes the foreground tone every pill count
        // takes, and the pulse below rings once for each message that lands.
        working: false,
        lineDeltas: null,
        text: `${queuedCount}`,
        label: `Message queue. ${queuedCount} ${queuedCount === 1 ? "message" : "messages"} queued.`,
        // Keyed on the newest row's id, so a message ARRIVING in the queue
        // flicks the pill once - the folded queue's only other channel is the
        // number itself, which nothing draws the eye to - and a queue
        // DRAINING, which is the count moving the other way, flicks nothing.
        pulseToken: queueArrivalToken,
      });
    }
    if (todoChip && todoCounts !== null) {
      models.push({
        section: "todo",
        glyph: "todo",
        hotspotRef: todoHotspot.ref,
        working: false,
        lineDeltas: null,
        // `done/total`, the same measurement the full row prints at its right
        // edge, in the same order.
        text: `${todoCounts.done}/${todoCounts.total}`,
        label: `Todo. ${todoCounts.done} of ${todoCounts.total} done.`,
        // Constant: the list arriving is the news, and a pill that flicked on
        // every completed item would ring through a whole plan.
        pulseToken: "todo",
      });
    }
    return dockOrder.flatMap((section) =>
      models.filter((model) => model.section === section),
    );
  }, [
    dockOrder,
    filesChip,
    agentsChip,
    backgroundChip,
    queueChip,
    todoChip,
    todoCounts,
    queuedCount,
    queueArrivalToken,
    backgroundSummary,
    changeTotals,
    changedFileCount,
    agentsRunningCount,
    agentsWorking,
    agentsRoster,
    receivedAgentCount,
    backgroundRunning,
    input.backgroundFailureToken,
    filesChangedHotspot.ref,
    activeAgentsHotspot.ref,
    backgroundHotspot.ref,
    queueHotspot.ref,
    todoHotspot.ref,
  ]);

  const strip = useMemo<ChatDockCompactStripValue>(
    () => ({ chips, openSection, panelId, onToggle }),
    [chips, openSection, panelId, onToggle],
  );

  const hotspots: Readonly<Record<ChatDockSection, DockRowHotspot>> = {
    filesChanged: {
      hotspotRef: filesChangedHotspot.ref,
      editing: filesChangedHotspot.editing,
      ghost: filesChangedHotspot.ghost,
      shown: changedFilesValues.shown === "shown",
      hasContent: changesPresent,
    },
    activeAgents: {
      hotspotRef: activeAgentsHotspot.ref,
      editing: activeAgentsHotspot.editing,
      ghost: activeAgentsHotspot.ghost,
      shown: runningAgentsValues.shown === "shown",
      hasContent: activeAgentsHasContent,
    },
    background: {
      hotspotRef: backgroundHotspot.ref,
      editing: backgroundHotspot.editing,
      ghost: backgroundHotspot.ghost,
      shown: backgroundValues.shown === "shown",
      hasContent: input.backgroundVisible,
    },
    queue: {
      hotspotRef: queueHotspot.ref,
      editing: queueHotspot.editing,
      ghost: queueHotspot.ghost,
      shown: queueValues.shown === "shown",
      hasContent: queueHasContent,
    },
    todo: {
      hotspotRef: todoHotspot.ref,
      editing: todoHotspot.editing,
      ghost: todoHotspot.ghost,
      shown: todoValues.shown === "shown",
      hasContent: todoHasContent,
    },
  };

  return { folded, openSection, dockQueue, strip, dockOrder, hotspots };
}

/** How many agents the chip's sentence names before it starts counting. */
const ROSTER_NAME_LIMIT = 3;

/**
 * The agents by name and state, as one clause: `Planner working, Reviewer in
 * background`. Null when there is no one to name, so the sentence it joins
 * ends cleanly instead of trailing an empty clause.
 *
 * Capped, because the roster is bounded by fleet size and nothing else - a
 * workflow fanning out to a dozen agents with free-form titles would put a
 * paragraph on the chip's accessible name, read out in full before the count
 * the listener actually asked for. The names past the cap become a number; the
 * panel one click away is still the whole list.
 */
function agentRoster(agents: ReadonlyArray<AgentRow>): string | null {
  if (agents.length === 0) return null;
  const named = agents
    .slice(0, ROSTER_NAME_LIMIT)
    .map((agent) => `${agent.title} ${agentStateWord(agent.activity)}`);
  const remaining = agents.length - named.length;
  if (remaining > 0) named.push(`and ${remaining} more`);
  return named.join(", ");
}

function agentStateWord(activity: AgentRow["activity"]): string {
  switch (activity) {
    case "turn":
      return "working";
    case "background":
      return "in background";
    case false:
      return "idle";
  }
  const unreachable: never = activity;
  return unreachable;
}

/**
 * The queue minus its received-A2A rows when the Active agents chip is standing
 * for them, and the identical object otherwise - the dock's queue section and
 * the surrounding spacing both key off this array's length, so handing back a
 * fresh copy of an unchanged queue would churn both.
 */
function foldedQueue(
  queue: ChatSessionState["queue"],
  agentsFolded: boolean,
): ChatSessionState["queue"] {
  if (!agentsFolded) return queue;
  const items = queue.items.filter((item) => !isReceivedAgentResponse(item));
  if (items.length === queue.items.length) return queue;
  return { status: queue.status, items };
}

function fileCountPhrase(count: number): string {
  return count === 1 ? "1 file" : `${count} files`;
}

/**
 * The chip's accessible name, spelling out what it draws: the `+` and `−` on
 * screen are two colours and a pair of signs, and neither reads aloud.
 *
 * A zero side is dropped here exactly as it is dropped on screen, so the name
 * and the chip say the same thing - and with both zero the sentence stops
 * after the file count rather than claiming "0 lines added".
 */
function filesChangedLabel(fileCount: number, totals: DiffLineCounts): string {
  const parts = [fileCountPhrase(fileCount)];
  if (totals.additions > 0) {
    parts.push(`${totals.additions} ${lineWord(totals.additions)} added`);
  }
  // The noun rides on whichever clause comes first: "12 lines added, 4
  // removed" says what it means, and repeating "lines" in the second clause
  // only makes the sentence longer.
  if (totals.deletions > 0) {
    parts.push(
      totals.additions > 0
        ? `${totals.deletions} removed`
        : `${totals.deletions} ${lineWord(totals.deletions)} removed`,
    );
  }
  return `Files changed. ${parts.join(", ")}.`;
}

function lineWord(count: number): string {
  return count === 1 ? "line" : "lines";
}

function approvalSurfaceVisible(
  snapshotLoaded: boolean,
  isViewer: boolean,
  pendingApprovalCount: number,
): boolean {
  return snapshotLoaded && !isViewer && pendingApprovalCount > 0;
}

function RuntimeGatedApprovalSurface(props: {
  readonly model: ComposerSurfaceModel;
  readonly layout: ComposerSurfaceLayout;
}): ReactNode {
  const { model, layout } = props;
  if (
    !model.runtime.snapshotLoaded ||
    model.access.isViewer ||
    model.pendingApprovalCount === 0
  ) {
    return null;
  }
  return (
    <ComposerSlotShell
      topSpacing={layout.topSpacing}
      bottomSpacing={layout.slotBottomSpacing}
    >
      <PendingApprovalQueues
        pendingFileEditApprovals={model.approvals.pendingFileEditApprovals}
        pendingApprovals={model.approvals.pendingApprovals}
        canAct={model.access.canAct}
        onFileEditDecision={model.approvals.onFileEditDecision}
        onApprovalDecision={model.approvals.onApprovalDecision}
        highlightedApprovalId={model.approvals.highlightedApprovalId}
        highlightedGeneration={model.approvals.highlightedGeneration}
      />
    </ComposerSlotShell>
  );
}

const ChatComposerRegion = memo(function ChatComposerRegion(props: {
  readonly model: ComposerSurfaceModel;
  readonly layout: ComposerSurfaceLayout;
}): ReactNode {
  const { model, layout } = props;
  return <ComposerSurface model={model} layout={layout} />;
});

function ComposerSurface(props: {
  readonly model: ComposerSurfaceModel;
  readonly layout: ComposerSurfaceLayout;
}): ReactNode {
  const { model, layout } = props;
  const tabHostId = useTabHostId();
  if (!model.runtime.snapshotLoaded) {
    return null;
  }
  if (model.access.isViewer) {
    // The workspace row is LIVE: its selector targets the reading host and this
    // surface's chat id, and both create/re-bind and remove are real mutations.
    // For a viewer of a live chat that is the chat's own workspace and the row
    // is informative. For a COPY (`readOnlyNotice` is set only by the published
    // and doc-replica surfaces) the binding shown is `null` and the chat id is
    // the one the OWNER minted, so acting on the row would commit a workspace
    // change against whatever local lineage happens to hold that id here.
    // A copy has no live workspace to show, so it shows none.
    const isCopy = model.access.readOnlyNotice !== null;
    return (
      <ComposerSlotShell topSpacing={layout.topSpacing} bottomSpacing="normal">
        <div className="flex flex-col gap-3">
          <ReadOnlyComposerNotice notice={model.access.readOnlyNotice} />
          {isCopy ? null : (
            <ComposerReadonlyWorkspaceModeRow
              workspaceSlot={model.composer.workspaceControls}
            />
          )}
        </div>
      </ComposerSlotShell>
    );
  }
  // The escape hatch stacks ABOVE the card/composer rather than replacing
  // either: a stuck block can coexist with an answerable one, and the composer
  // must stay reachable in case the host would in fact accept a send (only
  // `detached` waits gate it host-side, which the renderer cannot observe).
  const escapeHatch =
    model.interview.unanswerable.length > 0 ? (
      <ComposerSlotShell topSpacing={layout.topSpacing} bottomSpacing="normal">
        <UnanswerableInterviewNotice
          interviews={model.interview.unanswerable}
          isBusy={model.interview.unanswerableBusy}
          onDismiss={
            model.access.canAct
              ? (blockId, reason) =>
                  model.interview.onSkip(blockId, reason, undefined)
              : null
          }
        />
      </ComposerSlotShell>
    ) : null;
  // The notice already paid the surface's top spacing, so whatever follows it
  // connects flush underneath.
  const belowSpacing: ChatLowerSurfaceTopSpacing =
    escapeHatch === null ? layout.topSpacing : "connected";
  if (model.interview.pending !== null) {
    return (
      <>
        {escapeHatch}
        <ComposerSlotShell topSpacing={belowSpacing} bottomSpacing="normal">
          <PendingInterviewCard
            key={`${model.composer.nodeId}:${model.interview.pending.blockId}`}
            chatId={model.composer.nodeId}
            blockId={model.interview.pending.blockId}
            questions={model.interview.pending.questions}
            isActive={model.composer.isActive}
            isBusy={model.interview.isBusy}
            onSubmit={model.access.canAct ? model.interview.onAnswer : null}
            onSkip={model.access.canAct ? model.interview.onSkip : null}
            onFork={model.access.canAct ? model.interview.onFork : null}
            epicId={model.composer.currentEpicId}
            hostId={tabHostId}
            navigationHighlighted={
              model.interview.highlightedBlockId ===
              model.interview.pending.blockId
            }
            highlightGeneration={model.interview.highlightedGeneration}
          />
        </ComposerSlotShell>
      </>
    );
  }
  return (
    <>
      {escapeHatch}
      <LiveChatComposer
        model={model}
        topSpacing={belowSpacing}
        hasPendingApprovals={model.hasPendingApprovals}
      />
    </>
  );
}

function LiveChatComposer(props: {
  readonly model: ComposerSurfaceModel;
  readonly topSpacing: ChatLowerSurfaceTopSpacing;
  readonly hasPendingApprovals: boolean;
}) {
  const { model } = props;
  return (
    <ChatComposer
      key={model.queue.editingItem?.queueItemId}
      taskId={model.composer.nodeId}
      isActive={model.composer.isActive}
      sendDisabled={!model.access.canAct}
      sendDisabledHint={chatSendDisabledHint(model.access)}
      mentionRoots={model.composer.mentionRoots}
      fallbackToGlobalMentionRoots={model.composer.fallbackToGlobalMentionRoots}
      currentEpicId={model.composer.currentEpicId}
      viewTabId={model.viewTabId}
      settingsSeed={
        model.queue.editingItem?.settings ?? model.composer.sessionSettingsSeed
      }
      fallbackSettingsSeed={model.composer.fallbackSettingsSeed}
      onSubmitMessage={model.composer.onSubmitMessage}
      onSideChat={model.composer.onSideChat}
      onSettingsChange={model.composer.onSettingsChange}
      activeTurnStatus={model.turn.activeTurnStatus}
      steerCapable={model.turn.steerCapable}
      steerProtocolSupported={model.turn.steerProtocolSupported}
      autoPermissionModeProtocolSupported={
        model.turn.autoPermissionModeProtocolSupported
      }
      getDraftBlobBridgeSupported={model.turn.getDraftBlobBridgeSupported}
      getActiveTurnForSteer={model.turn.getActiveTurnForSteer}
      editingQueueItemId={model.queue.editingItem?.queueItemId ?? null}
      onCancelQueueEdit={model.queue.onCancelEdit}
      hasPendingApprovals={props.hasPendingApprovals}
      stopDisabled={model.turn.stopDisabled}
      onStopTurn={model.turn.onStopTurn}
      workspaceControls={model.composer.workspaceControls}
      workspaceAvailability={model.composer.workspaceAvailability}
      providerFallback={model.providerFallback}
      topSpacing={props.topSpacing}
      topSlot={null}
    />
  );
}

function PendingApprovalQueues(props: {
  readonly pendingFileEditApprovals: ReadonlyArray<ChatFileEditApprovalState>;
  readonly pendingApprovals: ReadonlyArray<ChatApprovalState>;
  readonly canAct: boolean;
  readonly onFileEditDecision: (approvalId: string, approved: boolean) => void;
  readonly onApprovalDecision: (approvalId: string, approved: boolean) => void;
  readonly highlightedApprovalId: string | null;
  readonly highlightedGeneration?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      <ComposerSlotFileEditApprovalQueue
        approvals={props.pendingFileEditApprovals}
        canAct={props.canAct}
        onDecision={props.onFileEditDecision}
        highlightedApprovalId={props.highlightedApprovalId}
        highlightedGeneration={props.highlightedGeneration}
      />
      <ComposerSlotApprovalQueue
        approvals={props.pendingApprovals}
        canAct={props.canAct}
        onDecision={props.onApprovalDecision}
        highlightedApprovalId={props.highlightedApprovalId}
        highlightedGeneration={props.highlightedGeneration}
      />
    </div>
  );
}

function ComposerSlotShell(props: {
  readonly children: ReactNode;
  readonly topSpacing: ChatLowerSurfaceTopSpacing;
  readonly bottomSpacing: ComposerSlotBottomSpacing;
}) {
  return (
    <div className="pointer-events-none px-4">
      <div
        className={cn(
          "pointer-events-auto relative mx-auto w-full max-w-3xl bg-canvas",
          props.topSpacing === "normal" ? "pt-4" : "pt-0",
          props.bottomSpacing === "normal" ? "pb-4" : "pb-0",
          props.bottomSpacing === "normal" &&
            "after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-canvas after:content-['']",
        )}
      >
        {props.children}
      </div>
    </div>
  );
}

function ReadOnlyComposerNotice(props: { readonly notice: string | null }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-canvas-border/70 bg-canvas px-3 py-2 text-ui-sm text-muted-foreground">
      {/* The same lock the sidebar row and tab strip mark read-only chats
          with, aligned to the first line of a notice that can wrap. */}
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        {props.notice ??
          "Read-only viewer. The agent owner can send prompts and manage this queue."}
      </span>
    </div>
  );
}
