import type { ReactNode } from "react";
import { Bell, History } from "lucide-react";
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
 * one of them on a stage - so nothing here takes a size, a padding or a flag.
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
