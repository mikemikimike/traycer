import type { ReactNode } from "react";
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { HistoryNavButtons } from "@/components/layout/header/history-nav-buttons";
import { WINDOW_LEADING_INSET_CLASS } from "@/components/layout/header/title-bar-drag";
import { Button } from "@/components/ui/button";
import { TooltipWrapper } from "@/components/ui/tooltip-wrapper";
import type { EdgeSide } from "@/lib/layout/layout-arrangement";
import { cn } from "@/lib/utils";
import { TabStripNewButton } from "../tab-strip-new-button";
import { SideHomeRow } from "./side-home-row";
import type { SideTabRowVariant } from "./side-tab-row";
import { SIDE_STRIP_INSET_CLASS } from "./side-strip-tokens";

export interface SideStripTopBlockProps {
  readonly edge: EdgeSide;
  readonly variant: SideTabRowVariant;
  /** macOS with the strip at the left: the first row is the title bar (S-04). */
  readonly ownsTitleBar: boolean;
  /** The drag-region class for the title row, or `undefined` when not frameless. */
  readonly dragClass: string | undefined;
  readonly homeTabDrawn: boolean;
  readonly homeIsActive: boolean;
  readonly onHomeTab: () => void;
  readonly onNewTab: () => void;
  /** Collapses the strip to the rail or expands it, easing the width. */
  readonly onToggleCollapsed: () => void;
}

/**
 * What leads in the header, in the strip (S-03): history back and forward,
 * New task beside the collapse toggle (S-21), then Home. On macOS with the
 * strip at the left the first row is the title bar: a drag row that reserves
 * the traffic lights and puts the arrows right of them (S-04). Collapsed, it
 * is one centred column.
 */
export function SideStripTopBlock(props: SideStripTopBlockProps): ReactNode {
  const collapsed = props.variant === "collapsed";
  const controls = (
    <>
      <TabStripNewButton onNewTab={props.onNewTab} />
      <SideStripCollapseToggle
        edge={props.edge}
        collapsed={collapsed}
        onToggle={props.onToggleCollapsed}
      />
    </>
  );
  return (
    <div
      data-testid="side-strip-top-block"
      className="flex shrink-0 flex-col gap-1 pb-1"
    >
      {props.ownsTitleBar ? (
        // The title bar. Its empty space is the window's drag region; the
        // leading inset clears the traffic lights, and the collapsed rail is
        // never narrower than that inset.
        <div
          data-testid="side-strip-title-row"
          className={cn(
            "flex h-10 shrink-0 items-center",
            !collapsed && SIDE_STRIP_INSET_CLASS,
            WINDOW_LEADING_INSET_CLASS,
            props.dragClass,
          )}
        >
          {collapsed ? null : <FirstRow controls={controls} />}
        </div>
      ) : null}
      <div
        className={cn(
          "flex flex-col gap-1",
          collapsed ? "items-center" : SIDE_STRIP_INSET_CLASS,
          !props.ownsTitleBar && "pt-2",
        )}
      >
        {!props.ownsTitleBar && !collapsed ? (
          <FirstRow controls={controls} />
        ) : null}
        {collapsed ? <HistoryNavButtons orientation="column" /> : null}
        {props.homeTabDrawn ? (
          <SideHomeRow
            variant={props.variant}
            isActive={props.homeIsActive}
            onActivate={props.onHomeTab}
          />
        ) : null}
        {collapsed ? (
          <div className="flex flex-col items-center gap-1 [-webkit-app-region:no-drag]">
            {controls}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The expanded first row: the arrows at the start, New task and the toggle at the end. */
function FirstRow(props: { readonly controls: ReactNode }): ReactNode {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <HistoryNavButtons orientation="row" />
      <div aria-hidden className="min-w-0 flex-1" />
      <div className="flex shrink-0 items-center gap-1 [-webkit-app-region:no-drag]">
        {props.controls}
      </div>
    </div>
  );
}

const COLLAPSE_ICON: Record<
  EdgeSide,
  {
    readonly collapse: typeof PanelLeftClose;
    readonly expand: typeof PanelLeftOpen;
  }
> = {
  left: { collapse: PanelLeftClose, expand: PanelLeftOpen },
  right: { collapse: PanelRightClose, expand: PanelRightOpen },
};

/** Collapses the strip to the rail and back (S-07, S-20); the icon mirrors for a right strip. */
function SideStripCollapseToggle(props: {
  readonly edge: EdgeSide;
  readonly collapsed: boolean;
  readonly onToggle: () => void;
}): ReactNode {
  const label = props.collapsed ? "Expand tabs" : "Collapse tabs";
  const icons = COLLAPSE_ICON[props.edge];
  const Icon = props.collapsed ? icons.expand : icons.collapse;
  return (
    <TooltipWrapper
      label={label}
      side="bottom"
      sideOffset={undefined}
      align={undefined}
    >
      <Button
        type="button"
        variant="muted"
        size="icon-sm"
        aria-label={label}
        data-testid="side-tab-strip-collapse"
        data-layout-passive
        onClick={props.onToggle}
      >
        <Icon className="size-4" />
      </Button>
    </TooltipWrapper>
  );
}
