import type { CSSProperties } from "react";
import type { ReactNode } from "react";
import { useSurfaceNotificationIndicatorState } from "@/components/notifications/notification-indicator-context";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useEpicActivityStatus } from "@/hooks/epic/use-epic-activity-status";
import { useRegisteredEpicTitleGenerating } from "@/lib/epic-selectors";
import { SplitMemberChrome } from "./split-tab-chrome";
import { TabChromeBackground } from "./tab-chrome-background";
import { useHeaderTabTitle } from "./header-tab-presentation";
import {
  tabAppearance,
  type HeaderTab,
  type HeaderTabAppearance,
} from "@/stores/tabs/types";
import type { NotificationIndicatorState } from "@/stores/notifications/notification-indicator-state";
import type { HeaderTabDragGhost } from "@/components/epic-canvas/dnd/dnd-store";
import { TabLeadingIcon } from "./tab-leading-icon";

interface HeaderTabVisualProps {
  readonly tab: HeaderTab;
  readonly appearance: HeaderTabAppearance | null;
  readonly indicatorState: NotificationIndicatorState;
  readonly displayName: string;
  readonly chrome: "own" | "member";
  readonly isActive: boolean;
  readonly titleControl: ReactNode;
  readonly trailingControl: ReactNode;
  readonly leaderVisible: boolean;
}

/** Shared tab paint; activation, drag registration and controls belong to callers. */
export function HeaderTabVisual(props: HeaderTabVisualProps) {
  const epicId = props.tab.kind === "epic" ? props.tab.epicId : null;
  const titleGenerationPending = useRegisteredEpicTitleGenerating(epicId);
  const activityStatus = useEpicActivityStatus(epicId);
  const color = props.appearance?.color ?? null;
  const sessionColor = props.tab.kind === "sample-workspace" ? color : null;
  return (
    <>
      {props.chrome === "own" ? (
        <TabChrome
          isActive={props.isActive}
          color={color}
          session={sessionColor !== null}
        />
      ) : (
        <SplitMemberChrome focused={props.isActive} color={color} />
      )}
      {sessionColor === null ? null : (
        <SessionTabMark color={sessionColor} isActive={props.isActive} />
      )}
      <span className="relative z-20 flex min-w-0 flex-1 items-center justify-center gap-1.5 outline-none group-data-[tab-layout=shrink]/strip:overflow-hidden">
        <TabLeadingIcon
          icon={props.tab.icon}
          identity={props.appearance}
          titleGenerationPending={titleGenerationPending}
          activityStatus={activityStatus}
          indicatorState={props.indicatorState}
          tabId={props.tab.id}
        />
        {props.titleControl ?? (
          <span
            className="header-tab-label relative flex min-w-0 flex-1 items-center gap-1.5 text-left"
            data-leader-visible={props.leaderVisible}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="block min-w-0 flex-1">
                  <span
                    data-testid={`tab-title-${props.tab.kind}-${props.tab.id}`}
                    className="header-tab-title block"
                  >
                    <span className="header-tab-title-text">
                      {props.displayName}
                    </span>
                  </span>
                </span>
              </TooltipTrigger>
              <TooltipContent>{props.displayName}</TooltipContent>
            </Tooltip>
            {props.trailingControl}
          </span>
        )}
      </span>
    </>
  );
}

/**
 * The marker on the one tab that is a MODE rather than a place (L-87): while
 * the sample workspace tab is open the user is customizing the layout, and
 * this is the editor's own chrome rather than another tab's colour.
 *
 * `data-layout-session-tab` is the half `layout-editor.css` reads, and it is
 * the reason this element exists at all: the tab strip's scroller dims its
 * members while a session is live, and the member holding this marker is the
 * one that stays lit. Without it the one signal that says "you are
 * customizing" was drawn at 45% opacity and 45% saturation (L-132). `:has()`
 * matches a `display: none` element, so one marker covers both states.
 *
 * What it PAINTS depends on the state, because only one of the two leaves it
 * anything to draw (L-138). At rest - the user clicked another tab mid-session
 * - the tab wears the colour as a cap along its bottom edge, and this is that
 * cap. Active, the tab's own silhouette is the mark: `TabChrome` fills the
 * real S-curved shape with `--layout-session-tab-fill` and outlines it in the
 * same token, so there is no second decoration to add and this element paints
 * nothing.
 */
function SessionTabMark(props: {
  readonly color: string;
  readonly isActive: boolean;
}) {
  return (
    <span
      aria-hidden
      // The state names itself and `layout-editor.css` paints it, beside the
      // dim rule that reads this same attribute. The tab's colour is the one
      // runtime value here, so it travels as a custom property and every fill
      // is a rule rather than a string built in JS.
      data-layout-session-tab={props.isActive ? "filled" : "rest"}
      className="pointer-events-none absolute inset-x-0 bottom-0"
      style={{ "--layout-session-tab-color": props.color } as CSSProperties}
    />
  );
}

export function HeaderTabPreview(props: {
  readonly tab: HeaderTab;
  readonly ghost: HeaderTabDragGhost | null;
  readonly chrome: "own" | "member";
  readonly isActive: boolean;
}) {
  const { displayName } = useHeaderTabTitle(props.tab);
  const indicatorState = useSurfaceNotificationIndicatorState(
    { epicId: props.tab.kind === "epic" ? props.tab.epicId : props.tab.id },
    null,
  );
  return (
    <HeaderTabVisual
      {...props}
      appearance={
        props.ghost === null ? tabAppearance(props.tab) : props.ghost.appearance
      }
      indicatorState={props.ghost?.indicatorState ?? indicatorState}
      displayName={displayName}
      titleControl={null}
      trailingControl={null}
      leaderVisible={false}
    />
  );
}

export function SplitFillableMemberVisual(props: {
  readonly label: string;
  readonly focused: boolean;
}) {
  return (
    <>
      <SplitMemberChrome focused={props.focused} color={null} />
      <span className="header-tab-title-text relative z-20 min-w-0 flex-1 text-left italic">
        {props.label}
      </span>
    </>
  );
}

export function TabChrome(props: {
  readonly isActive: boolean;
  readonly color: string | null;
  /**
   * The layout editor's own tab (L-87). It is the one tab whose colour is a
   * MODE rather than an identity, so it is the one tab that fills its
   * silhouette instead of merely outlining it - and the one whose bottom edge
   * is drawn by `SessionTabMark` rather than here, so the two do not stack two
   * bars of the same colour on one edge.
   */
  readonly session: boolean;
}) {
  if (!props.isActive) {
    return (
      <>
        {props.color !== null && !props.session ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[1.5px] bg-[var(--swatch)]"
            style={{ "--swatch": props.color } as CSSProperties}
          />
        ) : null}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-2 inset-y-1 rounded-md bg-accent/45 opacity-0 transition-opacity duration-150 ease-out group-focus-visible/tab:opacity-100 group-has-[:focus-visible]/tab:opacity-100 group-hover/tab:opacity-100"
        />
      </>
    );
  }
  return (
    <TabChromeBackground
      // The editor's tab is FILLED, which is the whole of the redesigned
      // signal (L-138): the frame around the screen is a hollow amber outline
      // and this is the one solid amber object inside it, both struck from
      // `--warning-foreground`. The fill lands on the tab's real silhouette -
      // S-curved caps, top border and baseline cover together - instead of an
      // inner rectangle floating inside it, which is what read as a rendering
      // bug. The fallback keeps a plain tab if `layout-editor.css` has not
      // loaded yet, rather than an invalid colour.
      fill={
        props.session
          ? "var(--layout-session-tab-fill, var(--color-background))"
          : "var(--color-background)"
      }
      borderColor={props.color ?? "var(--color-border)"}
      coversBaseline
      className="transition-opacity duration-300 ease-spring"
    />
  );
}
