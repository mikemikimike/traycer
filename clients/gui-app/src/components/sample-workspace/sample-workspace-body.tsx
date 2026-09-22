import { useCoarsePointer } from "@/hooks/ui/use-coarse-pointer";
import { resolveMinimapVisibleItemCapacity } from "@/components/minimap/minimap-track-geometry";
import { useEffect, useId, useRef, useState } from "react";
import { Wrench } from "lucide-react";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import { LayoutRegionContextMenu } from "@/components/layout-editor/region-quick-verbs";
import {
  ChatLowerDock,
  type DockRowHotspot,
} from "@/components/chat/chat-lower-dock";
import {
  dockMemberFolded,
  dockMemberMaterialised,
} from "@/components/chat/chat-dock-fold";
import { ChatDockCompactStripProvider } from "@/components/chat/chat-dock-compact-strip";
import type { ChatDockSection } from "@/lib/chat/chat-dock-sections";
import { TabHostContext } from "@/components/epic-canvas/hooks/use-tab-host-id";
import {
  ChatDiffTargetContext,
  type ChatSnapshotDiffOpener,
} from "@/components/chat/chat-diff-target";
import { SegmentRow } from "@/components/chat/segments/segment-row";
import {
  ChatUserMessageContent,
  UserMessageBubble,
} from "@/components/chat/chat-user-message-content";
import { TextSegment } from "@/components/chat/segments/text-segment";
import { ChatTurnMinimapView } from "@/components/chat/chat-turn-minimap";
import { ContextUsageChip } from "@/components/chat/context-usage-chip";
import { ComposerSlotShell } from "@/components/epic-canvas/renderers/chat-tile-lower-surfaces";
import { ComposerShell } from "@/components/home/composer/composer-shell";
import { ComposerWorkspaceRow } from "@/components/home/composer/composer-workspace-mode-row";
import { ComposerTileIdProvider } from "@/components/home/composer/composer-tile-context";
import { ComposerToolbar } from "@/components/home/toolbar/composer-toolbar";
import { createComposerPickerStore } from "@/components/chat/composer/picker/composer-picker-store";
import { createComposerToolbarStore } from "@/stores/composer/composer-toolbar-store";
import {
  useArrangementValue,
  useRegionShown,
  useRegionValues,
} from "@/lib/layout-overrides";
import { chatDockSection } from "@/lib/chat/chat-dock-sections";
import { SampleWorkspaceRail } from "./sample-workspace-rail";
import {
  CONTEXT_USAGE_PREVIEW_SAMPLE,
  SAMPLE_AGENT_DESCENDANTS,
  SAMPLE_BACKGROUND_ITEMS,
  SAMPLE_CHANGED_FILE,
  SAMPLE_CHAT_ID,
  SAMPLE_DICTATION,
  SAMPLE_DOCK,
  SAMPLE_EPIC_ID,
  SAMPLE_HOST_ID,
  SAMPLE_MINIMAP_ITEMS,
  SAMPLE_NO_PENDING_STOPS,
  SAMPLE_QUEUE,
  SAMPLE_RESTORE,
  SAMPLE_SELF_AGENT,
  SAMPLE_TILE_ID,
  SAMPLE_TODO,
  SAMPLE_TOOLBAR_VALUES,
  SAMPLE_TURNS,
  SAMPLE_VIEW_TAB_ID,
  sampleNoop,
  sampleNoopAction,
} from "./sample-workspace-scene";
import { cn } from "@/lib/utils";

/**
 * The diff openers the changed-files panel asks for before it draws "Review
 * all". Real handler shapes with nothing behind them: the panel's own gate is
 * "is there an opener", so a null context would silently drop the action and
 * the sample would go on missing the header button L-98 is about.
 */
const SAMPLE_DIFF_OPENER: ChatSnapshotDiffOpener = {
  segment: () => ({ onClick: sampleNoop, onDoubleClick: sampleNoop }),
  cumulative: () => ({ onClick: sampleNoop, onDoubleClick: sampleNoop }),
  cumulativeBundle: () => sampleNoop,
  hash: () => ({ onClick: sampleNoop, onDoubleClick: sampleNoop }),
};

export function SampleWorkspaceBody() {
  const [pickerStore] = useState(() => createComposerPickerStore());
  const [toolbarStore] = useState(() =>
    createComposerToolbarStore({
      seedKey: SAMPLE_TILE_ID,
      values: SAMPLE_TOOLBAR_VALUES,
      onSettingsChange: null,
      tuiOnly: false,
      chatLineCarriesAutoMode: null,
      hostId: null,
    }),
  );
  const dockOrder = useArrangementValue("dock").map(chatDockSection);
  const changedFiles = useRegionValues("changedFiles");
  const runningAgents = useRegionValues("runningAgents");
  const backgroundValues = useRegionValues("background");
  const files = useLayoutRegion({
    regionId: "changedFiles",
    instanceId: SAMPLE_TILE_ID,
  });
  const agents = useLayoutRegion({
    regionId: "runningAgents",
    instanceId: SAMPLE_TILE_ID,
  });
  const background = useLayoutRegion({
    regionId: "background",
    instanceId: SAMPLE_TILE_ID,
  });
  // Five members since L-139: the Message queue and Todo are dock regions with
  // the same Full row / Chip / Hidden semantics as the other three, so the
  // canvas has to draw them the same way.
  const queueValues = useRegionValues("queue");
  const todoValues = useRegionValues("todo");
  const queue = useLayoutRegion({
    regionId: "queue",
    instanceId: SAMPLE_TILE_ID,
  });
  const todo = useLayoutRegion({
    regionId: "todo",
    instanceId: SAMPLE_TILE_ID,
  });
  const panelId = useId();
  // Every dock member HAS content here (L-98): the sample scene feeds the real
  // panels, so a row draws its own header, its actions and its body exactly as
  // a live chat's does rather than a look-alike header.
  const hotspots: Readonly<Record<ChatDockSection, DockRowHotspot>> = {
    filesChanged: {
      hotspotRef: files.ref,
      editing: files.editing,
      shown: changedFiles.shown === "shown",
      hasContent: true,
      ghost: files.ghost,
    },
    activeAgents: {
      hotspotRef: agents.ref,
      editing: agents.editing,
      shown: runningAgents.shown === "shown",
      hasContent: true,
      ghost: agents.ghost,
    },
    background: {
      hotspotRef: background.ref,
      editing: background.editing,
      shown: backgroundValues.shown === "shown",
      hasContent: true,
      ghost: background.ghost,
    },
    queue: {
      hotspotRef: queue.ref,
      editing: queue.editing,
      shown: queueValues.shown === "shown",
      hasContent: true,
      ghost: queue.ghost,
    },
    todo: {
      hotspotRef: todo.ref,
      editing: todo.editing,
      shown: todoValues.shown === "shown",
      hasContent: true,
      ghost: todo.ghost,
    },
  };
  // The same derivation the real tile folds on, ghost included: a member that
  // is Hidden AND Chip has to materialise as the CHIP the editor is pointing
  // at, not as the full row it never draws at rest.
  const chipFolded: Readonly<Record<ChatDockSection, boolean>> = {
    filesChanged: dockMemberFolded({
      values: changedFiles,
      ghost: files.ghost,
      hasContent: true,
    }),
    activeAgents: dockMemberFolded({
      values: runningAgents,
      ghost: agents.ghost,
      hasContent: true,
    }),
    background: dockMemberFolded({
      values: backgroundValues,
      ghost: background.ghost,
      hasContent: true,
    }),
    queue: dockMemberFolded({
      values: queueValues,
      ghost: queue.ghost,
      hasContent: true,
    }),
    todo: dockMemberFolded({
      values: todoValues,
      ghost: todo.ghost,
      hasContent: true,
    }),
  };
  const folded = new Set<ChatDockSection>(
    dockOrder.filter((section) => chipFolded[section]),
  );
  const chips = dockOrder.flatMap((section) => {
    const sample = SAMPLE_DOCK.find((item) => item.section === section);
    return folded.has(section) && sample
      ? [{ ...sample, hotspotRef: hotspots[section].hotspotRef }]
      : [];
  });
  // The same question the real tile asks before it spaces its composer
  // (`chat-tile-lower-surfaces.tsx`'s `lowerSurfaceTopSpacing`): is there a
  // FULL dock row above the input, whose frame tucks into it with `-mb-px`?
  // If there is, the two are one joined surface and the composer adds no top
  // padding; if the dock is pills only, the composer's own `pt-4` is what
  // holds the pill row a clear step off the input (L-153). The sample used to
  // add nothing in either case, which is why the editor - and only the editor
  // - showed the pills stuck to the composer's border.
  const anyFullRow = dockOrder.some(
    (section) =>
      !folded.has(section) &&
      dockMemberMaterialised({
        shown: hotspots[section].shown,
        ghost: hotspots[section].ghost,
      }),
  );
  const sidebarSide = useArrangementValue("sidebarSide");
  return (
    <ComposerTileIdProvider tileId={SAMPLE_TILE_ID}>
      <div className="flex min-h-0 flex-1 bg-canvas" data-sample-workspace-body>
        {/* DOM order follows `sidebarSide` (S-06), never CSS `order`, so the
            layout editor's sample scene shows the real side. */}
        {sidebarSide === "right" ? null : <SampleWorkspaceRail />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <SampleTranscript />
          {/* The two contexts the real dock panels resolve before they draw:
              the tab's host (the Background panel and the agent stop buttons
              read it) and the diff opener (the changed-files panel's "Review
              all"). Both name the sample scene, so every store they consult
              answers empty and the panels show the sample data below and
              nothing of the user's own work. */}
          <TabHostContext.Provider value={SAMPLE_HOST_ID}>
            <ChatDiffTargetContext.Provider value={SAMPLE_DIFF_OPENER}>
              <ChatDockCompactStripProvider
                // Always closed on the canvas: the editor's firewall swallows
                // clicks, so a pill never opens here and the picture the user
                // customises is the resting one (L-142).
                value={{
                  chips,
                  openSection: null,
                  panelId,
                  onToggle: sampleNoop,
                }}
              >
                <ChatLowerDock
                  snapshotLoaded
                  epicId={SAMPLE_EPIC_ID}
                  chatId={SAMPLE_CHAT_ID}
                  viewTabId={SAMPLE_VIEW_TAB_ID}
                  selfAgent={SAMPLE_SELF_AGENT}
                  activeAgents={SAMPLE_AGENT_DESCENDANTS}
                  todo={SAMPLE_TODO}
                  restore={SAMPLE_RESTORE}
                  queue={SAMPLE_QUEUE}
                  folded={folded}
                  dockOrder={dockOrder}
                  hotspots={hotspots}
                  backgroundItems={SAMPLE_BACKGROUND_ITEMS}
                  runningManagedCommandCount={0}
                  heldManagedCommandCount={0}
                  portForwardCount={0}
                  backgroundStopPendingTaskIds={SAMPLE_NO_PENDING_STOPS}
                  backgroundStopAllPending={false}
                  backgroundSessionStopPending={false}
                  activeTurnStatus={null}
                  canAct
                  queueResumeRequested={false}
                  queueKeepPausedRequested={false}
                  readOnly={false}
                  editingQueueItemId={null}
                  // "normal" (`pt-4`), the same answer the real tile gives
                  // whenever no approval surface is drawn above the dock
                  // (`pinnedStackTopSpacing`). The scene had "compact"
                  // (`pt-2`) with nothing above it to be compact for.
                  topSpacing="normal"
                  scrollRegionMaxHeightClass="max-h-[min(24dvh,12rem)]"
                  onQueuePause={sampleNoopAction}
                  onQueueResume={sampleNoopAction}
                  onQueueEdit={sampleNoop}
                  onQueueCancel={sampleNoop}
                  onQueueAbortSteer={sampleNoop}
                  onQueueReorder={sampleNoop}
                  onQueueSteerNow={sampleNoop}
                  onBackgroundItemClick={sampleNoop}
                  onBackgroundItemStop={sampleNoopAction}
                  onBackgroundItemsStopAll={sampleNoopAction}
                  onBackgroundSessionStop={sampleNoopAction}
                />
                {/* The REAL composer stack, not a copy of its classes
                    (L-87): `ComposerSlotShell` owns the edge lanes, the
                    `max-w-3xl` column, the canvas fill, the top and bottom
                    spacing and the seam seal, and `relative flex flex-col
                    gap-3` is the composer's own inner rhythm
                    (`chat-composer.tsx`). The scene used to hand-roll both
                    and had drifted to no vertical spacing at all, which is
                    why the pills read as stuck to the input here and nowhere
                    else (L-153).

                    `shrink-0` is the one thing the sample adds, and it is
                    about this scene rather than about the composer: the real
                    lower surfaces are an absolutely positioned overlay, while
                    here they are a flex child under a scrolling transcript.

                    `connected` is the same question the real tile asks - a
                    FULL dock row above means the frame tucks into the input
                    with `-mb-px` and the two are one surface, so the composer
                    adds no top padding; a pills-only dock means its `pt-4` is
                    what holds the pill row a clear step off the input. */}
                <div className="shrink-0">
                  <ComposerSlotShell
                    topSpacing={anyFullRow ? "connected" : "normal"}
                    bottomSpacing="normal"
                  >
                    <div className="relative flex flex-col gap-3">
                      <ComposerShell
                        pickerStore={pickerStore}
                        onDragOver={sampleNoop}
                        onDragEnter={sampleNoop}
                        onDragLeave={sampleNoop}
                        onDrop={sampleNoop}
                        dragOverlayVariant={null}
                        utilityRail={null}
                        attachmentsStrip={null}
                        editor={
                          // No marker of its own: `ComposerShell` already marks
                          // `data-composer-editor-frame`, which this placeholder
                          // renders inside, and a second marker on a descendant
                          // would dim it twice.
                          <p className="pb-5 text-ui text-muted-foreground">
                            Describe the next change…
                          </p>
                        }
                        toolbar={
                          <ComposerToolbar
                            presentation
                            store={toolbarStore}
                            onAttachImages={sampleNoop}
                            canSubmit={false}
                            attachmentPending={false}
                            onSubmit={sampleNoop}
                            activeTurnStatus={null}
                            stopDisabled
                            onStopTurn={null}
                            composerDisabledHint="Sample content"
                            // The mic slot draws nothing without a control, so a
                            // Microphone set to Shown had no chip to point at
                            // (L-116). The scene's idle control is what the real
                            // `ComposerMicButton` renders from.
                            dictation={SAMPLE_DICTATION}
                            dictationPreparing={null}
                            settingsLocked
                            createProfileHostId={null}
                            runTargetHostId={null}
                            terminalLoginSurface={null}
                            chatLineCarriesAutoMode={null}
                          />
                        }
                      />
                      <ComposerWorkspaceRow
                        workspaceControls={
                          <>
                            <span
                              data-layout-passive
                              className="min-w-0 text-ui-xs text-muted-foreground"
                            >
                              Sample workspace
                            </span>
                            <ContextUsageChip
                              usage={CONTEXT_USAGE_PREVIEW_SAMPLE}
                              onCompact={sampleNoop}
                            />
                          </>
                        }
                      />
                    </div>
                  </ComposerSlotShell>
                </div>
              </ChatDockCompactStripProvider>
            </ChatDiffTargetContext.Provider>
          </TabHostContext.Provider>
        </div>
        {sidebarSide === "right" ? <SampleWorkspaceRail /> : null}
      </div>
    </ComposerTileIdProvider>
  );
}

function SampleTranscript() {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [capacity, setCapacity] = useState(12);
  const shown = useRegionShown("minimap");
  const side = useArrangementValue("minimapSide");
  const coarsePointer = useCoarsePointer();
  let minimapCondition: string | null = null;
  if (coarsePointer)
    minimapCondition = "Minimap is unavailable with a coarse pointer";
  if (!shown) minimapCondition = "Hidden";
  const { ref: minimapRef } = useLayoutRegion({
    regionId: "minimap",
    instanceId: SAMPLE_TILE_ID,
  });
  useEffect(() => {
    const scroller = viewport.current;
    const turns = content.current;
    if (!scroller || !turns) return;
    // Open at the latest turn, the way a real chat does.
    //
    // This is the slice the owner's recording shows: the scroller opened at
    // the TOP, so its bottom edge landed wherever a line happened to be and
    // the dock's opaque band cut that line in half. Scrolled to the end, the
    // scroller's bottom edge lands on the content's own `py-6`, and the last
    // thing above the dock is whitespace rather than half a sentence.
    scroller.scrollTop = scroller.scrollHeight;
    const measure = () => {
      const nodes = Array.from(
        turns.querySelectorAll<HTMLElement>("[data-sample-turn]"),
      );
      const top = scroller.getBoundingClientRect().top;
      const firstBelow = nodes.findIndex(
        (node) => node.getBoundingClientRect().bottom > top,
      );
      setCurrentIndex(Math.max(0, firstBelow));
      setCapacity(resolveMinimapVisibleItemCapacity(scroller.clientHeight));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    observer.observe(turns);
    scroller.addEventListener("scroll", measure);
    measure();
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, []);
  return (
    <div className="relative min-h-0 flex-1">
      {/* `opacity-only`, for the reason `chat-timeline.tsx` carries the same
          value: a full-height scroller under a `filter` is a continuously
          repainting filtered layer the size of the pane. This is the canvas the
          editor always opens now (L-87), so without it nothing on screen reads
          as calm content under lit chrome (C-03). The minimap region is a
          SIBLING of this scroller, so the marker never sits above a region. */}
      <div
        ref={viewport}
        data-layout-passive="opacity-only"
        className="h-full overflow-y-auto px-4"
        aria-label="Sample conversation"
      >
        <div ref={content} className="mx-auto max-w-3xl space-y-8 py-6">
          {SAMPLE_TURNS.map((turn, index) => (
            <div key={turn.prompt} data-sample-turn className="space-y-4">
              <div className="ml-auto w-fit max-w-full">
                <UserMessageBubble>
                  <ChatUserMessageContent
                    content={turn.prompt}
                    attachments={[]}
                  />
                </UserMessageBubble>
              </div>
              {index === 0 ? (
                <SegmentRow
                  open={false}
                  onOpenChange={sampleNoop}
                  header={
                    <>
                      <Wrench className="size-4" />
                      <span>Read {SAMPLE_CHANGED_FILE.path} · Sample tool</span>
                    </>
                  }
                  headerAction={null}
                  body={null}
                  tone="default"
                  stickyHeader={false}
                  headerFindUnitId={null}
                  bodyFindUnitId={null}
                  expandable={false}
                  className={undefined}
                  footer={null}
                />
              ) : null}
              <TextSegment
                findUnitId={null}
                markdown={turn.reply}
                isStreaming={false}
                nextStepActions={null}
              />
            </div>
          ))}
        </div>
      </div>
      {/* The minimap's own quick verbs (L-144), on both of the things this
          site can draw: the rail itself, and the stand-in that explains why
          there is none. The wrapper is `display: contents`, so neither one's
          absolute placement moves. */}
      <LayoutRegionContextMenu regionId="minimap">
        {minimapCondition !== null ? (
          <div
            ref={minimapRef}
            className={cn(
              "absolute top-1/2 rounded border border-dashed p-2 text-ui-xs text-muted-foreground",
              side === "left" ? "left-3" : "right-3",
            )}
          >
            {minimapCondition}
          </div>
        ) : (
          <ChatTurnMinimapView
            items={SAMPLE_MINIMAP_ITEMS}
            currentIndex={currentIndex}
            cursorIndex={currentIndex}
            maxVisibleItems={capacity}
            bottomInset={0}
            hitStripWidth={24}
            side={side}
            open={false}
            ref={minimapRef}
            hitStripRef={null}
            onOpen={sampleNoop}
            onFocus={sampleNoop}
            onKeyDown={sampleNoop}
            onCursorIndexChange={sampleNoop}
            onSelect={sampleNoop}
          />
        )}
      </LayoutRegionContextMenu>
    </div>
  );
}
