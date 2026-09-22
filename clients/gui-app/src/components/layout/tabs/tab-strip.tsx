import { tabRefKey } from "@/stores/tabs/layout";
import { HiddenTabsMenu } from "./hidden-tabs-menu";
import { useHiddenHeaderTabs } from "./use-hidden-header-tabs";
import { TabGroupChip } from "./tab-group-chip";
import { stripRowsOf, taskPinReadOf } from "./tab-strip-rows";
import {
  memo,
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { mergeRefs } from "@/lib/merge-refs";
import { runHeaderStripCommitHandoff } from "./header-strip-commit-handoff";
import {
  HORIZONTAL_STRIP_AXIS,
  revealMemberAlongAxis,
} from "@/components/epic-canvas/dnd/strip-axis";
import { useNavigate } from "@tanstack/react-router";
import { useDroppable } from "@dnd-kit/core";
import {
  HEADER_TAB_SLOT_DND_TYPE,
  HEADER_TAB_TRAILING_SLOT_DROP_ID,
  type HeaderTabSlotDropData,
} from "@/components/layout/tabs/header-tab-dnd";
import { useEpicDndStore } from "@/components/epic-canvas/dnd/dnd-store";
import { useAppearanceHeaderStripItem } from "@/stores/tabs/use-header-tabs";
import { useTabsStore } from "@/stores/tabs/store";
import { tabResolveIntent } from "@/stores/tabs/registry";
import type { HeaderTab } from "@/stores/tabs/types";
import { TabStripSkeleton } from "@/components/layout/tabs/tab-strip-skeleton";
import { useWindowsBridgeHydrated } from "@/providers/windows-bridge-context";
import { navigateToTabIntent } from "@/lib/tab-navigation";
import { TabItem } from "@/components/layout/tabs/tab-strip-item";
import { SplitTabItem } from "@/components/layout/tabs/split-tab-item";
import { TabStripNewButton } from "@/components/layout/tabs/tab-strip-new-button";
import { HomeStripSlot } from "@/components/layout/tabs/tab-strip-home-item";
import { useHomeTabDrawn } from "@/components/layout/tabs/use-home-tab-drawn";
import { useTabStripController } from "@/components/layout/tabs/tab-strip-controller";
import { TabStripIndicatorScope } from "@/components/layout/tabs/tab-strip-indicator-scope";
import { useSettingsStore } from "@/stores/settings/settings-store";
import { useHorizontalWheelScroll } from "@/hooks/use-horizontal-wheel-scroll";
import type { TabSplitCommandId } from "@/stores/tabs/tab-split-commands";
import type { TaskPinnedState } from "@/hooks/epic/use-epic-task-pinned-states-query";

export function TabStrip() {
  const hasHydrated = useWindowsBridgeHydrated();
  const persistedStripCount = useTabsStore((s) => s.stripOrder.length);
  const homeTabEnabled = useHomeTabDrawn();
  if (!hasHydrated) {
    return (
      <TabStripSkeleton
        count={persistedStripCount}
        reserveHome={homeTabEnabled}
      />
    );
  }
  return <TabStripBody />;
}

function TabStripBody() {
  const controller = useTabStripController();
  const {
    headerItemIds,
    layoutItems,
    groups,
    customizations,
    activeItemId,
    dropIndicatorIndex,
  } = controller;
  const allTabs = controller.tabs;
  const navigate = useNavigate();
  const handleWheel = useHorizontalWheelScroll();
  const taskTabLayout = useSettingsStore((state) => state.taskTabLayout);
  const { setScrollElement, hiddenTabKeys, revealTab } =
    useHiddenHeaderTabs(taskTabLayout);
  const hiddenTabs = useMemo(() => {
    const hidden = new Set(hiddenTabKeys);
    return allTabs.filter((tab) => hidden.has(tabRefKey(tab)));
  }, [allTabs, hiddenTabKeys]);
  const handleActivateHiddenTab = useCallback(
    (tab: HeaderTab) => {
      navigateToTabIntent(navigate, tabResolveIntent(tab), undefined);
      revealTab(tabRefKey(tab));
    },
    [navigate, revealTab],
  );
  const rows = useMemo(
    () => stripRowsOf(headerItemIds, layoutItems, groups, customizations),
    [headerItemIds, layoutItems, groups, customizations],
  );
  // Parent layout effects run AFTER every child's, so by here every strip item
  // has registered and published its current target. Driving the re-base from
  // this one boundary is what makes it reach EVERY item whose baseline moved -
  // an earlier per-item version reached only the items React happened to
  // re-render, which is one tab per commit.
  useLayoutEffect(() => {
    runHeaderStripCommitHandoff(HORIZONTAL_STRIP_AXIS);
  });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  // The strip may not cut the tab that holds the selection in half.
  //
  // The scroller is `overflow-x-auto`, and nothing scrolled a tab into view -
  // so with enough tabs open the layout editor's own tab was appended past the
  // right edge and CLIPPED there. That single clip produced all three things
  // the owner's third live pass reported as one broken tab: the label read
  // "Sample" because the glyphs past the edge were gone, the amber outline
  // covered only the left and the top because the right cap of the silhouette
  // was past the edge, and the mark inside it ended on a razor edge. None of
  // them was a paint bug; the tab was simply half off-screen.
  //
  // That fix was scoped to the session tab's marker, which left the general
  // case - any tab that becomes active while clipped - exactly as broken, and
  // worst where there is no pointer to say where the tab went: ⌘⌥→ through the
  // strip, a leader chord, a palette jump, a tab activated by a close. The
  // reveal is the selection's, not the editing indicator's (L-146).
  //
  // Instant, never smooth: activation is frequent and often held down on a
  // keyboard, and an animated strip under a repeating chord is a strip that is
  // permanently mid-flight and never at the tab the user is on.
  const revealActiveMember = useCallback((): void => {
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    // Mid-drag the strip's geometry belongs to dnd-kit: members carry
    // displacement transforms, the dragged tab follows the pointer, and the
    // drag model re-reads this very `scrollLeft` as its content origin. A
    // reveal here would measure a transient box AND move the ground under the
    // gesture, so a drag is simply not a moment to reveal anything.
    if (useEpicDndStore.getState().activeHeaderTab !== null) return;
    // The selection as the strip PAINTED it - no second reading of
    // `activeItemId` that could disagree with the tab that drew itself active.
    // Exactly one node inside the scroller carries it: a split group's halves
    // are `focused` only while the group itself holds the selection, and Home
    // is drawn outside the scroller.
    const selected = scroller.querySelector<HTMLElement>(
      '[aria-selected="true"]',
    );
    if (selected === null) return;
    // The strip MEMBER, not the selected node: inside a split group the
    // selected node is one half of the member. Walking to the scroller's own
    // child is what gets the element whose box is the whole tab.
    let member: HTMLElement | null = selected;
    while (member !== null && member.parentElement !== scroller) {
      member = member.parentElement;
    }
    if (member === null) return;
    revealMemberAlongAxis(scroller, member, HORIZONTAL_STRIP_AXIS);
  }, []);
  // On the activation CHANGE, and in a layout effect so the reveal lands in
  // the same paint as the newly active tab. Deliberately NOT on every render:
  // the strip is a scroller the user also drives by hand, and a per-commit
  // reveal would haul their position back on every unrelated re-render. The
  // item count rides along because opening or closing a tab moves the active
  // one without changing which tab it is.
  useLayoutEffect(() => {
    revealActiveMember();
  }, [activeItemId, headerItemIds.length, revealActiveMember]);
  // The other way a whole tab becomes a clipped one, with no activation to key
  // on: the strip NARROWS under it - a window resize, a panel opening beside
  // it. Writing `scrollLeft` changes no box, so this cannot re-enter.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    const observer = new ResizeObserver(() => {
      revealActiveMember();
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
    };
  }, [revealActiveMember]);

  // Trailing slot: the strip's empty space after the last tab accepts drops
  // at index `allTabs.length` (both reorder and tear-off).
  const trailingSlotData = useMemo<HeaderTabSlotDropData>(
    () => ({
      kind: HEADER_TAB_SLOT_DND_TYPE,
      index: headerItemIds.length,
      isTrailing: true,
    }),
    [headerItemIds.length],
  );
  const { setNodeRef: trailingSlotRef } = useDroppable({
    id: HEADER_TAB_TRAILING_SLOT_DROP_ID,
    data: trailingSlotData,
  });
  // Memoized, because a fresh callback ref on every render detaches and
  // re-attaches the node on both owners every commit - which for dnd-kit means
  // the drop slot is momentarily unregistered mid-drag.
  const setScrollerNode = useMemo(
    () => mergeRefs(trailingSlotRef, scrollerRef, setScrollElement),
    [trailingSlotRef, setScrollElement],
  );

  // On the empty landing route the strip draws nothing; the header's own
  // actions stay, so no control is lost.
  if (controller.isEmptyLanding) {
    return null;
  }

  return (
    <TabStripIndicatorScope indicators={controller.indicators}>
      <div
        role="tablist"
        aria-label="Open tabs"
        data-testid="tab-strip"
        data-tab-layout={taskTabLayout}
        className="group/strip relative flex min-w-0 flex-1 items-end"
      >
        {/* Outside the scrollable list and before it: Home is fixed, so it
            must not scroll away with the task tabs. */}
        {controller.homeTabDrawn ? (
          <HomeStripSlot
            isActive={controller.homeIsActive}
            onActivate={controller.onHomeTab}
          />
        ) : null}
        <div className="relative flex min-w-0 max-w-full flex-[0_1_auto] items-end">
          {hiddenTabs.length > 0 ? (
            <HiddenTabsMenu
              tabs={hiddenTabs}
              onActivate={handleActivateHiddenTab}
            />
          ) : null}
          {/* The task tabs are non-editable chrome and dim while a layout
              session is live (4.2). The marker is on the scroller rather
              than on the strip root, which is an ancestor of the Home
              item's region.

              The `-members` spelling dims each tab rather than the
              scroller's own box, because one of those tabs is the
              session's own chrome: the sample workspace tab, which draws
              itself as the customizing mark (L-87, L-138). `opacity` on
              this box could not be undone below it, so the one mark that
              says "you are customizing" was drawn at 45% of itself
              (L-132). */}
          <div
            // Two owners, one node: dnd-kit's trailing drop slot, and the
            // reveal above, which needs the scrolling box itself.
            ref={setScrollerNode}
            data-layout-passive-members
            data-testid="header-tab-strip-scroll"
            data-strip-axis="x"
            data-strip-edge="top"
            onWheel={handleWheel}
            className="no-scrollbar flex min-w-0 max-w-full flex-[0_1_auto] touch-pan-x items-end overflow-x-auto overscroll-x-contain [-webkit-app-region:no-drag]"
          >
            {rows.map((row) => {
              const { itemId, stripIndex: index } = row;
              return (
                <Fragment key={itemId}>
                  {row.groupStart !== null ? (
                    <TabGroupChip
                      groupId={row.groupStart.groupId}
                      group={row.groupStart.group}
                      onClose={controller.onCloseGroup}
                    />
                  ) : null}
                  {!row.hidden ? (
                    <HeaderStripItemRenderer
                      itemId={itemId}
                      stripIndex={index}
                      offsetX={controller.offsets.get(itemId) ?? 0}
                      memberOffset={row.memberOffset}
                      isActive={itemId === activeItemId}
                      isNextActive={headerItemIds[index + 1] === activeItemId}
                      nextIsSplit={layoutItems[index + 1]?.kind === "split"}
                      isLastItem={index === headerItemIds.length - 1}
                      showDropIndicatorBefore={dropIndicatorIndex === index}
                      showDropIndicatorAfter={
                        dropIndicatorIndex === index + 1 &&
                        index === headerItemIds.length - 1
                      }
                      onClose={controller.onClose}
                      onCloseOtherTabs={controller.onCloseOtherTabs}
                      onDuplicateTab={controller.onDuplicateTab}
                      canCloseOtherTabs={controller.canCloseOtherTabs}
                      onOpenInNewWindow={controller.onOpenInNewWindow}
                      canOpenInNewWindow={controller.canOpenInNewWindow}
                      onSplitCommand={controller.onSplitCommand}
                      taskPinnedStates={controller.taskPinnedStates}
                      pendingSetPinnedEpicIds={
                        controller.pendingSetPinnedEpicIds
                      }
                      onSetTaskPinned={controller.onSetTaskPinned}
                    />
                  ) : null}
                </Fragment>
              );
            })}
          </div>
          <TabStripNewButton onNewTab={controller.onNewTab} />
        </div>
        {controller.dialogs}
      </div>
    </TabStripIndicatorScope>
  );
}

interface HeaderStripItemRendererProps {
  readonly itemId: string;
  readonly stripIndex: number;
  readonly offsetX: number;
  readonly memberOffset: number;
  // Passed as named booleans rather than packed into one positional string.
  // `memo` compares primitives, so five props cost the same as one - and a
  // packed string spread magic indices across two components, where a wrong
  // index is a silent visual bug no type check can catch.
  readonly isActive: boolean;
  readonly isNextActive: boolean;
  readonly nextIsSplit: boolean;
  readonly isLastItem: boolean;
  readonly showDropIndicatorBefore: boolean;
  readonly showDropIndicatorAfter: boolean;
  readonly onClose: (tab: HeaderTab) => void;
  readonly onCloseOtherTabs: (tab: HeaderTab) => void;
  readonly onDuplicateTab: (tab: HeaderTab) => void;
  readonly canCloseOtherTabs: boolean;
  readonly onOpenInNewWindow: (tab: HeaderTab) => void;
  readonly canOpenInNewWindow: boolean;
  readonly onSplitCommand: (id: TabSplitCommandId, tab: HeaderTab) => void;
  readonly taskPinnedStates: ReadonlyMap<string, TaskPinnedState>;
  readonly pendingSetPinnedEpicIds: ReadonlySet<string>;
  readonly onSetTaskPinned: (
    epicId: string,
    pinned: boolean,
    displayName: string,
  ) => void;
}

const HeaderStripItemRenderer = memo(function HeaderStripItemRenderer(
  props: HeaderStripItemRendererProps,
): ReactNode {
  const item = useAppearanceHeaderStripItem(props.itemId);
  const {
    isActive,
    isNextActive,
    nextIsSplit,
    isLastItem,
    showDropIndicatorBefore,
    showDropIndicatorAfter,
  } = props;
  if (item === null) return null;
  // Computed once, above the branch, because it applies to every strip item.
  // Restating it inside only the tab branch is what left a split group with no
  // trailing hairline, so the group-to-tab boundary rendered as a blank gap.
  const isSplitGroupBoundary = item.kind === "split" && nextIsSplit;
  const showSeparatorAfter =
    !isLastItem && (isSplitGroupBoundary || (!isActive && !isNextActive));
  if (item.kind === "split") {
    return (
      <SplitTabItem
        item={item}
        stripIndex={props.stripIndex}
        offsetX={props.offsetX}
        leftMemberIndex={props.memberOffset}
        rightMemberIndex={props.memberOffset + Number(item.left.kind === "tab")}
        isActive={isActive}
        showSeparatorAfter={showSeparatorAfter}
        showDropIndicatorBefore={showDropIndicatorBefore}
        showDropIndicatorAfter={showDropIndicatorAfter}
        onClose={props.onClose}
        onCloseOtherTabs={props.onCloseOtherTabs}
        onDuplicateTab={props.onDuplicateTab}
        canCloseOtherTabs={props.canCloseOtherTabs}
        onOpenInNewWindow={props.onOpenInNewWindow}
        canOpenInNewWindow={props.canOpenInNewWindow}
        onSplitCommand={props.onSplitCommand}
        taskPinnedStates={props.taskPinnedStates}
        pendingSetPinnedEpicIds={props.pendingSetPinnedEpicIds}
        onSetTaskPinned={props.onSetTaskPinned}
      />
    );
  }
  return (
    <HeaderStripTabItem
      itemId={item.id}
      tab={item.tab}
      index={props.memberOffset}
      stripIndex={props.stripIndex}
      offsetX={props.offsetX}
      isActive={isActive}
      showDropIndicatorBefore={showDropIndicatorBefore}
      showDropIndicatorAfter={showDropIndicatorAfter}
      showSeparatorAfter={showSeparatorAfter}
      onClose={props.onClose}
      onCloseOtherTabs={props.onCloseOtherTabs}
      onDuplicateTab={props.onDuplicateTab}
      canCloseOtherTabs={props.canCloseOtherTabs}
      onOpenInNewWindow={props.onOpenInNewWindow}
      canOpenInNewWindow={props.canOpenInNewWindow}
      onSplitCommand={props.onSplitCommand}
      taskPinnedStates={props.taskPinnedStates}
      pendingSetPinnedEpicIds={props.pendingSetPinnedEpicIds}
      onSetTaskPinned={props.onSetTaskPinned}
    />
  );
});

const HeaderStripTabItem = memo(function HeaderStripTabItem(props: {
  readonly itemId: string;
  readonly tab: HeaderTab;
  readonly index: number;
  readonly stripIndex: number;
  readonly offsetX: number;
  readonly isActive: boolean;
  readonly showDropIndicatorBefore: boolean;
  readonly showDropIndicatorAfter: boolean;
  readonly showSeparatorAfter: boolean;
  readonly onClose: (tab: HeaderTab) => void;
  readonly onCloseOtherTabs: (tab: HeaderTab) => void;
  readonly onDuplicateTab: (tab: HeaderTab) => void;
  readonly canCloseOtherTabs: boolean;
  readonly onOpenInNewWindow: (tab: HeaderTab) => void;
  readonly canOpenInNewWindow: boolean;
  readonly onSplitCommand: (id: TabSplitCommandId, tab: HeaderTab) => void;
  readonly taskPinnedStates: ReadonlyMap<string, TaskPinnedState>;
  readonly pendingSetPinnedEpicIds: ReadonlySet<string>;
  readonly onSetTaskPinned: (
    epicId: string,
    pinned: boolean,
    displayName: string,
  ) => void;
}): ReactNode {
  const pinRead = taskPinReadOf(
    props.tab,
    props.taskPinnedStates,
    props.pendingSetPinnedEpicIds,
  );
  const dnd = useMemo(
    () => ({
      stripItemId: props.itemId,
      index: props.stripIndex,
      isDropSlot: true,
    }),
    [props.itemId, props.stripIndex],
  );
  return (
    <TabItem
      tab={props.tab}
      index={props.index}
      dnd={dnd}
      chrome="own"
      includeMotionFrame
      offsetX={props.offsetX}
      isActive={props.isActive}
      showSeparatorAfter={props.showSeparatorAfter}
      showDropIndicatorBefore={props.showDropIndicatorBefore}
      showDropIndicatorAfter={props.showDropIndicatorAfter}
      onClose={props.onClose}
      onCloseOtherTabs={props.onCloseOtherTabs}
      onDuplicateTab={props.onDuplicateTab}
      canCloseOtherTabs={props.canCloseOtherTabs}
      onOpenInNewWindow={props.onOpenInNewWindow}
      canOpenInNewWindow={props.canOpenInNewWindow}
      onSplitCommand={props.onSplitCommand}
      taskPinnedState={pinRead.taskPinnedState}
      isTaskPinPending={pinRead.isTaskPinPending}
      onSetTaskPinned={props.onSetTaskPinned}
    />
  );
});
