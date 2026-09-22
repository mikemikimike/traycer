import {
  useContext,
  useId,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { ChevronRight } from "lucide-react";
import type { HostNotificationsEntityRef } from "@traycer/protocol/host/notifications/contracts";
import { NotificationIndicatorsContext } from "@/components/notifications/notification-indicator-context";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useTitleBarDragSuppression } from "@/stores/layout/title-bar-drag-store";
import { useAppLocalNotificationsStore } from "@/stores/notifications/app-local-notifications-store";
import { selectNotificationIndicatorState } from "@/stores/notifications/notification-indicator-state";
import { useTabsStore } from "@/stores/tabs/store";
import type { TabGroup } from "@/stores/tabs/tab-groups";
import { TabGroupEditor } from "../tab-group-editor";
import { railBadgeOf, worstRailBadge } from "./rail-badge-kind";
import type { SideTabRowVariant } from "./side-tab-row";
import { firstGraphemes } from "./tab-monogram";
import { SideTabRailBadge } from "./side-tab-rail-badge";
import {
  SIDE_TAB_BADGE_POSITION_CLASS,
  SIDE_TAB_GROUP_COUNT_CLASS,
  SIDE_TAB_GROUP_HEADER_CLASS,
  SIDE_TAB_GROUP_PILL_CLASS,
  SIDE_TAB_HOVER_CLASS,
  SIDE_TAB_ROW_CLASS,
  SIDE_TAB_MONOGRAM_CLASS,
  SIDE_TAB_TILE_CLASS,
  SIDE_TAB_TILE_HOVER_CLASS,
  SIDE_TAB_TINT_FILL_CLASS,
} from "./side-strip-tokens";

export interface SideTabGroupHeaderProps {
  readonly groupId: string;
  readonly group: TabGroup;
  readonly variant: SideTabRowVariant;
  /** Tabs in this run of the group; a split counts each tab half. */
  readonly memberCount: number;
  /** Each member's notification entity, for a collapsed group's badge. */
  readonly memberEntities: ReadonlyArray<HostNotificationsEntityRef>;
  readonly onClose: (groupId: string) => void;
}

/**
 * A tab group in the vertical strip (S-19): a 28px row with the colour pill,
 * the name, the member count and a chevron on hover, or in the rail a 32px
 * tile with the name's first grapheme. A click collapses or expands the group;
 * right-click and the context-menu keys open the shared group editor. A
 * collapsed group carries its members' worst notification badge (S-30).
 */
export function SideTabGroupHeader(props: SideTabGroupHeaderProps): ReactNode {
  const { groupId, group } = props;
  const [editing, setEditing] = useState(false);
  // The editor can open over the strip's drag spacer (S-44).
  useTitleBarDragSuppression(`group-editor:${useId()}`, editing);
  const label = `${group.name || "Unnamed group"}: ${group.collapsed ? "expand" : "collapse"} group`;
  const toggle = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    useTabsStore
      .getState()
      .updateGroup(groupId, { collapsed: !group.collapsed });
  };
  const openEditor = (event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    setEditing(true);
  };
  const openEditorFromKeys = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (
      event.key === "F2" ||
      event.key === "ContextMenu" ||
      (event.shiftKey && event.key === "F10")
    ) {
      event.preventDefault();
      setEditing(true);
    }
  };
  const swatch = { "--side-tab-group-color": group.color } as CSSProperties;
  return (
    <Popover open={editing} onOpenChange={setEditing}>
      <PopoverAnchor asChild>
        <button
          type="button"
          aria-label={label}
          aria-expanded={!group.collapsed}
          data-testid={`side-tab-group-header-${groupId}`}
          data-collapsed={group.collapsed}
          onClick={toggle}
          onContextMenu={openEditor}
          onKeyDown={openEditorFromKeys}
          className={cn(
            "group/side-group relative flex shrink-0 items-center outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [-webkit-app-region:no-drag]",
            props.variant === "collapsed"
              ? cn(
                  SIDE_TAB_TILE_CLASS,
                  SIDE_TAB_TINT_FILL_CLASS,
                  SIDE_TAB_TILE_HOVER_CLASS,
                  "justify-center self-center",
                )
              : cn(
                  SIDE_TAB_ROW_CLASS,
                  SIDE_TAB_GROUP_HEADER_CLASS,
                  SIDE_TAB_HOVER_CLASS,
                  "text-muted-foreground hover:text-foreground",
                ),
          )}
          style={
            props.variant === "collapsed"
              ? ({ "--side-tab-tint": group.color } as CSSProperties)
              : undefined
          }
        >
          {props.variant === "collapsed" ? (
            <span aria-hidden className={SIDE_TAB_MONOGRAM_CLASS}>
              {firstGrapheme(group.name)}
            </span>
          ) : (
            <>
              <span
                className={cn(SIDE_TAB_GROUP_PILL_CLASS, "min-w-0 truncate")}
                style={swatch}
              >
                {group.name || " "}
              </span>
              <span
                data-testid="side-tab-group-count"
                className={SIDE_TAB_GROUP_COUNT_CLASS}
              >
                {props.memberCount}
              </span>
              <ChevronRight
                aria-hidden
                className={cn(
                  "ml-auto size-3 opacity-0 transition-opacity group-hover/side-group:opacity-100 group-focus-visible/side-group:opacity-100",
                  !group.collapsed && "rotate-90",
                )}
              />
            </>
          )}
          {group.collapsed ? (
            <CollapsedGroupBadge memberEntities={props.memberEntities} />
          ) : null}
        </button>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-fit max-w-xs">
        <TabGroupEditor
          groupId={groupId}
          group={group}
          onClose={props.onClose}
          onDone={() => setEditing(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

/**
 * A collapsed group's worst member notification, read from the strip's
 * indicator batch. Mounted only while the group is collapsed, so an expanded
 * header does not subscribe to the notifications store. Running is not rolled
 * up: activity is a per-epic subscription hook (S-30).
 */
function CollapsedGroupBadge(props: {
  readonly memberEntities: ReadonlyArray<HostNotificationsEntityRef>;
}): ReactNode {
  const indicators = useContext(NotificationIndicatorsContext);
  const byId = useAppLocalNotificationsStore((state) => state.byId);
  const badge = worstRailBadge(
    props.memberEntities.map((entity) =>
      railBadgeOf(
        selectNotificationIndicatorState({ byId }, entity, null, indicators),
        "idle",
      ),
    ),
  );
  if (badge === null) return null;
  return (
    <span className={cn(SIDE_TAB_BADGE_POSITION_CLASS, "pointer-events-none")}>
      <SideTabRailBadge kind={badge} testId="side-tab-group-badge" />
    </span>
  );
}

function firstGrapheme(name: string): string {
  return firstGraphemes(name, 1).join("").toLocaleUpperCase();
}
