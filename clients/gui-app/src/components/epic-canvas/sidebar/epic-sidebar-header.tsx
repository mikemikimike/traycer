/**
 * Epic sidebar header row - the panel's title, its drag handle and its
 * section-specific Action components.
 *
 * It carries no collapse control: the sidebar body draws exactly one panel
 * (L-155), so collapsing it would leave the whole column empty, and
 * "collapse the sidebar" already has one owner in `mainCollapsedByTabId`
 * (L-157). The row is still the panel-section DRAG source, which is how a
 * panel is dropped onto the rail from the body.
 */
import { useDraggable } from "@dnd-kit/core";
import {
  getLeftPanelSectionDragId,
  getPaneScopedDndId,
  LEFT_PANEL_RAIL_ITEM_DND_TYPE,
  type EpicCanvasLeftPanelRailDragData,
} from "@/components/epic-canvas/dnd/dnd";
import { useDragSourceDisabled } from "@/components/epic-canvas/dnd/use-drag-source-disabled";
import { type LeftPanelDefinition } from "@/components/epic-canvas/sidebar/epic-sidebar";
import { useCallback, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import { useMaybeSidebarBulkSelection } from "@/components/epic-canvas/sidebar/epic-sidebar-selection";
import {
  usePanelHeaderSearchOpen,
  usePanelHeaderSearchStore,
} from "@/stores/epics/panel-header-search-store";

interface LeftPanelSectionHeaderProps {
  readonly epicId: string;
  readonly tabId: string;
  readonly panel: LeftPanelDefinition;
}

/**
 * Portal target for an opted-in panel's search input. Rendered INSTEAD of the
 * standard header row (same `h-9`, so the body below never shifts), and left
 * empty here: the owning panel portals its own input in, keeping that input's
 * state, refs, and combobox ARIA wiring in a single component.
 */
function PanelHeaderSearchRow(props: {
  readonly epicId: string;
  readonly tabId: string;
  readonly panel: LeftPanelDefinition;
}) {
  const registerSearchSlot = usePanelHeaderSearchStore(
    (state) => state.registerSearchSlot,
  );
  const unregisterSearchSlot = usePanelHeaderSearchStore(
    (state) => state.unregisterSearchSlot,
  );
  const Actions = props.panel.Actions;
  const panelId = props.panel.id;
  const currentSlotRef = useRef<HTMLDivElement | null>(null);
  const setSlotRef = useCallback(
    (element: HTMLDivElement | null) => {
      const previous = currentSlotRef.current;
      if (previous !== null && previous !== element) {
        unregisterSearchSlot(props.tabId, panelId, previous);
      }
      currentSlotRef.current = element;
      if (element !== null) {
        registerSearchSlot(props.tabId, panelId, element);
      }
    },
    [panelId, props.tabId, registerSearchSlot, unregisterSearchSlot],
  );
  return (
    <div
      className="@container flex h-9 shrink-0 items-center gap-1 px-2"
      data-testid={`epic-sidebar-header-search-slot-${panelId}`}
    >
      <div ref={setSlotRef} className="min-w-0 flex-1" />
      {Actions === null ? null : (
        <Actions epicId={props.epicId} tabId={props.tabId} mode="search" />
      )}
    </div>
  );
}

export function LeftPanelSectionHeader(props: LeftPanelSectionHeaderProps) {
  const Icon = props.panel.icon;
  const Actions = props.panel.Actions;
  const Subtitle = props.panel.Subtitle;
  const dragData = useMemo<EpicCanvasLeftPanelRailDragData>(
    () => ({
      kind: LEFT_PANEL_RAIL_ITEM_DND_TYPE,
      viewTabId: props.tabId,
      panelId: props.panel.id,
      origin: "panel-section",
    }),
    [props.panel.id, props.tabId],
  );
  const dragDisabled = useDragSourceDisabled();
  const {
    listeners,
    setNodeRef: dragRef,
    isDragging,
  } = useDraggable({
    id: getPaneScopedDndId(
      props.tabId,
      getLeftPanelSectionDragId(props.panel.id),
    ),
    data: dragData,
    disabled: dragDisabled,
  });
  const searchOpen = usePanelHeaderSearchOpen(props.tabId, props.panel.id);
  const bulkSelection = useMaybeSidebarBulkSelection();
  // Selection is a panel-wide mode, so its controls own the row instead of
  // competing horizontally with a title that no longer describes the mode.
  if (bulkSelection?.selectionMode === true && Actions !== null) {
    return (
      <div
        className="@container flex h-9 shrink-0 items-center justify-end px-2"
        data-panel-header-mode="selection"
      >
        <Actions epicId={props.epicId} tabId={props.tabId} mode="selection" />
      </div>
    );
  }
  // Search mode takes the whole row rather than adding one below it, so the
  // list keeps its vertical position and the panel spends no resting space on
  // a mode that is off most of the time.
  if (props.panel.supportsHeaderSearch && searchOpen) {
    return (
      <PanelHeaderSearchRow
        epicId={props.epicId}
        tabId={props.tabId}
        panel={props.panel}
      />
    );
  }
  return (
    <div
      ref={dragRef}
      className={cn(
        "@container flex h-9 shrink-0 items-center justify-between gap-2 px-3",
        isDragging && "opacity-60",
      )}
    >
      {/* The title is the drag handle and nothing else: there is no collapse
          to toggle any more (L-157), so it is a plain row rather than a
          button that would announce an action it cannot perform. */}
      <div
        {...listeners}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left active:cursor-grabbing"
      >
        <Icon className="size-4 shrink-0 text-muted-foreground/80 @max-[14rem]:hidden" />
        <div className="min-w-0">
          <p className="truncate text-ui-xs font-normal uppercase tracking-wide text-muted-foreground">
            {props.panel.title}
          </p>
          {Subtitle === null ? null : (
            <Subtitle epicId={props.epicId} tabId={props.tabId} />
          )}
        </div>
      </div>
      {Actions === null ? null : (
        <Actions epicId={props.epicId} tabId={props.tabId} mode="normal" />
      )}
    </div>
  );
}
