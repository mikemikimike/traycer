import { useState } from "react";
import type { ComponentPropsWithRef, CSSProperties, ReactNode } from "react";
import { X } from "lucide-react";
import * as m from "motion/react-m";
import type { MergeSide } from "@/components/epic-canvas/dnd/strip-drag-model";
import { AgentSpinningDots } from "@/components/ui/agent-spinning-dots";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropLine } from "@/components/ui/drop-line";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SESSION_TAB_LABEL_CLASS } from "../header-tab-visual";
import { SideTabRailBadge } from "./side-tab-rail-badge";
import type { RailBadgeKind } from "./rail-badge-kind";
import {
  SIDE_TAB_ACTIVE_CLASS,
  SIDE_TAB_BADGE_POSITION_CLASS,
  SIDE_TAB_COLORLESS_TILE_CLASS,
  SIDE_TAB_GROUP_LINE_CLASS,
  SIDE_TAB_HOVER_CLASS,
  SIDE_TAB_LEADING_CLASS,
  SIDE_TAB_LEADING_TILE_CLASS,
  SIDE_TAB_MONOGRAM_CLASS,
  SIDE_TAB_ROW_CLASS,
  SIDE_TAB_SESSION_ACTIVE_CLASS,
  SIDE_TAB_TILE_ACTIVE_CLASS,
  SIDE_TAB_TILE_CLASS,
  SIDE_TAB_TILE_HOVER_CLASS,
  SIDE_TAB_TINT_FILL_CLASS,
  SIDE_TAB_TITLE_CLASS,
  SIDE_TAB_TRAILING_CLASS,
} from "./side-strip-tokens";
export type SideTabRowVariant = "expanded" | "collapsed";

/** What a collapsed row's tile shows. */
export type SideTabTile =
  | { readonly kind: "icon"; readonly icon: ReactNode }
  | { readonly kind: "monogram"; readonly text: string }
  | { readonly kind: "generating" };

export interface SideTabRowClose {
  /** "Close <title>". */
  readonly label: string;
  /** `tab-close-<kind>-<id>`. */
  readonly testId: string;
  readonly disabled: boolean;
  readonly onClose: () => void;
}

export interface SideTabRowProps {
  /**
   * The row element's own props (role, aria, data-*, handlers, ref, drag
   * listeners), spread onto it. No `style`: the row's inline style is its
   * tint alone, and a strip moves a row through the frame around it.
   */
  readonly frame: Omit<ComponentPropsWithRef<"div">, "style">;
  readonly variant: SideTabRowVariant;
  readonly active: boolean;
  /** Set only on the sample-workspace tab: its session state (L-163). */
  readonly session: "active" | "rest" | null;
  /** The tab colour, `#rrggbb`. */
  readonly tint: string | null;
  /** The group colour. */
  readonly groupLine: string | null;
  /**
   * Expanded: the status glyph, shown alone in the leading slot when the tab
   * has neither a custom icon nor a colour.
   */
  readonly leading: ReactNode;
  /**
   * The tab's tile: the collapsed row's content, and in the expanded row's
   * leading slot a custom icon, or a monogram when the tab has a colour.
   */
  readonly tile: SideTabTile;
  /** The status badge on whichever tile is shown. */
  readonly badge: RailBadgeKind | null;
  /**
   * The title. A string is painted as one faded line with `titleText` as its
   * tooltip; any other node (the rename input) is rendered as given.
   */
  readonly title: ReactNode;
  /** The full title for the tooltip and the collapsed hover card. */
  readonly titleText: string;
  readonly leaderBadge: ReactNode | null;
  readonly close: SideTabRowClose | null;
  readonly waitingLabel: "Approve" | "Reply" | null;
  readonly dropIndicator: "before" | "after" | null;
  /** `"left"` highlights the top half, `"right"` the bottom half. */
  readonly pairPreview: MergeSide | null;
  readonly dragSource: boolean;
}

/** Shows a hidden trailing control while the row is hovered or holds keyboard focus. */
const REVEAL_CLASS =
  "pointer-events-none opacity-0 group-hover/side-tab:pointer-events-auto group-hover/side-tab:opacity-100 group-focus-visible/side-tab:pointer-events-auto group-focus-visible/side-tab:opacity-100 group-has-[:focus-visible]/side-tab:pointer-events-auto group-has-[:focus-visible]/side-tab:opacity-100";

/** Hides the waiting chip while the close button takes its place. */
const YIELD_TO_CLOSE_CLASS =
  "group-hover/side-tab:opacity-0 group-focus-visible/side-tab:opacity-0 group-has-[:focus-visible]/side-tab:opacity-0";

/** Whether a tile paints the tab colour: a coloured tab whose title is not still generating. */
function tileTinted(tint: string | null, tile: SideTabTile): tint is string {
  return tint !== null && tile.kind !== "generating";
}

/**
 * One tab in the vertical strip, as paint only: behaviour arrives through
 * `frame` and the state props. Expanded, the inline order is leading, title,
 * trailing on either strip edge; collapsed, the row is the 32px tile itself.
 */
export function SideTabRow(props: SideTabRowProps) {
  const { frame } = props;
  const collapsed = props.variant === "collapsed";
  const sessionActive = props.session === "active";
  const tinted = collapsed && tileTinted(props.tint, props.tile);
  return (
    <SideTabRowHoverCard
      allowed={hoverCardAllowed(props)}
      titleText={props.titleText}
    >
      <div
        {...frame}
        data-side-tab={props.variant}
        data-active={props.active}
        data-tile-kind={collapsed ? props.tile.kind : undefined}
        data-tinted={collapsed ? tinted : undefined}
        className={cn(
          "group/side-tab relative flex items-center outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50",
          collapsed
            ? cn(SIDE_TAB_TILE_CLASS, "shrink-0 justify-center self-center")
            : SIDE_TAB_ROW_CLASS,
          collapsed
            ? collapsedFill(props, tinted)
            : expandedFill(props.active, sessionActive),
          props.dragSource && "opacity-0",
          frame.className,
        )}
        style={
          tinted
            ? ({ "--side-tab-tint": props.tint } as CSSProperties)
            : undefined
        }
      >
        {props.groupLine === null ? null : (
          <span
            aria-hidden
            data-testid="side-tab-group-line"
            className={cn(
              SIDE_TAB_GROUP_LINE_CLASS,
              "pointer-events-none absolute bg-(--side-tab-group-line)",
            )}
            style={
              { "--side-tab-group-line": props.groupLine } as CSSProperties
            }
          />
        )}
        {props.session === null ? null : (
          <SideSessionMark session={props.session} tint={props.tint} />
        )}
        {collapsed ? (
          <>
            <TileContent tile={props.tile} />
            <CornerBadge badge={props.badge} />
          </>
        ) : (
          <ExpandedContent {...props} />
        )}
        <SideTabDropIndicator side={props.dropIndicator} />
        <SideTabPairPreview side={props.pairPreview} />
      </div>
    </SideTabRowHoverCard>
  );
}

/**
 * Only a collapsed row has a hover card, and it stays shut on a row a drag is
 * from or over.
 */
function hoverCardAllowed(props: SideTabRowProps): boolean {
  return (
    props.variant === "collapsed" &&
    !props.dragSource &&
    props.dropIndicator === null &&
    props.pairPreview === null
  );
}

function SideTabDropIndicator(props: {
  readonly side: SideTabRowProps["dropIndicator"];
}) {
  if (props.side === null) return null;
  return (
    <m.span
      aria-hidden
      data-testid="tab-drop-indicator"
      data-side={props.side}
      initial={{ opacity: 0, scaleX: 0.45 }}
      animate={{ opacity: 1, scaleX: 1 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className={cn(
        "pointer-events-none absolute inset-x-2 z-20 origin-center",
        props.side === "before" ? "-top-0.5" : "-bottom-0.5",
      )}
    >
      <DropLine
        orientation="horizontal"
        glow={false}
        className="w-full"
        testId={undefined}
      />
    </m.span>
  );
}

function SideTabPairPreview(props: {
  readonly side: SideTabRowProps["pairPreview"];
}) {
  if (props.side === null) return null;
  return (
    <span
      aria-hidden
      data-testid="side-tab-pair-preview"
      data-side={props.side}
      className={cn(
        "pointer-events-none absolute inset-x-1 z-30 rounded-sm bg-primary/20 ring-2 ring-primary",
        props.side === "left" ? "top-1 bottom-1/2" : "top-1/2 bottom-1",
      )}
    />
  );
}

function expandedFill(active: boolean, sessionActive: boolean): string {
  if (sessionActive) {
    return cn(SIDE_TAB_SESSION_ACTIVE_CLASS, SESSION_TAB_LABEL_CLASS);
  }
  if (active) return cn(SIDE_TAB_ACTIVE_CLASS, "text-foreground");
  return cn(
    SIDE_TAB_HOVER_CLASS,
    "text-muted-foreground hover:text-foreground",
  );
}

/** The collapsed tile's fill is its own colour; active and hover are an inset ring on it. */
function collapsedFill(props: SideTabRowProps, tinted: boolean): string {
  return cn(
    collapsedTileFill(props.session === "active", tinted),
    props.active
      ? SIDE_TAB_TILE_ACTIVE_CLASS
      : cn(
          SIDE_TAB_TILE_HOVER_CLASS,
          "text-muted-foreground hover:text-foreground",
        ),
  );
}

function collapsedTileFill(sessionActive: boolean, tinted: boolean): string {
  if (sessionActive) {
    return cn(SIDE_TAB_SESSION_ACTIVE_CLASS, SESSION_TAB_LABEL_CLASS);
  }
  return tinted ? SIDE_TAB_TINT_FILL_CLASS : SIDE_TAB_COLORLESS_TILE_CLASS;
}

/**
 * The layout session marker (L-163). At rest it paints the cap down the
 * inline-start edge; filled, it paints nothing and stays in the tree so the
 * dim exemption's `:has([data-layout-session-tab])` keeps the row lit.
 */
function SideSessionMark(props: {
  readonly session: "active" | "rest";
  readonly tint: string | null;
}) {
  return (
    <span
      aria-hidden
      data-layout-session-tab={props.session === "active" ? "filled" : "rest"}
      data-orientation="vertical"
      className="pointer-events-none absolute inset-y-1 start-0 rounded-full"
      style={
        props.tint === null
          ? undefined
          : ({ "--layout-session-tab-color": props.tint } as CSSProperties)
      }
    />
  );
}

function CornerBadge(props: { readonly badge: RailBadgeKind | null }) {
  if (props.badge === null) return null;
  return (
    <span className={cn(SIDE_TAB_BADGE_POSITION_CLASS, "pointer-events-none")}>
      <SideTabRailBadge kind={props.badge} testId="side-tab-rail-badge" />
    </span>
  );
}

/**
 * The fixed 16px leading slot: a custom icon, or a coloured tab's monogram, on
 * a 16px tile carrying the status as a corner badge; otherwise the status
 * glyph alone.
 */
function LeadingSlot(props: SideTabRowProps) {
  const tile = props.tile;
  const showTile =
    tile.kind === "icon" || (tile.kind === "monogram" && props.tint !== null);
  if (!showTile) {
    return (
      <span
        data-testid="side-tab-leading"
        data-leading="glyph"
        className={cn(
          SIDE_TAB_LEADING_CLASS,
          "flex shrink-0 items-center justify-center",
        )}
      >
        {props.leading}
      </span>
    );
  }
  const tinted = tileTinted(props.tint, tile);
  return (
    <span
      data-testid="side-tab-leading"
      data-leading="tile"
      className={cn(SIDE_TAB_LEADING_CLASS, "relative flex shrink-0")}
    >
      <span
        data-testid="side-tab-leading-tile"
        data-tinted={tinted}
        className={cn(
          SIDE_TAB_LEADING_TILE_CLASS,
          "flex items-center justify-center overflow-hidden",
          tinted ? SIDE_TAB_TINT_FILL_CLASS : SIDE_TAB_COLORLESS_TILE_CLASS,
        )}
        style={
          tinted
            ? ({ "--side-tab-tint": props.tint } as CSSProperties)
            : undefined
        }
      >
        {tile.kind === "icon" ? (
          tile.icon
        ) : (
          <span aria-hidden>{tile.text}</span>
        )}
      </span>
      <CornerBadge badge={props.badge} />
    </span>
  );
}

function ExpandedContent(props: SideTabRowProps) {
  return (
    <>
      <LeadingSlot {...props} />
      <span
        data-testid="side-tab-title"
        className={cn(SIDE_TAB_TITLE_CLASS, "flex min-w-0 flex-1 items-center")}
      >
        {typeof props.title === "string" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block min-w-0 flex-1">
                <span className="header-tab-title-text">{props.title}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>{props.titleText}</TooltipContent>
          </Tooltip>
        ) : (
          props.title
        )}
      </span>
      <span
        data-testid="side-tab-trailing"
        className={cn(
          SIDE_TAB_TRAILING_CLASS,
          "grid shrink-0 items-center justify-items-end",
        )}
      >
        <TrailingContent
          active={props.active}
          leaderBadge={props.leaderBadge}
          close={props.close}
          waitingLabel={props.waitingLabel}
        />
      </span>
    </>
  );
}

/**
 * First match wins: the leader badge; the close button, always on the active
 * row and on hover or keyboard focus elsewhere; the waiting chip. The chip and
 * a hidden close share one grid cell so revealing the close swaps them in place.
 */
function TrailingContent(props: {
  readonly active: boolean;
  readonly leaderBadge: ReactNode | null;
  readonly close: SideTabRowClose | null;
  readonly waitingLabel: "Approve" | "Reply" | null;
}) {
  if (props.leaderBadge !== null) return props.leaderBadge;
  const close = props.close;
  const showChip =
    props.waitingLabel !== null && !(close !== null && props.active);
  return (
    <>
      {showChip ? (
        <span
          className={cn(
            "col-start-1 row-start-1 flex",
            close !== null && YIELD_TO_CLOSE_CLASS,
          )}
        >
          <Badge variant="warning" data-testid="side-tab-waiting-chip">
            {props.waitingLabel}
          </Badge>
        </span>
      ) : null}
      {close === null ? null : (
        <span
          data-revealed={props.active ? "always" : "on-hover-or-focus"}
          className={cn(
            "col-start-1 row-start-1 flex",
            !props.active && REVEAL_CLASS,
          )}
        >
          <Button
            type="button"
            size="icon-sm"
            variant="muted"
            aria-label={close.label}
            data-testid={close.testId}
            disabled={close.disabled}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              close.onClose();
            }}
            className="size-5"
          >
            <X className="size-3" />
          </Button>
        </span>
      )}
    </>
  );
}

function TileContent(props: { readonly tile: SideTabTile }) {
  switch (props.tile.kind) {
    case "icon":
      return props.tile.icon;
    case "monogram":
      return (
        <span aria-hidden className={SIDE_TAB_MONOGRAM_CLASS}>
          {props.tile.text}
        </span>
      );
    case "generating":
      return (
        <AgentSpinningDots
          className="size-3.5"
          testId="side-tab-tile-generating"
          variant="dots2"
          tone="muted"
        />
      );
  }
}

/**
 * The collapsed row's full title, on the side facing the content: left of a
 * right-edge strip, right of anything else. The edge is read from the
 * scroller's `data-strip-edge` as the pointer or focus arrives. Always
 * mounted, so switching variants keeps the row element; closed whenever it is
 * not allowed (expanded, or the row is part of a drag).
 */
function SideTabRowHoverCard(props: {
  readonly allowed: boolean;
  readonly titleText: string;
  readonly children: ReactNode;
}) {
  const [side, setSide] = useState<"left" | "right">("right");
  const [open, setOpen] = useState(false);
  const readSide = (event: { readonly currentTarget: Element }) => {
    const edge = event.currentTarget
      .closest("[data-strip-edge]")
      ?.getAttribute("data-strip-edge");
    setSide(edge === "right" ? "left" : "right");
  };
  return (
    <HoverCard
      open={props.allowed ? open : false}
      onOpenChange={(next) => setOpen(next && props.allowed)}
    >
      <HoverCardTrigger asChild onPointerEnter={readSide} onFocus={readSide}>
        {props.children}
      </HoverCardTrigger>
      <HoverCardContent
        appearance="tooltip"
        side={side}
        align="center"
        data-testid="side-tab-hover-card"
        className="px-3 py-1.5 text-ui-xs"
      >
        {props.titleText}
      </HoverCardContent>
    </HoverCard>
  );
}
