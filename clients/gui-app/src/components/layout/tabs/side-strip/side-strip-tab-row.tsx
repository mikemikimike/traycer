import type { ReactNode } from "react";
import { useTopLevelStripPairPreview } from "@/components/epic-canvas/dnd/dnd-store";
import { LeaderDigitBadge } from "@/components/ui/leader-digit-badge";
import { leaderDigitFor } from "@/components/ui/leader-digit-shortcuts";
import { useEpicActivityStatus } from "@/hooks/epic/use-epic-activity-status";
import { useRegisteredEpicTitleGenerating } from "@/lib/epic-selectors";
import type { EdgeSide } from "@/lib/layout/layout-arrangement";
import type { HeaderTab } from "@/stores/tabs/types";
import {
  StripTabContextMenu,
  StripTabTitleInput,
} from "../strip-tab-item-parts";
import { TabLeadingIcon } from "../tab-leading-icon";
import { sideTabWaitingLabel } from "../tab-waiting";
import type { StripTabItem, StripTabItemInput } from "../use-strip-tab-item";
import { useSideTabLiveAgents } from "./side-tab-live-agents";
import { railBadgeOf } from "./rail-badge-kind";
import type { DropIndicator } from "./side-strip-item-input";
import { SIDE_TAB_TITLE_INPUT_CLASS } from "./side-strip-tokens";
import {
  SideTabRow,
  type SideGroupLine,
  type SideTabRowVariant,
} from "./side-tab-row";
import { SideTabHoverCardBody } from "./side-tab-hover-card";
import { joinedAttribute } from "./side-tab-join";
import { sideTabTileOf, tabAutoTint } from "../tab-identity";

/**
 * One task tab's row over its `useStripTabItem` result, inside the tab's own
 * menu. The menu's trigger is a box-less wrapper, because the row takes its
 * element props through `frame` rather than as its own props.
 */
export function SideStripTabRow(props: {
  readonly item: Omit<StripTabItem, "rootRef">;
  readonly rootRef: (node: HTMLDivElement | null) => void;
  readonly input: StripTabItemInput;
  readonly variant: SideTabRowVariant;
  readonly groupLine: SideGroupLine | null;
  readonly dropIndicator: DropIndicator;
  /** The edge this row joins its panel sheet on (D3); `null` for a plain row. */
  readonly joined: EdgeSide | null;
}): ReactNode {
  const { item, input, rootRef } = props;
  const { tab, isActive } = input;
  const epicId = tab.kind === "epic" ? tab.epicId : null;
  const activityStatus = useEpicActivityStatus(epicId);
  const titleGenerating = useRegisteredEpicTitleGenerating(epicId);
  const pairPreview = useTopLevelStripPairPreview(tab.kind, tab.id);
  const agents = useSideTabLiveAgents(epicId);
  const badge = railBadgeOf(item.indicatorState);
  // The bare status glyph: the custom icon, when there is one, is the tile.
  const leading = (
    <TabLeadingIcon
      icon={tab.icon}
      identity={null}
      titleGenerationPending={titleGenerating}
      activityStatus={activityStatus}
      indicatorState={item.indicatorState}
      tabId={tab.id}
      statusPresentation="glyph"
    />
  );
  return (
    <StripTabContextMenu item={item} input={input}>
      <div className="contents">
        <SideTabRow
          frame={{
            ...item.dragListeners,
            ...item.rootProps,
            ...joinedAttribute(props.joined),
            ref: rootRef,
            className: "cursor-pointer [-webkit-app-region:no-drag]",
          }}
          variant={props.variant}
          active={isActive}
          session={sessionOf(tab, isActive)}
          tint={item.appearance?.color ?? null}
          autoTint={epicId === null ? null : tabAutoTint(epicId)}
          groupLine={props.groupLine}
          leading={leading}
          tile={sideTabTileOf({
            appearance: item.appearance,
            title: item.displayTab.name,
            titleGenerating,
            fallback: leading,
          })}
          badge={badge}
          agents={agents}
          title={
            item.rename.isEditing ? (
              <StripTabTitleInput
                item={item}
                tab={tab}
                className={SIDE_TAB_TITLE_INPUT_CLASS}
              />
            ) : (
              item.displayName
            )
          }
          hoverCardBody={
            <SideTabHoverCardBody
              title={item.displayName}
              epicId={epicId}
              badge={badge}
              agents={agents}
            />
          }
          leaderBadge={
            item.leaderBadge === null ? null : (
              <LeaderDigitBadge
                digit={leaderDigitFor(item.leaderBadge.index)}
                modifier={item.leaderBadge.modifier}
                ariaLabel={item.leaderBadge.hint}
                testId={`tab-digit-${leaderDigitFor(item.leaderBadge.index)}`}
                className={undefined}
              />
            )
          }
          close={{
            label: `Close ${item.displayName}`,
            testId: `tab-close-${tab.kind}-${tab.id}`,
            disabled: !item.canClose,
            onClose: item.close,
          }}
          waitingLabel={sideTabWaitingLabel(item.waitingReason)}
          dropIndicator={props.dropIndicator}
          pairPreview={pairPreview}
          dragSource={item.isDragging}
        />
      </div>
    </StripTabContextMenu>
  );
}

/** The layout session's own tab (L-163): filled while active, capped at rest. */
function sessionOf(
  tab: HeaderTab,
  isActive: boolean,
): "active" | "rest" | null {
  if (tab.kind !== "sample-workspace") return null;
  return isActive ? "active" : "rest";
}
