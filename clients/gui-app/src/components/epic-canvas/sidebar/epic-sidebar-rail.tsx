import { Fragment, use, useCallback, useMemo, useState } from "react";
import {
  useDraggable,
  useDroppable,
  type DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import { Button } from "@/components/ui/button";
import { useLayoutRegion } from "@/components/layout-editor/use-layout-region";
import { LAYOUT_CLUSTER_ATTRIBUTE } from "@/components/layout-editor/canvas/canvas-attributes";
import {
  leftPanelIdForRailRegion,
  railDisplayEntries,
  railRegionForLeftPanelId,
  type RailEntry,
} from "@/lib/layout/rail";
import {
  isStackedRailPanel,
  type EdgeSide,
} from "@/lib/layout/layout-arrangement";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { RailContextMenuContent } from "@/components/epic-canvas/sidebar/rail-context-menu-content";
import { DropLine } from "@/components/ui/drop-line";
import { LeftPanelRailDivider } from "@/components/epic-canvas/sidebar/left-panel-rail-divider";
import { LeftPanelRailStack } from "@/components/epic-canvas/sidebar/left-panel-rail-stack";
import { useRailDividersEditing } from "@/components/epic-canvas/sidebar/use-rail-dividers-editing";
import {
  getLeftPanelRailDragId,
  getLeftPanelRailDropId,
  getLeftPanelRailListDropId,
  getPaneScopedDndId,
  LEFT_PANEL_RAIL_ITEM_DND_TYPE,
  type EpicCanvasDropTargetData,
  type EpicCanvasLeftPanelRailDragData,
  type LeftPanelRailDropPosition,
} from "@/components/epic-canvas/dnd/dnd";
import { useDragSourceDisabled } from "@/components/epic-canvas/dnd/use-drag-source-disabled";
import {
  useLeftPanelRailDropPreview,
  useLeftPanelSectionDragSource,
} from "@/components/epic-canvas/dnd/dnd-store";
import { mergeRefs } from "@/lib/merge-refs";
import { cn } from "@/lib/utils";
import {
  useLayoutRail,
  usePanelVisibilityOverrides,
} from "@/lib/layout/rail-view";
import {
  useActiveLeftPanelId,
  useCommentsPanelRevealed,
  useEpicLeftPanelStore,
  useMainPanelCollapsed,
} from "@/stores/epics/left-panel-store";
import { type LeftPanelId } from "@/lib/left-panel-ids";
import { useActiveEpicArtifactId } from "@/stores/epics/canvas/store";
import {
  getLeftPanelDefinition,
  isLeftPanelVisible,
  resolveDisplayedPanelId,
  retainDisplayedPrPanel,
  type LeftPanelAvailabilityContext,
  type LeftPanelMetadataDefinition,
} from "@/components/epic-canvas/sidebar/left-panel-registry";
import {
  LEFT_PANEL_RAIL_TAB_UNDERLINE_CLASS,
  LEFT_PANEL_RAIL_TILE_CLASS,
} from "@/components/epic-canvas/sidebar/left-panel-rail-tile";
import { useEpicArtifact } from "@/lib/epic-selectors";
import { SidebarSideContext } from "@/components/epic-canvas/sidebar/sidebar-side-context";
import { useSurfaceHostPinWithDefault } from "@/hooks/host/use-surface-host-pin";
import { tabSurfaceKey } from "@/stores/host/surface-host-selection-store";
import { useCanvasHostId } from "@/components/epic-canvas/hooks/use-canvas-host-id";
import {
  selectPrScopeHasItems,
  usePrPresenceStore,
} from "@/stores/epics/pr-presence-store";
import { type LucideIcon } from "lucide-react";

export type RailOrientation = "vertical" | "horizontal";

interface EpicLeftPanelRailProps {
  readonly epicId: string;
  readonly tabId: string;
  readonly orientation: RailOrientation;
}

interface EpicLeftPanelStaticRailProps {
  readonly epicId: string;
  readonly tabId: string;
  readonly orientation: RailOrientation;
}

interface EpicLeftPanelRailContentProps {
  readonly epicId: string;
  readonly tabId: string;
  readonly orientation: RailOrientation;
  readonly hasActiveCommentableArtifact: boolean;
}

/**
 * One thing the rail draws: a panel's icon, a stacked PAIR of them in one
 * capsule (L-167), or a divider (L-155).
 *
 * Every divider the rail holds is drawn, at rest as well as in a session: at
 * rest it is extra space and in a session a handle (L-140), and both of those
 * are `LeftPanelRailDivider`'s answer rather than this list's. Which panels
 * are drawn, and which pairs survive as pairs, is `railDisplayEntries`'
 * answer, not a second copy of the rule here (R5R-05, L-166) - so a hidden
 * panel leaves its partner standing alone on the rail and in the body by the
 * same walk.
 */
type RailItem =
  | { readonly kind: "panel"; readonly panel: LeftPanelMetadataDefinition }
  | {
      readonly kind: "stack";
      readonly id: string;
      readonly top: LeftPanelMetadataDefinition;
      readonly bottom: LeftPanelMetadataDefinition;
    }
  | { readonly kind: "divider"; readonly id: string };

function railItems(
  rail: ReadonlyArray<RailEntry>,
  context: LeftPanelAvailabilityContext,
): ReadonlyArray<RailItem> {
  return railDisplayEntries(rail, (regionId) =>
    isLeftPanelVisible(
      getLeftPanelDefinition(leftPanelIdForRailRegion(regionId)),
      context,
    ),
  ).map((entry): RailItem => {
    if (entry.kind === "divider") return { kind: "divider", id: entry.id };
    if (entry.kind === "panel") {
      return {
        kind: "panel",
        panel: getLeftPanelDefinition(leftPanelIdForRailRegion(entry.id)),
      };
    }
    return {
      kind: "stack",
      id: entry.id,
      top: getLeftPanelDefinition(leftPanelIdForRailRegion(entry.top)),
      bottom: getLeftPanelDefinition(leftPanelIdForRailRegion(entry.bottom)),
    };
  });
}

/** Every panel a rail item draws, so the highlight walks one list. */
function railItemPanels(
  items: ReadonlyArray<RailItem>,
): ReadonlyArray<LeftPanelMetadataDefinition> {
  return items.flatMap((item): LeftPanelMetadataDefinition[] => {
    if (item.kind === "divider") return [];
    return item.kind === "panel" ? [item.panel] : [item.top, item.bottom];
  });
}

/**
 * VS Code-style mini rail. Always visible (~3rem wide). Clicking an inactive
 * icon switches the active panel and expands the main panel if collapsed.
 * Clicking the already-active icon toggles main panel collapse. Dragging an
 * icon before or after another reorders the rail (L-155).
 */
export function EpicLeftPanelRail(props: EpicLeftPanelRailProps) {
  const { epicId, tabId, orientation } = props;
  const activeArtifactId = useActiveEpicArtifactId(tabId);
  const activeArtifact = useEpicArtifact(activeArtifactId);
  const hasActiveCommentableArtifact =
    activeArtifact !== null && "kind" in activeArtifact;

  return (
    <EpicLeftPanelRailContent
      epicId={epicId}
      tabId={tabId}
      orientation={orientation}
      hasActiveCommentableArtifact={hasActiveCommentableArtifact}
    />
  );
}

export function EpicLeftPanelStaticRail(props: EpicLeftPanelStaticRailProps) {
  return (
    <EpicLeftPanelRailContent
      epicId={props.epicId}
      tabId={props.tabId}
      orientation={props.orientation}
      hasActiveCommentableArtifact={false}
    />
  );
}

function EpicLeftPanelRailContent(props: EpicLeftPanelRailContentProps) {
  const { epicId, tabId, orientation, hasActiveCommentableArtifact } = props;
  const activePanelId = useActiveLeftPanelId(tabId);
  const collapsed = useMainPanelCollapsed(tabId);
  const rail = useLayoutRail();
  // Asked once for the whole rail (L-109): the dividers below are grab handles
  // only while this rail is the one being customized, and plain space otherwise.
  const dividersEditing = useRailDividersEditing();
  const commentsPanelRevealed = useCommentsPanelRevealed(tabId);
  // The host the PR panel records presence under (see `EpicLeftPanelHost`).
  const canvasHostId = useCanvasHostId();
  const { resolvedHostId: hostId } = useSurfaceHostPinWithDefault(
    tabSurfaceKey("pull-requests", tabId),
    canvasHostId,
  );
  const hasPullRequests = usePrPresenceStore(
    selectPrScopeHasItems(hostId, epicId),
  );
  const visibilityOverrideById = usePanelVisibilityOverrides();
  const setActivePanelIdAndExpand = useEpicLeftPanelStore(
    (s) => s.setActivePanelIdAndExpand,
  );
  const toggleMainCollapsed = useEpicLeftPanelStore(
    (s) => s.toggleMainCollapsed,
  );
  const collapsedById = useEpicLeftPanelStore(
    (s) => s.panelSectionCollapsedByPanelId,
  );
  const availabilityContext = useMemo<LeftPanelAvailabilityContext>(
    () =>
      retainDisplayedPrPanel(rail, activePanelId, {
        commentsPanelRevealed,
        hasActiveCommentableArtifact,
        hasPullRequests,
        visibilityOverrideById,
      }),
    [
      rail,
      activePanelId,
      commentsPanelRevealed,
      hasActiveCommentableArtifact,
      hasPullRequests,
      visibilityOverrideById,
    ],
  );
  const items = useMemo(
    () => railItems(rail, availabilityContext),
    [availabilityContext, rail],
  );
  // Which icon lights up. Resolved rather than compared against `activePanelId`
  // directly so a hidden active panel highlights whatever the body fell back
  // to, instead of leaving the rail with nothing marked.
  const displayedPanelId = resolveDisplayedPanelId(
    railItemPanels(items).map((panel) => panel.id),
    activePanelId,
  );
  // The icon the pointer was over when the menu opened, or null for empty rail
  // space. Set on the button's own contextmenu after the rail's capture-phase
  // reset, so both land in the same render as Radix opening the menu.
  const [contextPanelId, setContextPanelId] = useState<LeftPanelId | null>(
    null,
  );
  const handleRailContextMenuCapture = useCallback((): void => {
    setContextPanelId(null);
  }, []);
  const railListDropData = useMemo<EpicCanvasDropTargetData>(
    () => ({ kind: "left-panel-rail-list", viewTabId: tabId }),
    [tabId],
  );
  const { setNodeRef: railDropRef } = useDroppable({
    id: getPaneScopedDndId(tabId, getLeftPanelRailListDropId(epicId)),
    data: railListDropData,
  });
  // Narrow selector hooks: a rail drag preview tick re-renders ONLY the rail,
  // and a canvas-source preview tick (pane bodies / strips) never reaches it.
  const railPanelDropPreview = useLeftPanelRailDropPreview(tabId);
  const panelSectionDragSource = useLeftPanelSectionDragSource(tabId);
  const panelSectionDropDefinition =
    panelSectionDragSource === null
      ? null
      : getLeftPanelDefinition(panelSectionDragSource.panelId);
  const dropAtRailEnd = railPanelDropPreview?.kind === "left-panel-rail-list";
  // The band the drop is in, for whichever icon it is over. `combine` lights
  // the icon itself, because the panel being carried is going INTO it (L-168);
  // `before` and `after` draw a boundary slot beside it, because it is going
  // next to it. The icon used to light on `isOver` alone, which said "into
  // this one" for all three.
  // Whether this panel's SECTION is collapsed the way the body draws it: the
  // flag only means anything while the panel is half of a pair, which is the
  // same reading `LeftPanelSectionContent` applies.
  const sectionCollapsed = useCallback(
    (panelId: LeftPanelId): boolean =>
      collapsedById[panelId] === true &&
      isStackedRailPanel(rail, railRegionForLeftPanelId(panelId)),
    [collapsedById, rail],
  );
  const previewPositionFor = (
    panelId: LeftPanelId,
  ): LeftPanelRailDropPosition | null =>
    railPanelDropPreview?.kind === "left-panel-rail" &&
    railPanelDropPreview.panelId === panelId
      ? railPanelDropPreview.position
      : null;

  // Compared against the icon that is LIT, not against `activePanelId`
  // (R5R-09): when the active panel is hidden the rail lights the fallback,
  // and clicking the lit icon has to collapse the column the way clicking a
  // lit icon always does rather than silently re-selecting it.
  //
  // One exception, and it is the state per-section collapse created (L-170):
  // the lit panel can be displayed AND collapsed, and there the click means
  // "put this section back", not "collapse the sidebar". Without it the only
  // way out of a collapsed active section is the chevron inside a header the
  // user has to find again, and the icon they reach for instead collapses the
  // whole column.
  const handleClick = useCallback(
    (panelId: LeftPanelId) => {
      if (panelId === displayedPanelId && !sectionCollapsed(panelId)) {
        toggleMainCollapsed(tabId);
        return;
      }
      setActivePanelIdAndExpand(tabId, panelId);
    },
    [
      displayedPanelId,
      sectionCollapsed,
      setActivePanelIdAndExpand,
      tabId,
      toggleMainCollapsed,
    ],
  );

  return (
    <TooltipProvider delayDuration={150}>
      {/*
        One context menu for the WHOLE rail rather than one per icon. Right-
        clicking an icon opens it, and so does right-clicking the empty rail -
        which is the only way back to a panel the user hid, once there is no
        icon left to aim at. Nesting a second trigger on the button would fire
        both menus for the same event; the button reports which panel was under
        the pointer through `contextPanelId` instead.
      */}
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            ref={railDropRef}
            onContextMenuCapture={handleRailContextMenuCapture}
            role="toolbar"
            aria-label="Epic left panels"
            aria-orientation={orientation}
            data-epic-sidebar-rail
            data-testid="epic-sidebar-rail"
            data-orientation={orientation}
            {...{ [LAYOUT_CLUSTER_ATTRIBUTE]: "" }}
            className={cn(
              "relative flex items-center gap-1 bg-background",
              orientation === "vertical" &&
                "h-full w-12 shrink-0 flex-col justify-start overflow-y-auto py-2",
              orientation === "horizontal" &&
                "h-10 w-full min-w-0 flex-row justify-center overflow-x-auto px-2",
            )}
          >
            {items.map((item) => {
              if (item.kind === "divider") {
                return (
                  <LeftPanelRailDivider
                    key={item.id}
                    dividerId={item.id}
                    orientation={orientation}
                    editing={dividersEditing}
                  />
                );
              }
              if (item.kind === "stack") {
                return (
                  <LeftPanelRailStack
                    key={item.id}
                    stackId={item.id}
                    orientation={orientation}
                    first={
                      <RailPanelButton
                        tabId={tabId}
                        panel={item.top}
                        orientation={orientation}
                        active={item.top.id === displayedPanelId && !collapsed}
                        combining={
                          previewPositionFor(item.top.id) === "combine"
                        }
                        stacked
                        onClick={() => handleClick(item.top.id)}
                        onContextMenu={setContextPanelId}
                      />
                    }
                    second={
                      <RailPanelButton
                        tabId={tabId}
                        panel={item.bottom}
                        orientation={orientation}
                        active={
                          item.bottom.id === displayedPanelId && !collapsed
                        }
                        combining={
                          previewPositionFor(item.bottom.id) === "combine"
                        }
                        stacked
                        onClick={() => handleClick(item.bottom.id)}
                        onContextMenu={setContextPanelId}
                      />
                    }
                  />
                );
              }
              const panelId = item.panel.id;
              const previewPosition = previewPositionFor(panelId);
              return (
                <Fragment key={panelId}>
                  {previewPosition === "before" ? (
                    <RailBoundaryPreview
                      definition={panelSectionDropDefinition}
                      orientation={orientation}
                    />
                  ) : null}
                  <RailPanelButton
                    tabId={tabId}
                    panel={item.panel}
                    orientation={orientation}
                    active={panelId === displayedPanelId && !collapsed}
                    combining={previewPosition === "combine"}
                    // Read off the MODEL, not off what this rail drew (L-170):
                    // a panel whose partner is hidden draws as a lone icon and
                    // is still half of a pair, so asking the drawn shape let it
                    // offer a combine the writer then refused.
                    stacked={isStackedRailPanel(
                      rail,
                      railRegionForLeftPanelId(panelId),
                    )}
                    onClick={() => handleClick(panelId)}
                    onContextMenu={setContextPanelId}
                  />
                  {previewPosition === "after" ? (
                    <RailBoundaryPreview
                      definition={panelSectionDropDefinition}
                      orientation={orientation}
                    />
                  ) : null}
                </Fragment>
              );
            })}
            {dropAtRailEnd ? (
              <RailBoundaryPreview
                definition={panelSectionDropDefinition}
                orientation={orientation}
              />
            ) : null}
          </div>
        </ContextMenuTrigger>
        <RailContextMenuContent
          context={availabilityContext}
          contextPanelId={contextPanelId}
        />
      </ContextMenu>
    </TooltipProvider>
  );
}

function RailBoundaryPreview(props: {
  readonly definition: LeftPanelMetadataDefinition | null;
  readonly orientation: RailOrientation;
}) {
  if (props.definition !== null) {
    return (
      <RailPanelDropSlot
        definition={props.definition}
        orientation={props.orientation}
        active
      />
    );
  }
  return <RailPanelDropLine orientation={props.orientation} />;
}

function RailPanelDropSlot(props: {
  readonly definition: LeftPanelMetadataDefinition;
  readonly orientation: RailOrientation;
  readonly active: boolean;
}) {
  const Icon = props.definition.icon;
  return (
    <div
      aria-hidden
      data-testid="epic-rail-panel-drop-slot"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-md border border-dashed border-border/80 text-muted-foreground/70 transition-colors",
        props.orientation === "vertical" ? "my-1 size-9" : "mx-1 size-8",
        props.active && "border-primary/70 bg-primary/10 text-foreground",
      )}
    >
      <Icon className="size-4" />
    </div>
  );
}

function RailPanelDropLine(props: { readonly orientation: RailOrientation }) {
  return (
    <DropLine
      orientation={props.orientation === "vertical" ? "horizontal" : "vertical"}
      glow
      className={cn(
        "shrink-0",
        props.orientation === "vertical" && "my-1 w-8",
        props.orientation === "horizontal" && "mx-1 h-8",
      )}
      testId="epic-rail-panel-drop-line"
    />
  );
}

interface RailPanelButtonProps {
  readonly tabId: string;
  readonly panel: LeftPanelMetadataDefinition;
  readonly orientation: RailOrientation;
  readonly active: boolean;
  /** The drop is aimed at this icon's MIDDLE band, which stacks the two. */
  readonly combining: boolean;
  /**
   * Already half of a pair, which is what refuses a combine drop on it: the
   * drop target carries it, so the middle band answers no preview and nothing
   * is highlighted for a gesture that would commit nothing (L-166, L-168).
   */
  readonly stacked: boolean;
  readonly onClick: () => void;
  /** Reports the panel under the pointer to the rail-wide context menu. */
  readonly onContextMenu: (panelId: LeftPanelId) => void;
}

function RailPanelButton(props: RailPanelButtonProps) {
  const {
    tabId,
    panel,
    orientation,
    active,
    combining,
    stacked,
    onClick,
    onContextMenu,
  } = props;
  const handleContextMenu = useCallback((): void => {
    onContextMenu(panel.id);
  }, [onContextMenu, panel.id]);
  const { ref: hotspotRef } = useLayoutRegion({
    regionId: railRegionForLeftPanelId(panel.id),
    instanceId: null,
  });
  const dragData = useMemo<EpicCanvasLeftPanelRailDragData>(
    () => ({
      kind: LEFT_PANEL_RAIL_ITEM_DND_TYPE,
      viewTabId: tabId,
      panelId: panel.id,
      origin: "rail",
    }),
    [panel.id, tabId],
  );
  const dragDisabled = useDragSourceDisabled();
  const {
    listeners,
    setNodeRef: dragRef,
    isDragging,
  } = useDraggable({
    id: getPaneScopedDndId(tabId, getLeftPanelRailDragId(panel.id)),
    data: dragData,
    disabled: dragDisabled,
  });
  const dropData = useMemo<EpicCanvasDropTargetData>(
    () => ({
      kind: "left-panel-rail-item",
      viewTabId: tabId,
      panelId: panel.id,
      orientation,
      stacked,
    }),
    [orientation, panel.id, stacked, tabId],
  );
  const { setNodeRef: dropRef } = useDroppable({
    id: getPaneScopedDndId(tabId, getLeftPanelRailDropId(panel.id)),
    data: dropData,
  });
  const setButtonRef = useMemo(
    () => mergeRefs<HTMLElement>(dragRef, dropRef, hotspotRef),
    [dragRef, dropRef, hotspotRef],
  );

  return (
    <RailButton
      buttonRef={setButtonRef}
      handleListeners={listeners}
      icon={panel.icon}
      label={panel.title}
      orientation={orientation}
      active={active}
      isDragSource={isDragging}
      isDropTarget={combining}
      testId={`epic-rail-${panel.id}`}
      onClick={onClick}
      onContextMenu={handleContextMenu}
    />
  );
}

interface RailButtonProps {
  readonly buttonRef: (element: HTMLElement | null) => void;
  readonly handleListeners: DraggableSyntheticListeners;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly orientation: RailOrientation;
  readonly active: boolean;
  readonly isDragSource: boolean;
  readonly isDropTarget: boolean;
  readonly testId: string;
  readonly onClick: () => void;
  readonly onContextMenu: () => void;
}

/** The vertical rail's active bar, on the edge that faces the window's side. */
const RAIL_ACTIVE_INDICATOR_CLASS: Readonly<Record<EdgeSide, string>> = {
  left: "absolute inset-y-1 left-0 rounded-l-none rounded-r",
  right: "absolute inset-y-1 right-0 rounded-r-none rounded-l",
};

function RailButton(props: RailButtonProps) {
  const {
    buttonRef,
    handleListeners,
    icon: Icon,
    label,
    orientation,
    active,
    isDragSource,
    isDropTarget,
    testId,
    onClick,
    onContextMenu,
  } = props;
  // One context read: the tooltip's popover side is this same value mirrored,
  // so it is derived here rather than through a second `useSidebarPopoverSide()`
  // call, which would read `SidebarSideContext` again.
  const sidebarSide = use(SidebarSideContext);
  const popoverSide = sidebarSide === "left" ? "right" : "left";
  const activeClass =
    orientation === "vertical"
      ? "bg-accent text-accent-foreground hover:bg-accent"
      : "text-foreground hover:bg-transparent";
  const activeIndicatorClass =
    orientation === "vertical"
      ? RAIL_ACTIVE_INDICATOR_CLASS[sidebarSide]
      : LEFT_PANEL_RAIL_TAB_UNDERLINE_CLASS;
  return (
    <TooltipWrapper
      label={label}
      side={orientation === "vertical" ? popoverSide : "bottom"}
      sideOffset={undefined}
      align={undefined}
    >
      <Button
        ref={buttonRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-current={active}
        data-testid={testId}
        onClick={onClick}
        // Bubbles on to the rail's own trigger, which opens the shared menu.
        onContextMenu={onContextMenu}
        className={cn(
          LEFT_PANEL_RAIL_TILE_CLASS,
          active && activeClass,
          isDragSource && "cursor-grabbing opacity-50",
          isDropTarget && "bg-accent/70",
        )}
      >
        <span
          {...handleListeners}
          className="flex size-full items-center justify-center"
        >
          <Icon className="size-4" />
          {active ? (
            <DropLine
              orientation={orientation}
              glow={false}
              className={activeIndicatorClass}
              testId={undefined}
            />
          ) : null}
        </span>
      </Button>
    </TooltipWrapper>
  );
}
