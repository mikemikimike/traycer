import type { ComposerToolbarValues } from "@/stores/composer/composer-toolbar-store";
import type { ComposerDictationControl } from "@/components/home/toolbar/composer-mic-button";
import type { TokenUsage } from "@traycer/protocol/persistence/epic/foundation";
import type { ChatTurnMinimapItem } from "@/components/chat/chat-turn-minimap-logic";
import type { ChatDockCompactChipModel } from "@/components/chat/chat-dock-compact-context";
import type { LeftPanelAvailabilityContext } from "@/components/epic-canvas/sidebar/left-panel-registry";
import type {
  BackgroundItem,
  ChatQueueState,
} from "@traycer/protocol/host/agent/gui/subscribe";
import type { AccumulatedChangeRow } from "@/lib/chat/accumulated-change-rows";
import type { ChatRestoreContextValue } from "@/components/chat/chat-restore-context-core";
import type { PinnedTodoSnapshot } from "@/components/chat/chat-pinned-todos";
import type { AgentRow } from "@/hooks/agent/use-agent-stop-controls";

export const SAMPLE_USAGE_USED_PERCENT = 57;
export const SAMPLE_CHANGED_FILE = {
  path: "src/task-list.tsx",
  additions: 12,
  deletions: 3,
};

/**
 * The ids the sample dock's real panels are addressed by (L-98).
 *
 * They are strings no host ever mints, which is the point: the panels read
 * their own stores with them and get an empty answer, so the sample dock shows
 * exactly the sample data below and never joins a real chat's managed
 * commands, held shells or agent records.
 */
export const SAMPLE_EPIC_ID = "sample-workspace-epic";
export const SAMPLE_CHAT_ID = "sample-workspace-chat";
export const SAMPLE_VIEW_TAB_ID = "sample-workspace-tab";
export const SAMPLE_HOST_ID = "sample-workspace-host";

/**
 * The changed files the real "N files changed" panel lists (L-98).
 *
 * Three rows rather than one: the panel's header counts them and sums their
 * `+`/`-`, and a one-row list cannot show that the count and the totals are
 * two different measurements. `undoable` is true on all three so "Undo all"
 * draws enabled, which is the state the owner's own composer shows.
 */
export const SAMPLE_CHANGED_FILES: ReadonlyArray<AccumulatedChangeRow> = [
  {
    filePath: SAMPLE_CHANGED_FILE.path,
    operation: "edit",
    diffSource: "snapshot",
    reason: "snapshot",
    undoable: true,
    artifact: null,
    counts: {
      additions: SAMPLE_CHANGED_FILE.additions,
      deletions: SAMPLE_CHANGED_FILE.deletions,
    },
    hasContents: true,
    digest: null,
    liveDiff: null,
  },
  {
    filePath: "src/task-list-empty.tsx",
    operation: "create",
    diffSource: "snapshot",
    reason: "snapshot",
    undoable: true,
    artifact: null,
    counts: { additions: 28, deletions: 0 },
    hasContents: true,
    digest: null,
    liveDiff: null,
  },
  {
    filePath: "src/task-list.css",
    operation: "edit",
    diffSource: "snapshot",
    reason: "snapshot",
    undoable: true,
    artifact: null,
    counts: { additions: 7, deletions: 6 },
    hasContents: true,
    digest: null,
    liveDiff: null,
  },
];

/** What the panel's header and the Changed files chip both print. */
export const SAMPLE_CHANGE_TOTALS = { additions: 47, deletions: 9 };

/**
 * The restore context the changes panel reads.
 *
 * `accessRole: "owner"` with no active turn is what opens `revertGate`, so the
 * sample shows "Undo all" in its ENABLED state; the handler returns `null`,
 * the panel's own "handled, nothing to track", and the edit firewall swallows
 * the gesture at the app column before it is ever reached (L-131).
 */
export const SAMPLE_RESTORE: ChatRestoreContextValue = {
  accessRole: "owner",
  currentUserId: null,
  activeHostId: null,
  activeTurnStatus: null,
  localSnapshotsClearedAt: null,
  restore: null,
  restoreActionPending: false,
  restoreCheckpoint: sampleNoopAction,
  accumulatedFileChanges: SAMPLE_CHANGED_FILES,
  undeliveredChangeCount: 0,
  accumulatedSetComplete: true,
  revertFileChanges: sampleNoopAction,
};

/** The agent the real Active agents panel titles itself with, plus one child. */
export const SAMPLE_SELF_AGENT: AgentRow = {
  id: SAMPLE_CHAT_ID,
  title: "Sample agent",
  surface: "gui",
  activity: "turn",
  hostId: SAMPLE_HOST_ID,
};
export const SAMPLE_AGENT_DESCENDANTS: ReadonlyArray<AgentRow> = [
  {
    id: "sample-workspace-agent-child",
    title: "Sample reviewer",
    surface: "gui",
    activity: "turn",
    hostId: SAMPLE_HOST_ID,
  },
];

/** Two running shells, so the Background panel's summary counts more than one. */
export const SAMPLE_BACKGROUND_ITEMS: ReadonlyArray<BackgroundItem> = [
  {
    taskId: "sample-background-1",
    title: "bun run test src/task-list.test.tsx",
    blockId: "sample-background-block-1",
    parentTaskId: null,
    kind: "command",
    scheduledFor: null,
    individualStopUnavailable: null,
  },
  {
    taskId: "sample-background-2",
    title: "Sample shell · Checking the task list",
    blockId: "sample-background-block-2",
    parentTaskId: null,
    kind: "monitor",
    scheduledFor: null,
  },
];

/** The pinned Todo row, part-done so the panel's counts all have a value. */
export const SAMPLE_TODO: PinnedTodoSnapshot = {
  id: "sample-todo",
  items: [
    {
      id: "sample-todo-1",
      status: "completed",
      text: "Group related tasks",
      priority: null,
      activeForm: null,
    },
    {
      id: "sample-todo-2",
      status: "in_progress",
      text: "Give the titles more room",
      priority: null,
      activeForm: "Giving the titles more room",
    },
    {
      id: "sample-todo-3",
      status: "pending",
      text: "Add the empty state",
      priority: null,
      activeForm: null,
    },
  ],
};

/** One queued prompt, so the Queue row has a specimen in every preset. */
export const SAMPLE_QUEUE: ChatQueueState = {
  status: "running",
  items: [
    {
      kind: "prompt",
      queueItemId: "sample-queue-1",
      messageId: "sample-queue-1-message",
      message: {
        kind: "user",
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Then check the keyboard order." },
              ],
            },
          ],
        },
        browserAnnotations: [],
      },
      sender: { type: "user", userId: "sample-user" },
      settings: {
        harnessId: "claude",
        model: "sample-model",
        permissionMode: "supervised",
        reasoningEffort: "medium",
        serviceTier: null,
        agentMode: "epic",
        profileId: null,
      },
      accountContext: { type: "PERSONAL" },
      delivery: "next_turn",
      status: "pending",
      targetTurnId: null,
      steerRequest: null,
      fallbackReason: null,
      createdAt: 1,
      updatedAt: 1,
    },
  ],
};

/** Nothing in the sample dock has a stop in flight. */
export const SAMPLE_NO_PENDING_STOPS: ReadonlySet<string> = new Set<string>();

/**
 * The dictation control the mic slot needs before it draws anything (L-116).
 *
 * `ComposerMicSlot` returns null without one whatever Layout ▸ Microphone says,
 * because withholding the control is how `voiceInputEnabled` turns the feature
 * off - right for the real composer, wrong for a scene whose job is to depict
 * the toolbar in each state (L-98). `idle` is the state the chip rests in, so
 * the sample draws the plain mic the user is choosing to keep or remove, and
 * `getStream` answers the recording bar's one question with "no stream" - a
 * question it never asks, since nothing in this scene can start recording.
 */
export const SAMPLE_DICTATION: ComposerDictationControl = {
  state: "idle",
  onToggle: sampleNoop,
  onStop: sampleNoop,
  onCancel: sampleNoop,
  getStream: sampleNoStream,
};
export const SAMPLE_TOOLBAR_VALUES: ComposerToolbarValues = {
  permission: "supervised",
  selection: {
    harnessId: "claude",
    modelSlug: "sample-model",
    profileId: null,
  },
  reasoning: "medium",
  serviceTier: "",
};
export const SAMPLE_TILE_ID = "sample-workspace";
export const CONTEXT_USAGE_PREVIEW_SAMPLE: TokenUsage = {
  inputTokens: 56,
  outputTokens: 3,
  totalTokens: 946_959,
  contextTokens: 946_956,
  cacheReadInputTokens: 945_800,
  cacheCreationInputTokens: 1_100,
  contextWindow: 1_000_000,
};
export const SAMPLE_RAIL_PRESENCE: Omit<
  LeftPanelAvailabilityContext,
  "visibilityOverrideById"
> = {
  commentsPanelRevealed: false,
  hasActiveCommentableArtifact: false,
  hasPullRequests: false,
};
export const SAMPLE_TURNS = [
  {
    prompt: "Make the task list easier to scan.",
    reply:
      "I’ll group related tasks, give the titles more room, and keep the progress visible beside each item. The changes can stay within the existing list component.",
  },
  {
    prompt: "Keep the layout comfortable on smaller windows.",
    reply:
      "The list now uses the available width. Long titles wrap, metadata stays beside its task, and the controls keep their touch targets. The layout has no fixed content width.",
  },
  {
    prompt: "How should completed tasks look?",
    reply:
      "Completed tasks retain their titles and a clear completion mark. The muted secondary details keep attention on active work without hiding useful context.",
  },
  {
    prompt: "Add a short empty state as well.",
    reply:
      "The empty state explains what belongs here and provides one clear next action. It uses the same spacing and type scale as the populated list, so the page stays steady when the first task arrives.",
  },
  {
    prompt: "Check the keyboard flow.",
    reply:
      "The focus order follows the visual order: task title, task actions, then the next row. Each action has a readable name, and focus stays visible against the list background.",
  },
  {
    prompt: "Does the spacing still work with long descriptions?",
    reply:
      "Descriptions wrap beneath the title and keep a comfortable line length. Related details share one group, with more space between tasks than within them. This makes the hierarchy clear even when several rows contain multiple lines.",
  },
  {
    prompt: "Keep the existing colours.",
    reply:
      "The update uses the existing theme tokens. Completion, focus and secondary text keep their current meanings across light and dark themes. No extra palette or separate set of styles is needed.",
  },
  {
    prompt: "What is ready to review?",
    reply:
      "The task list has clearer grouping, responsive spacing, a useful empty state and a predictable keyboard order. One file changed, and the background check is running. This conversation and its counts are sample content for configuring your layout.",
  },
];
export const SAMPLE_MINIMAP_ITEMS: ReadonlyArray<ChatTurnMinimapItem> =
  SAMPLE_TURNS.map((turn, index) => ({
    key: `sample-turn-${index}`,
    messageId: `sample-turn-${index}`,
    rowIndex: index,
    endRowIndex: index,
    level: 1,
    label: turn.prompt,
  }));
export const SAMPLE_DOCK: ReadonlyArray<
  Omit<ChatDockCompactChipModel, "hotspotRef">
> = [
  {
    section: "filesChanged",
    glyph: "filesChanged",
    working: false,
    text: `${SAMPLE_CHANGED_FILES.length}`,
    lineDeltas: SAMPLE_CHANGE_TOTALS,
    label: "Sample: three changed files, 47 additions and 9 deletions",
    pulseToken: null,
  },
  {
    section: "activeAgents",
    glyph: "activeAgents",
    working: true,
    text: `${1 + SAMPLE_AGENT_DESCENDANTS.length}`,
    lineDeltas: null,
    label: "Sample: two active agents",
    pulseToken: null,
  },
  {
    section: "background",
    glyph: "background",
    working: true,
    text: `${SAMPLE_BACKGROUND_ITEMS.length}`,
    lineDeltas: null,
    label: "Sample: two background shells",
    pulseToken: null,
  },
];
export function sampleNoop(): void {}

/**
 * The stop-action string every sample dock handler returns.
 *
 * The real handlers answer with an action id the caller tracks, and `null` is
 * their "handled, nothing to track" - which is exactly what a sample gesture
 * is, so the sample passes `null` rather than inventing an id no store holds.
 */
export function sampleNoopAction(): string | null {
  return null;
}

/** The sample composer records nothing, so it holds no microphone stream. */
export function sampleNoStream(): MediaStream | null {
  return null;
}
