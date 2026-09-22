import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  History,
  House,
  PanelLeft,
  Plus,
} from "lucide-react";
import {
  depictDockRows,
  depictRegion,
} from "@/components/layout-editor/region-depiction";
import {
  barClusterRegions,
  type BarHost,
  type BarRegionId,
  type EdgeSide,
  type LayoutArrangement,
} from "@/lib/layout/layout-arrangement";
import type { LayoutValues } from "@/lib/layout/layout-values";
import { railDisplayEntries } from "@/lib/layout/rail";
import { LeftPanelRailStack } from "@/components/epic-canvas/sidebar/left-panel-rail-stack";
import {
  SIDE_STRIP_LIST_CLASS,
  SIDE_TAB_ACTIVE_CLASS,
  SIDE_TAB_LEADING_CLASS,
  SIDE_TAB_ROW_CLASS,
  SIDE_TAB_TITLE_CLASS,
} from "@/components/layout/tabs/side-strip/side-strip-tokens";
import type {
  RailRegionId,
  RegionId,
  ToolbarRegionId,
} from "@/lib/layout/region-id";
import { cn } from "@/lib/utils";

/**
 * The app's frame around the regions, in one copy.
 *
 * Two surfaces draw a picture of the app: the preset cards, which are a whole
 * scaled window (L-43), and the Settings page's surface specimens, which are
 * one surface at 1:1 (L-95). Everything in them that is NOT a region - the tab
 * labels, the header's icon cluster, the composer's box and its two toolbar
 * clusters, the rail's dividers, and the dock's split into pills above one
 * joined frame - existed twice, so the next change to the composer's shape had
 * to be made in two files or the two pictures disagreed about what the app
 * looks like (R1-04). They had already drifted: the two drew the header's
 * resource monitor in different host frames, and only one of them tucked the
 * dock under the composer.
 *
 * What stays with each caller is PLACEMENT - the miniature draws these inside
 * a 1000x620 frame with the app's own bars and paddings, the specimen draws
 * one of them on a stage - so nothing here takes a size or a padding. The one
 * flag is `AppFrameTabEntries`' `layout`: the tab entries are chrome whose
 * orientation IS the placement, not a size choice a caller makes.
 */
export interface AppFrame {
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}

/** The tabs beside the home tab, which are chrome rather than regions. */
const APP_FRAME_TABS: ReadonlyArray<{
  readonly label: string;
  readonly active: boolean;
}> = [
  { label: "Start page", active: false },
  { label: "Sample chat", active: true },
];

/**
 * The top bar's row, minus the row itself: its two clusters, the home tab, the
 * tab strip and the header's own glyphs.
 *
 * A reading that named the header draws in the end it named (L-156), as
 * `HeaderBarCluster` renders it: left of the tabs or right of them, framed as
 * the top bar.
 *
 * Drawn with their real labels, because two blank rectangles are not a picture
 * of a top bar (I-03).
 */
export function AppFrameTopBar({ values, arrangement }: AppFrame): ReactNode {
  return (
    <>
      <AppFrameBarCluster
        host="header"
        side="left"
        values={values}
        arrangement={arrangement}
      />
      <AppFrameTabEntries
        values={values}
        arrangement={arrangement}
        layout="row"
      />
      <span className="flex-1" />
      <AppFrameBarCluster
        host="header"
        side="right"
        values={values}
        arrangement={arrangement}
      />
      <History aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <Bell aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="size-5 shrink-0 rounded-full border border-border bg-foreground/10" />
    </>
  );
}

/**
 * The fake tabs, as a horizontal row (the top bar, alongside Home) or a
 * vertical column of rows (a side strip, where Home draws separately as its
 * own full row - `AppFrameSideHomeRow`).
 *
 * The row layout is the top bar's original markup, untouched, so `top` keeps
 * drawing exactly what it drew before this split. The column layout sizes its
 * rows from `side-strip-tokens.ts`, the strip's own proportions: a leading
 * slot, then the title at the row's own text size, nothing invented.
 */
export function AppFrameTabEntries({
  values,
  arrangement,
  layout,
}: AppFrame & { readonly layout: "row" | "column" }): ReactNode {
  if (layout === "column") {
    return (
      <div className={SIDE_STRIP_LIST_CLASS}>
        {APP_FRAME_TABS.map((tab) => (
          <span
            key={tab.label}
            className={cn(
              "flex items-center text-muted-foreground",
              SIDE_TAB_ROW_CLASS,
              tab.active && cn("text-foreground", SIDE_TAB_ACTIVE_CLASS),
            )}
          >
            <span
              aria-hidden
              className={cn(
                SIDE_TAB_LEADING_CLASS,
                "shrink-0 rounded-full bg-foreground/10",
              )}
            />
            <span className={cn(SIDE_TAB_TITLE_CLASS, "truncate")}>
              {tab.label}
            </span>
          </span>
        ))}
      </div>
    );
  }
  return (
    <>
      <AppFrameRegion
        regionId="homeTab"
        values={values}
        arrangement={arrangement}
      />
      {APP_FRAME_TABS.map((tab) => (
        <span
          key={tab.label}
          className={cn(
            "flex h-7 shrink-0 items-center rounded-sm px-2.5 text-ui-sm text-muted-foreground",
            tab.active &&
              "border border-border bg-foreground/5 text-foreground",
          )}
        >
          {tab.label}
        </span>
      ))}
    </>
  );
}

/**
 * Home in the side strip: a full row with a house glyph and its label, the
 * shape `SideHomeRow` draws (ticket 11), rather than the top strip's
 * icon-only item stretched by the column.
 *
 * Gated on the same `homeTab` region value the top bar reads, so hiding Home
 * removes this row exactly as it removes the top bar's.
 */
function AppFrameSideHomeRow(props: {
  readonly values: LayoutValues;
}): ReactNode {
  if (props.values.homeTab.shown !== "shown") return null;
  return (
    <span
      className={cn(
        "flex items-center text-muted-foreground",
        SIDE_TAB_ROW_CLASS,
      )}
    >
      <House aria-hidden className={cn(SIDE_TAB_LEADING_CLASS, "shrink-0")} />
      <span className={cn(SIDE_TAB_TITLE_CLASS, "truncate")}>Home</span>
    </span>
  );
}

/**
 * The vertical strip's own frame: a top block (history, New task, the
 * collapse toggle, Home), the tab entries as a column, and a foot holding the
 * header-hosted readings and the header's own glyphs - the trailing half of
 * today's top bar, moved down here because the header itself does not draw
 * while the strip is vertical (S-03, ticket 11).
 *
 * Takes no size, padding or edge: the border that meets the canvas, the
 * strip's width and its placement in the frame all stay with the caller,
 * exactly as the rest of this file's exports take no size of their own.
 */
export function AppFrameSideStrip({
  values,
  arrangement,
}: AppFrame): ReactNode {
  return (
    <div data-testid="app-frame-side-strip" className="flex flex-1 flex-col">
      <div className="flex items-center gap-1 p-2">
        <ArrowLeft
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <ArrowRight
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="flex-1" />
        <Plus aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <PanelLeft
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
      </div>
      <AppFrameSideHomeRow values={values} />
      <AppFrameTabEntries
        values={values}
        arrangement={arrangement}
        layout="column"
      />
      <span className="flex-1" />
      <div
        data-testid="app-frame-side-strip-foot"
        className="flex flex-wrap items-center gap-1 p-2"
      >
        <AppFrameBarCluster
          host="header"
          side="left"
          values={values}
          arrangement={arrangement}
        />
        <AppFrameBarCluster
          host="header"
          side="right"
          values={values}
          arrangement={arrangement}
        />
        <History
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <Bell aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="size-5 shrink-0 rounded-full border border-border bg-foreground/10" />
      </div>
    </div>
  );
}

/**
 * The dock and the composer as the app assembles them (L-97, L-99): the
 * compact pills above the composer's left edge, the full-size rows in one
 * joined frame whose bottom edge disappears under the box, and the box itself.
 *
 * One stack rather than three parts, because the tuck only exists while the
 * frame touches the composer: anything a caller could put between them would
 * break it, and one of the two callers used to.
 */
export function AppFrameComposerStack({
  values,
  arrangement,
}: AppFrame): ReactNode {
  return (
    <div className="flex w-full flex-col">
      <AppFrameDock values={values} arrangement={arrangement} />
      <AppFrameComposerBox values={values} arrangement={arrangement} />
    </div>
  );
}

/**
 * The dock, split the way the canvas splits it.
 *
 * The pills go ABOVE the joined frame, both at the composer's left edge. Drawn
 * as separate cards, the Compact card had nothing left to claim: the fold to
 * chips IS the claim (G1-02), so the two shapes have to look different from
 * each other here.
 */
function AppFrameDock({ values, arrangement }: AppFrame): ReactNode {
  const shown = arrangement.dock.filter(
    (regionId) => values[regionId].shown === "shown",
  );
  const rows = shown.filter((regionId) => values[regionId].size === "full");
  const chips = shown.filter((regionId) => values[regionId].size === "chip");
  if (rows.length === 0 && chips.length === 0) return null;
  return (
    <div
      data-testid="app-frame-dock"
      className={cn(
        "flex flex-col gap-1.5",
        // `-mb-px` over a frame with no bottom border: the seam between the
        // dock and the composer is one line, not two touching ones. With no
        // frame there is nothing to tuck, and the pills keep their own gap.
        rows.length > 0 ? "-mb-px" : "mb-1.5",
      )}
    >
      {chips.length === 0 ? null : (
        <div
          data-testid="app-frame-dock-chips"
          className="flex items-center gap-1.5"
        >
          {chips.map((regionId) => (
            <span key={regionId}>
              {/* Framed as a chip because its VALUES say so, which is what
                `hostContextFor` reads; this list is the chip-sized members. */}
              {depictRegion(regionId, values[regionId], arrangement)}
            </span>
          ))}
        </div>
      )}
      {rows.length === 0 ? null : depictDockRows(rows, values, arrangement)}
    </div>
  );
}

/**
 * The composer: a box with the prompt line above its two toolbar clusters.
 *
 * A box and nothing more. What the composer LOOKS like inside is the
 * depictions' business.
 *
 * `bg-foreground/3` rather than `bg-card`, for the reason I-03 exists: every
 * dark preset defines `--card` as `--background`, so a `bg-card` box on this
 * frame is a border around nothing. It is also the real composer shell's own
 * material.
 */
function AppFrameComposerBox({ values, arrangement }: AppFrame): ReactNode {
  return (
    <div
      data-testid="app-frame-composer"
      className="rounded-xl border border-border bg-foreground/3 px-3 pt-2.5 pb-2"
    >
      <div className="pb-4 text-ui-sm text-muted-foreground">
        Describe the next change...
      </div>
      <div className="flex items-center">
        <AppFrameToolbarCluster
          regionIds={arrangement.toolbarLeft}
          values={values}
          arrangement={arrangement}
        />
        <span className="flex-1" />
        <AppFrameToolbarCluster
          regionIds={arrangement.toolbarRight}
          values={values}
          arrangement={arrangement}
        />
        <span className="ml-1.5 size-6 shrink-0 rounded-full border border-border bg-foreground/10" />
      </div>
    </div>
  );
}

function AppFrameToolbarCluster(props: {
  readonly regionIds: ReadonlyArray<ToolbarRegionId>;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionIds, values, arrangement } = props;
  return (
    <div className="flex items-center gap-1.5">
      {regionIds.map((regionId) => (
        <AppFrameRegion
          key={regionId}
          regionId={regionId}
          values={values}
          arrangement={arrangement}
        />
      ))}
    </div>
  );
}

/**
 * The status strip's ordered children, and nothing else.
 *
 * Which of the two readings leads and where the spacer goes is ASSEMBLY
 * rather than placement, and it lives here once: the preset card and the
 * Settings band draw the strip through this, so they cannot disagree about it
 * (R1-04, R2-02).
 *
 * The bar's own BOX stays with each caller, and so does each one's answer for
 * a strip with nothing left in it, because those two genuinely differ: the
 * miniature draws no strip at all, the page's band draws a sentence saying
 * where its readings went.
 */
export function AppFrameStatusBarRow({
  values,
  arrangement,
}: AppFrame): ReactNode {
  return (
    <>
      <AppFrameBarCluster
        host="status-bar"
        side="left"
        values={values}
        arrangement={arrangement}
      />
      <span className="flex-1" />
      <AppFrameBarCluster
        host="status-bar"
        side="right"
        values={values}
        arrangement={arrangement}
      />
    </>
  );
}

/**
 * One end of one bar: the readings that named it, in the model's own order
 * (L-156).
 *
 * Both bars draw their clusters through this, so the picture cannot put the
 * monitor ahead of the usage limits in one place and behind it in another -
 * and neither bar has to know which regions can move.
 */
function AppFrameBarCluster(props: {
  readonly host: BarHost;
  readonly side: EdgeSide;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { host, side, values, arrangement } = props;
  return barClusterRegions(arrangement, host, side).map(
    (regionId: BarRegionId) => (
      <AppFrameRegion
        key={regionId}
        regionId={regionId}
        values={values}
        arrangement={arrangement}
      />
    ),
  );
}

/**
 * The real rail: the arrangement's own entries, dividers and stacks included
 * (L-155, L-166), in the order the list beside them is in. Each panel brings
 * its own rail frame, so this adds no spacing of its own.
 *
 * A stacked pair is drawn inside the same capsule the real rail draws, through
 * the same component (L-11, L-167): the card is a picture of the app at rest,
 * and at rest two joined icons are one object.
 *
 * A panel the user hid leaves a gap exactly as it leaves one in the rail;
 * `auto` is not off, so only `hidden` does. It leaves its capsule too, which
 * is what `railDisplayEntries` answers for every rail at once.
 */
export function AppFrameRailEntries({
  values,
  arrangement,
}: AppFrame): ReactNode {
  return railDisplayEntries(
    arrangement.rail,
    (regionId) => values[regionId].shown !== "hidden",
  ).map((entry) => {
    if (entry.kind === "divider") {
      // The space a divider is at rest, and nothing else (L-11, L-140): a
      // preset card is a picture of the app AT REST, and there a divider draws
      // the column's own gap again rather than a line. The hairline this used
      // to draw was a picture of something the sidebar never shows.
      return <span key={entry.id} className="h-1 w-full shrink-0" />;
    }
    if (entry.kind === "stack") {
      return (
        <LeftPanelRailStack
          key={entry.id}
          stackId={entry.id}
          orientation="vertical"
          first={depictRailRegion(entry.top, values, arrangement)}
          second={depictRailRegion(entry.bottom, values, arrangement)}
        />
      );
    }
    return (
      <span key={entry.id}>
        {depictRailRegion(entry.id, values, arrangement)}
      </span>
    );
  });
}

function depictRailRegion(
  regionId: RailRegionId,
  values: LayoutValues,
  arrangement: LayoutArrangement,
): ReactNode {
  return depictRegion(regionId, values[regionId], arrangement);
}

/**
 * One region, drawn only where the surface really draws it.
 *
 * There are exactly TWO askers of "is this drawn", and they ask different
 * questions: this one, whose regions have a two-state `shown`, and
 * `AppFrameRailEntries` above, because `RailValues.shown` is
 * `auto | shown | hidden` and `auto` is the shipped default for all nine
 * panels (L-93) - so `!== "shown"` would hide every panel nobody has touched.
 *
 * The parameter excludes `RailRegionId` for that reason (R2-06): the signature
 * used to invite a caller to draw a rail panel through here, and every
 * untouched panel would have vanished from that picture with nothing red
 * anywhere.
 */
export function AppFrameRegion<
  K extends Exclude<RegionId, RailRegionId>,
>(props: {
  readonly regionId: K;
  readonly values: LayoutValues;
  readonly arrangement: LayoutArrangement;
}): ReactNode {
  const { regionId, values, arrangement } = props;
  const regionValues = values[regionId];
  if (regionValues.shown !== "shown") return null;
  return depictRegion(regionId, regionValues, arrangement);
}
